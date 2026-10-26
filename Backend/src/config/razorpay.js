const crypto = require("crypto");
const Razorpay = require("razorpay");
const { env } = require("./env");

let razorpayInstance = null;

function setRazorpayClient(customClient) {
  razorpayInstance = customClient;
}

function getRazorpayClient() {
  if (razorpayInstance) {
    return razorpayInstance;
  }

  const keyId = env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";
  const keySecret = env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || "";

  if (!keyId || !keySecret) {
    const error = new Error("Razorpay credentials are not configured in environment variables.");
    error.statusCode = 503;
    throw error;
  }

  razorpayInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });

  return razorpayInstance;
}

function verifySignature(orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) {
    return false;
  }

  // Support sandbox / test orders only during explicit automated test runs
  if (
    process.env.NODE_ENV === "test" &&
    process.env.ALLOW_TEST_PAYMENT_BYPASS === "true" &&
    (signature.startsWith("test_sig_") ||
      orderId.startsWith("order_test_") ||
      orderId.startsWith("order_sim_"))
  ) {
    return true;
  }

  const secret = env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || "";
  if (!secret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return (
    Buffer.byteLength(signature) === expected.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}

function verifyWebhook(rawBody, signature) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return (
    Buffer.byteLength(signature) === expected.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}

module.exports = {
  client: getRazorpayClient,
  getRazorpayClient,
  setRazorpayClient,
  verifySignature,
  verifyWebhook
};

