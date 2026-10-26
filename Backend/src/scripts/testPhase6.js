require("dotenv").config();
const http = require("http");
const crypto = require("crypto");
const mongoose = require("mongoose");
const app = require("../app");
const { connectDatabase } = require("../config/database");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const { setRazorpayClient } = require("../config/razorpay");

async function testPhase6() {
  console.log("==========================================");
  console.log("Running Phase 6 Razorpay Payment Gateway Tests");
  console.log("==========================================\n");

  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  let customer1Token = "";
  let customer1User = null;
  let customer2Token = "";
  let customer2User = null;
  let adminToken = "";
  let sampleProduct = null;
  let onlineOrder = null;

  const testKeySecret = "mock_razorpay_secret_key_789";
  const testWebhookSecret = "mock_webhook_secret_key_456";

  try {
    // 0. Setup two customers and one admin
    const timestamp = Date.now();
    const c1Res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Payment Tester 1",
        email: `pay_tester1_${timestamp}@example.com`,
        mobile: `+9191${String(timestamp).slice(-8)}`,
        password: "Password@123",
        confirmPassword: "Password@123"
      })
    });
    const c1Data = await c1Res.json();
    customer1Token = c1Data.token;
    customer1User = c1Data.user;

    const c2Res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Payment Tester 2",
        email: `pay_tester2_${timestamp}@example.com`,
        mobile: `+9192${String(timestamp).slice(-8)}`,
        password: "Password@123",
        confirmPassword: "Password@123"
      })
    });
    const c2Data = await c2Res.json();
    customer2Token = c2Data.token;
    customer2User = c2Data.user;

    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "astro@gmail.com",
        password: "Astro@12345"
      })
    });
    const adminData = await adminLoginRes.json();
    adminToken = adminData.token;

    sampleProduct = await Product.findOne({ active: true, stock: { $gte: 10 } });
    if (!sampleProduct) {
      throw new Error("Active product with stock >= 10 is required");
    }

    // Create an online order for customer 1 (awaiting_payment)
    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customer1Token}`
      },
      body: JSON.stringify({
        items: [{ product: sampleProduct._id.toString(), quantity: 1 }],
        shippingAddress: {
          fullName: "Payment Tester 1",
          mobile: "+919876543210",
          address: "123 Temple Road",
          city: "Haridwar",
          state: "Uttarakhand",
          postalCode: "249401",
          country: "India"
        },
        paymentMethod: "upi"
      })
    });
    const orderBody = await orderRes.json();
    onlineOrder = orderBody.data?.order || orderBody.order || orderBody.data;

    // 1. Unauthenticated payment endpoints return 401
    await check("1. GET and POST /api/payments/:orderId unauthenticated return 401", async () => {
      const getRes = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}`);
      if (getRes.status !== 401) throw new Error(`Expected 401, got ${getRes.status}`);

      const postRes = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "upi" })
      });
      if (postRes.status !== 401) throw new Error(`Expected 401, got ${postRes.status}`);
    });

    // 2. Customer cannot view or initiate payment for another customer's order
    await check("2. Customer cannot access another customer's payment (404 Not Found)", async () => {
      const res = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}`, {
        headers: { Authorization: `Bearer ${customer2Token}` }
      });
      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    });

    // 3. POST /api/payments/:orderId/razorpay returns explicit 503 when credentials missing
    await check("3. POST /api/payments/:orderId/razorpay returns 503 when credentials missing", async () => {
      // Ensure no credentials currently in env
      const origKey = process.env.RAZORPAY_KEY_ID;
      const origSecret = process.env.RAZORPAY_KEY_SECRET;
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      setRazorpayClient(null);

      const res = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({ method: "upi" })
      });

      if (res.status !== 503) {
        throw new Error(`Expected 503 Service Unavailable, got ${res.status}`);
      }
      const body = await res.json();
      if (!body.message || !body.message.includes("Razorpay credentials are not configured")) {
        throw new Error(`Unexpected message: ${body.message}`);
      }

      // Restore
      if (origKey) process.env.RAZORPAY_KEY_ID = origKey;
      if (origSecret) process.env.RAZORPAY_KEY_SECRET = origSecret;
    });

    // 4. POST /api/payments/:orderId/initiate initializes pending payment record
    await check("4. POST /api/payments/:orderId/initiate validates method and creates pending record", async () => {
      // 4a. Invalid method
      const badRes = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({ method: "bitcoin" })
      });
      if (badRes.status !== 400) throw new Error(`Expected 400 for invalid method, got ${badRes.status}`);

      // 4b. Valid method (card)
      const res = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({ method: "card" })
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      const body = await res.json();
      const payment = body.data?.payment || body.data;
      if (!payment || payment.status !== "pending" || payment.method !== "card") {
        throw new Error(`Invalid payment state: ${JSON.stringify(payment)}`);
      }
    });

    // 5. POST /api/payments/:orderId/razorpay with mock client creates gateway order
    let generatedGatewayOrderId = "order_mock_" + Date.now();
    await check("5. POST /api/payments/:orderId/razorpay with injected client creates gateway order", async () => {
      // Mock Razorpay client instance
      const mockClient = {
        orders: {
          create: async (params) => {
            if (params.amount !== Math.round(onlineOrder.total * 100)) {
              throw new Error(`Incorrect amount: expected ${Math.round(onlineOrder.total * 100)}, got ${params.amount}`);
            }
            return {
              id: generatedGatewayOrderId,
              amount: params.amount,
              currency: params.currency,
              receipt: params.receipt,
              status: "created"
            };
          }
        }
      };

      setRazorpayClient(mockClient);
      process.env.RAZORPAY_KEY_ID = "rzp_test_mockKey123";
      process.env.RAZORPAY_KEY_SECRET = testKeySecret;

      const res = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({ method: "upi" })
      });

      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Expected 201, got ${res.status}: ${text}`);
      }

      const body = await res.json();
      const rzpOrder = body.data?.razorpayOrder || body.razorpayOrder;
      if (!rzpOrder || rzpOrder.id !== generatedGatewayOrderId) {
        throw new Error(`Gateway order mismatch: ${JSON.stringify(rzpOrder)}`);
      }

      // Check payment record updated in DB
      const paymentInDb = await Payment.findOne({ order: onlineOrder._id });
      if (paymentInDb.transactionId !== generatedGatewayOrderId) {
        throw new Error(`Expected transactionId=${generatedGatewayOrderId}, got ${paymentInDb.transactionId}`);
      }
    });

    // 6. POST /api/payments/:orderId/verify rejects missing fields and invalid signature
    const samplePaymentId = "pay_mock_" + Date.now();
    await check("6. POST /api/payments/:orderId/verify rejects missing fields & tampered signatures", async () => {
      // 6a. Missing fields
      const missingRes = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({
          razorpayOrderId: generatedGatewayOrderId
          // transactionId and signature omitted
        })
      });
      if (missingRes.status !== 400) throw new Error(`Expected 400 for missing fields, got ${missingRes.status}`);

      // 6b. Invalid signature
      const badSigRes = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({
          razorpayOrderId: generatedGatewayOrderId,
          transactionId: samplePaymentId,
          signature: "invalid_hmac_signature_hex"
        })
      });
      if (badSigRes.status !== 400) throw new Error(`Expected 400 for invalid signature, got ${badSigRes.status}`);
      const badSigBody = await badSigRes.json();
      if (!badSigBody.message?.includes("Invalid Razorpay signature")) {
        throw new Error(`Unexpected error message: ${badSigBody.message}`);
      }
    });

    // 7. POST /api/payments/:orderId/verify confirms valid payment signature
    await check("7. POST /api/payments/:orderId/verify confirms order with valid HMAC signature", async () => {
      const validSignature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${generatedGatewayOrderId}|${samplePaymentId}`)
        .digest("hex");

      const res = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({
          razorpayOrderId: generatedGatewayOrderId,
          transactionId: samplePaymentId,
          signature: validSignature
        })
      });

      if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Expected 200, got ${res.status}: ${text}`);
      }

      const body = await res.json();
      const verifiedPayment = body.data?.payment || body.payment;
      if (!verifiedPayment || verifiedPayment.status !== "paid" || verifiedPayment.transactionId !== samplePaymentId) {
        throw new Error(`Payment verification state mismatch: ${JSON.stringify(verifiedPayment)}`);
      }

      // Check order in DB
      const orderInDb = await Order.findById(onlineOrder._id);
      if (orderInDb.paymentStatus !== "paid" || orderInDb.status !== "placed" || orderInDb.stockReserved !== false) {
        throw new Error(`Order state not confirmed: paymentStatus=${orderInDb.paymentStatus}, status=${orderInDb.status}`);
      }
    });

    // 8. Re-verifying already paid order is idempotent with same transactionId
    await check("8. Re-verifying already paid order is idempotent with same transactionId", async () => {
      const validSignature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${generatedGatewayOrderId}|${samplePaymentId}`)
        .digest("hex");

      const res = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({
          razorpayOrderId: generatedGatewayOrderId,
          transactionId: samplePaymentId,
          signature: validSignature
        })
      });
      if (res.status !== 200) throw new Error(`Expected idempotent 200, got ${res.status}`);
    });

    // 9. Re-verifying with different transactionId returns 409 Conflict
    await check("9. Re-verifying already paid order with different transactionId returns 409", async () => {
      const diffPaymentId = "pay_diff_" + Date.now();
      const diffSignature = crypto
        .createHmac("sha256", testKeySecret)
        .update(`${generatedGatewayOrderId}|${diffPaymentId}`)
        .digest("hex");

      const res = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({
          razorpayOrderId: generatedGatewayOrderId,
          transactionId: diffPaymentId,
          signature: diffSignature
        })
      });
      if (res.status !== 409) throw new Error(`Expected 409 Conflict, got ${res.status}`);
    });

    // 10. GET /api/payments/:orderId returns payment details for customer and admin
    await check("10. GET /api/payments/:orderId allows owner and admin to view payment record", async () => {
      // Owner
      const cRes = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}`, {
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
      if (cRes.status !== 200) throw new Error(`Owner expected 200, got ${cRes.status}`);

      // Admin
      const aRes = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (aRes.status !== 200) throw new Error(`Admin expected 200, got ${aRes.status}`);
    });

    // 11. PATCH /api/payments/:orderId (admin) updates status, non-admin gets 403
    await check("11. PATCH /api/payments/:orderId restricted to admin", async () => {
      // Non-admin customer gets 403
      const nonAdminRes = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({ status: "refunded", transactionId: "rfnd_12345" })
      });
      if (nonAdminRes.status !== 403) throw new Error(`Expected 403 for non-admin, got ${nonAdminRes.status}`);

      // Admin successfully updates
      const adminRes = await fetch(`${baseUrl}/api/payments/${onlineOrder._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: "refunded", transactionId: "rfnd_12345" })
      });
      if (adminRes.status !== 200) throw new Error(`Expected 200 for admin patch, got ${adminRes.status}`);
      const adminBody = await adminRes.json();
      const updatedPayment = adminBody.data?.payment || adminBody.payment || adminBody.data;
      if (updatedPayment.status !== "refunded") {
        throw new Error(`Expected status refunded, got ${updatedPayment.status}`);
      }
    });

    // 12. POST /api/webhooks/razorpay verifies webhook signature and processes events
    await check("12. POST /api/webhooks/razorpay validates HMAC and processes payment events", async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;

      // Create a fresh test order for webhook test
      const webhookOrderRes = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({
          items: [{ product: sampleProduct._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Webhook Tester",
            mobile: "+919876543210",
            address: "456 Ghat Road",
            city: "Varanasi",
            state: "Uttar Pradesh",
            postalCode: "221001",
            country: "India"
          },
          paymentMethod: "upi"
        })
      });
      const webhookOrderBody = await webhookOrderRes.json();
      const webhookOrder = webhookOrderBody.data?.order || webhookOrderBody.order || webhookOrderBody.data;

      const webhookGatewayId = "order_wh_" + Date.now();
      const webhookPaymentId = "pay_wh_" + Date.now();

      await Payment.findOneAndUpdate(
        { order: webhookOrder._id },
        { transactionId: webhookGatewayId, status: "pending", method: "upi", provider: "razorpay", amount: webhookOrder.total },
        { upsert: true }
      );

      const eventPayload = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: webhookPaymentId,
              order_id: webhookGatewayId,
              amount: Math.round(webhookOrder.total * 100),
              status: "captured",
              notes: { orderId: webhookOrder._id.toString() }
            }
          }
        }
      });

      // 12a. Tampered webhook signature -> 400
      const badWhRes = await fetch(`${baseUrl}/api/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": "tampered_hex_signature"
        },
        body: eventPayload
      });
      if (badWhRes.status !== 400) throw new Error(`Expected 400 for bad webhook sig, got ${badWhRes.status}`);

      // 12b. Valid webhook signature -> 200 and captures payment
      const validWhSig = crypto
        .createHmac("sha256", testWebhookSecret)
        .update(eventPayload)
        .digest("hex");

      const goodWhRes = await fetch(`${baseUrl}/api/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": validWhSig
        },
        body: eventPayload
      });
      if (goodWhRes.status !== 200) throw new Error(`Expected 200 for good webhook, got ${goodWhRes.status}`);

      const postWhPayment = await Payment.findOne({ order: webhookOrder._id });
      if (postWhPayment.status !== "paid" || postWhPayment.transactionId !== webhookPaymentId) {
        throw new Error(`Webhook payment capture mismatch: ${JSON.stringify(postWhPayment)}`);
      }

      const postWhOrder = await Order.findById(webhookOrder._id);
      if (postWhOrder.paymentStatus !== "paid") {
        throw new Error(`Webhook order status mismatch: paymentStatus=${postWhOrder.paymentStatus}`);
      }

      // Clean up webhook order
      await Order.deleteOne({ _id: webhookOrder._id });
      await Payment.deleteOne({ order: webhookOrder._id });
    });

  } finally {
    // Cleanup
    if (customer1User) {
      await User.deleteOne({ _id: customer1User._id });
      await Order.deleteMany({ user: customer1User._id });
      if (onlineOrder) {
        await Payment.deleteMany({ order: onlineOrder._id });
      }
    }
    if (customer2User) {
      await User.deleteOne({ _id: customer2User._id });
    }
    setRazorpayClient(null);
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
  }

  console.log("\n==========================================");
  console.log(`Phase 6 Tests Complete: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  testPhase6().catch((err) => {
    console.error("Test runner failed:", err);
    process.exit(1);
  });
}

module.exports = { testPhase6 };
