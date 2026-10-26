const razorpayConfig = require("../config/razorpay");

module.exports = {
  client: razorpayConfig.getRazorpayClient,
  getRazorpayClient: razorpayConfig.getRazorpayClient,
  setRazorpayClient: razorpayConfig.setRazorpayClient,
  verifySignature: razorpayConfig.verifySignature,
  verifyWebhook: razorpayConfig.verifyWebhook
};
