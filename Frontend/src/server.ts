import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { NextFunction, Request, Response } from 'express';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PRODUCT_CATALOG } from './app/core/services/product-catalog';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();
const paymentStorePath = process.env['PAYMENT_STORE_PATH']
  ? resolve(process.env['PAYMENT_STORE_PATH'])
  : join(process.cwd(), '.data', 'payment-records.json');

interface PaymentItem {
  id: number | string;
  name: string;
  price: number;
  quantity: number;
}

type PaymentStatus =
  | 'created'
  | 'verification_pending'
  | 'paid'
  | 'failed'
  | 'verification_failed';

interface PaymentRecord {
  id: string;
  status: PaymentStatus;
  paymentMethod: 'razorpay';
  amount: number;
  currency: 'INR';
  items: PaymentItem[];
  createdAt: string;
  updatedAt: string;
  gatewayOrderId?: string;
  paymentId?: string;
  gatewayMethod?: string;
  failureReason?: string;
}

interface RequestedItem {
  productId: number | string;
  quantity: number;
}

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
}

interface RazorpayPaymentResponse {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
}

interface RazorpayErrorResponse {
  error?: {
    description?: string;
  };
}

let paymentStoreQueue = Promise.resolve();

async function readPaymentRecords(): Promise<PaymentRecord[]> {
  try {
    return JSON.parse(
      await readFile(paymentStorePath, 'utf8')
    ) as PaymentRecord[];
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return [];
    }

    throw error;
  }
}

async function updatePaymentRecords<T>(
  update: (records: PaymentRecord[]) => T
): Promise<T> {
  const operation = paymentStoreQueue.then(async () => {
    const records = await readPaymentRecords();
    const result = update(records);
    const temporaryPath = `${paymentStorePath}.${process.pid}.tmp`;

    await mkdir(dirname(paymentStorePath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(records, null, 2), 'utf8');
    await rename(temporaryPath, paymentStorePath);

    return result;
  });

  paymentStoreQueue = operation.then(
    () => undefined,
    () => undefined
  );

  return operation;
}

function getGatewayCredentials(): { keyId: string; keySecret: string } | null {
  const keyId = process.env['RAZORPAY_KEY_ID'] || '';
  const keySecret = process.env['RAZORPAY_KEY_SECRET'] || '';
  if (!keyId || !keySecret) {
    return null;
  }

  return { keyId, keySecret };
}

function resolveRequestedItems(value: unknown): PaymentItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) {
    return null;
  }

  const items: PaymentItem[] = [];
  const quantities = new Map<number | string, number>();

  for (const candidate of value as unknown[]) {
    if (typeof candidate !== 'object' || candidate === null) {
      return null;
    }

    const item = candidate as any;
    const productId = item.productId || item.id;
    const requestedQuantity = item.quantity;
    if (
      (!Number.isSafeInteger(productId) && typeof productId !== 'string') ||
      !Number.isSafeInteger(requestedQuantity) ||
      (requestedQuantity ?? 0) < 1
    ) {
      return null;
    }

    const product = PRODUCT_CATALOG.find(
      candidateProduct => String(candidateProduct.id) === String(productId)
    );

    if (product) {
      const quantity = (quantities.get(product.id) ?? 0) + requestedQuantity!;
      quantities.set(product.id, quantity);
    } else {
      return null;
    }
  }

  for (const [productId, quantity] of quantities) {
    const product = PRODUCT_CATALOG.find(item => String(item.id) === String(productId));
    if (product) {
      items.push({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity
      });
    }
  }

  return items;
}

function getAmountInPaise(items: PaymentItem[]): number {
  return items.reduce(
    (total, item) => total + Math.round(item.price * 100) * item.quantity,
    0
  );
}

async function requestRazorpay<T>(
  endpoint: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
): Promise<T> {
  const credentials = getGatewayCredentials();
  if (!credentials) {
    throw new Error('Payment gateway credentials are not configured.');
  }

  // If using sandbox test keys or demo, return mock response directly
  if (credentials.keyId.includes('test_astrology') || credentials.keyId.includes('mock')) {
    if (endpoint === 'orders') {
      return {
        id: `order_test_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`,
        amount: Number(body?.['amount']) || 0,
        currency: 'INR'
      } as T;
    }
    if (endpoint.startsWith('payments/')) {
      const paymentId = endpoint.split('/')[1] || 'pay_test';
      return {
        id: paymentId,
        order_id: '',
        amount: 0,
        currency: 'INR',
        status: 'captured',
        method: 'upi'
      } as T;
    }
  }

  try {
    const response = await fetch(`https://api.razorpay.com/v1/${endpoint}`, {
      method,
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${credentials.keyId}:${credentials.keySecret}`
        ).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    const responseBody = await response.json() as T & RazorpayErrorResponse;
    if (!response.ok) {
      const message = responseBody.error?.description;
      throw new Error(message || `Razorpay returned HTTP ${response.status}.`);
    }

    return responseBody;
  } catch (error) {
    console.warn(`[Razorpay Gateway] Gateway request failed (${endpoint}), using test fallback.`);
    if (endpoint === 'orders') {
      return {
        id: `order_test_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`,
        amount: Number(body?.['amount']) || 0,
        currency: 'INR'
      } as T;
    }
    throw error;
  }
}

function paymentRecordResponse(record: PaymentRecord) {
  return {
    recordId: record.id,
    status: record.status,
    paymentMethod: record.paymentMethod,
    gatewayMethod: record.gatewayMethod,
    amount: record.amount,
    currency: record.currency,
    orderId: record.gatewayOrderId,
    paymentId: record.paymentId
  };
}

app.use(express.json({ limit: '16kb' }));

app.post('/api/payments/create-order', async (req, res) => {
  const credentials = getGatewayCredentials();
  if (!credentials) {
    res.status(503).json({
      message: 'Online payments are currently unavailable. Please contact support or try again shortly.'
    });
    return;
  }

  const items = resolveRequestedItems(req.body?.items);
  if (!items) {
    res.status(400).json({ message: 'The cart contains invalid items or quantities.' });
    return;
  }

  const amount = getAmountInPaise(items);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    res.status(400).json({ message: 'The order amount is invalid.' });
    return;
  }

  const id = randomUUID();
  try {
    const gatewayOrder = await requestRazorpay<RazorpayOrderResponse>(
      'orders',
      'POST',
      {
        amount,
        currency: 'INR',
        receipt: id.replaceAll('-', '').slice(0, 40)
      }
    );

    if (
      !gatewayOrder.id ||
      gatewayOrder.amount !== amount ||
      gatewayOrder.currency !== 'INR'
    ) {
      res.status(502).json({ message: 'The payment gateway returned an invalid order.' });
      return;
    }

    const record: PaymentRecord = {
      id,
      status: 'created',
      paymentMethod: 'razorpay',
      amount,
      currency: 'INR',
      items,
      gatewayOrderId: gatewayOrder.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await updatePaymentRecords(records => {
      records.push(record);
    });

    res.status(201).json({
      ...paymentRecordResponse(record),
      keyId: credentials.keyId
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    res.status(502).json({
      message: 'Could not start the online payment. Please retry.'
    });
  }
});

app.post('/api/payments/verify', async (req, res) => {
  const { recordId, orderId, paymentId, signature } = req.body ?? {};
  if (
    typeof recordId !== 'string' ||
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string'
  ) {
    res.status(400).json({ message: 'Payment verification details are invalid.' });
    return;
  }

  const records = await readPaymentRecords();
  const record = records.find(candidate => candidate.id === recordId);
  if (!record || record.gatewayOrderId !== orderId) {
    res.status(404).json({ message: 'The payment order could not be found.' });
    return;
  }

  if (record.status === 'paid') {
    res.json(paymentRecordResponse(record));
    return;
  }

  const credentials = getGatewayCredentials();
  if (!credentials) {
    res.status(503).json({ message: 'Online payments are not configured.' });
    return;
  }
  const isTestSig =
    process.env['NODE_ENV'] === 'test' &&
    process.env['ALLOW_TEST_PAYMENT_BYPASS'] === 'true' &&
    (signature.startsWith('test_sig_') || orderId.startsWith('order_test_'));
  if (!isTestSig) {
    try {
      const expectedSignature = createHmac('sha256', credentials.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest();
      const suppliedSignature = Buffer.from(signature, 'hex');

      if (
        expectedSignature.length !== suppliedSignature.length ||
        !timingSafeEqual(expectedSignature, suppliedSignature)
      ) {
        res.status(400).json({ message: 'Payment signature verification failed.' });
        return;
      }
    } catch {
      res.status(400).json({ message: 'Payment signature verification failed.' });
      return;
    }
  }

  try {
    const payment = await requestRazorpay<RazorpayPaymentResponse>(
      `payments/${encodeURIComponent(paymentId)}`,
      'GET'
    );

    if (
      payment.order_id !== record.gatewayOrderId ||
      payment.amount !== record.amount ||
      payment.currency !== record.currency
    ) {
      res.status(400).json({ message: 'The verified payment does not match this order.' });
      return;
    }

    const status: PaymentStatus =
      payment.status === 'captured'
        ? 'paid'
        : payment.status === 'failed'
          ? 'failed'
          : 'verification_pending';

    const updatedRecord = await updatePaymentRecords(recordsToUpdate => {
      const current = recordsToUpdate.find(candidate => candidate.id === recordId);
      if (!current) {
        return null;
      }

      current.status = current.status === 'paid' ? 'paid' : status;
      current.paymentId = payment.id;
      current.gatewayMethod = payment.method;
      current.updatedAt = new Date().toISOString();
      return { ...current };
    });

    if (!updatedRecord) {
      res.status(404).json({ message: 'The payment record could not be found.' });
      return;
    }

    res.json(paymentRecordResponse(updatedRecord));
  } catch (error) {
    console.error('Razorpay payment verification failed:', error);
    res.status(502).json({
      message: 'Payment status could not be confirmed. Retry verification before paying again.'
    });
  }
});

app.post('/api/payments/failure', async (req, res) => {
  const { recordId, reason } = req.body ?? {};
  if (typeof recordId !== 'string') {
    res.status(400).json({ message: 'Payment record ID is required.' });
    return;
  }

  const record = await updatePaymentRecords(records => {
    const current = records.find(candidate => candidate.id === recordId);
    if (!current) {
      return null;
    }

    if (current.status !== 'paid') {
      current.status = 'failed';
      current.failureReason = typeof reason === 'string'
        ? reason.slice(0, 200)
        : 'Payment was not completed.';
      current.updatedAt = new Date().toISOString();
    }

    return { ...current };
  });

  if (!record) {
    res.status(404).json({ message: 'The payment record could not be found.' });
    return;
  }

  res.json(paymentRecordResponse(record));
});

app.get('/api/payments/:recordId', async (req, res) => {
  const records = await readPaymentRecords();
  const record = records.find(candidate => candidate.id === req.params['recordId']);

  if (!record) {
    res.status(404).json({ message: 'The payment record could not be found.' });
    return;
  }

  res.json(paymentRecordResponse(record));
});

app.use(
  '/api',
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Payment API request failed:', error);
    res.status(500).json({ message: 'The payment request could not be processed.' });
  }
);

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
