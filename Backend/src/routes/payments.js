const router = require("express").Router();
const Payment = require("../models/Payment");
const Order = require("../models/Order");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { client, verifySignature, verifyWebhook } = require("../config/razorpay");
const { notifyOrderStage } = require("../services/orderNotifications");
const { confirmOrderPayment, restoreOrderStock } = require("../services/orderInventory");

router.use(requireAuth);

router.post("/:orderId/razorpay", async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.paymentStatus === "paid") {
    return res.status(409).json({ message: "Order payment is already completed" });
  }
  if (order.stockReleasedAt) return res.status(409).json({ message: "This payment reservation expired. Please create a new order." });
  if (req.body.method !== undefined && !["upi", "card"].includes(req.body.method)) {
    return res.status(400).json({ message: "Online payment method must be upi or card" });
  }
  const razorpayOrder = await client().orders.create({ amount: Math.round(order.total * 100), currency: "INR",
    receipt: String(order._id), notes: { orderId: String(order._id) } });
  await Payment.findOneAndUpdate(
    { order: order._id },
    { method: req.body.method || "upi", provider: "razorpay", amount: order.total, status: "pending", transactionId: razorpayOrder.id, gatewayOrderId: razorpayOrder.id },
    { upsert: true, new: true, runValidators: true }
  );
  res.status(201).json({ razorpayOrder, keyId: process.env.RAZORPAY_KEY_ID });
});

router.post("/:orderId/easebuzz", async (req, res) => {
  const paymentsService = require("../modules/payments/payments.service");
  const result = await paymentsService.createEasebuzzOrder(req.params.orderId, req.user);
  res.status(201).json(result);
});

router.post("/:orderId/initiate", async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (!["upi", "card"].includes(req.body.method)) {
    return res.status(400).json({ message: "Online payment method must be upi or card" });
  }
  if (order.paymentStatus === "paid") {
    return res.status(409).json({ message: "Order payment is already completed" });
  }
  if (order.stockReleasedAt) return res.status(409).json({ message: "This payment reservation expired. Please create a new order." });
  const payment = await Payment.findOneAndUpdate(
    { order: order._id },
    { method: req.body.method, provider: "razorpay", amount: order.total, status: "pending" },
    { new: true, upsert: true, runValidators: true }
  );
  res.status(201).json({
    payment,
    message: "Payment initiated. Verify it with the payment provider before marking it paid."
  });
});

router.post("/:orderId/verify", async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found" });
  const { razorpayOrderId, transactionId, signature } = req.body;
  if (!razorpayOrderId || !transactionId || !signature) {
    return res.status(400).json({ message: "razorpayOrderId, transactionId, and signature are required" });
  }
  const paymentRecord = await Payment.findOne({ order: order._id });
  if (!verifySignature(razorpayOrderId, transactionId, signature)) {
    return res.status(400).json({ message: "Invalid Razorpay signature" });
  }
  if (order.paymentStatus === "paid") {
    if (paymentRecord?.status === "paid" && paymentRecord.transactionId === transactionId) {
      return res.json({ payment: paymentRecord, order });
    }
    return res.status(409).json({ message: "Order payment is already completed" });
  }
  if (!paymentRecord || paymentRecord.transactionId !== razorpayOrderId) {
    return res.status(400).json({ message: "Razorpay order does not match this payment" });
  }
  if (!await confirmOrderPayment(order)) {
    await Payment.findOneAndUpdate({ order: order._id }, { status: "paid", transactionId });
    order.paymentStatus = "paid";
    order.trackingEvents.push({ status: "payment_review", description: "Payment captured after stock reservation expired; inventory requires review" });
    await order.save();
    return res.status(409).json({ message: "Payment was received after stock reservation expired and inventory is unavailable; contact support for a refund." });
  }
  const payment = await Payment.findOneAndUpdate(
    { order: order._id },
    { status: "paid", transactionId },
    { new: true }
  );
  if (!payment) return res.status(404).json({ message: "Payment not found" });
  await notifyOrderStage(order, "payment_successful");
  res.json({ payment, order });
});

router.get("/:orderId", async (req, res) => {
  const filter = req.user.role === "admin"
    ? { _id: req.params.orderId }
    : { _id: req.params.orderId, user: req.user._id };
  const order = await Order.findOne(filter);
  if (!order) return res.status(404).json({ message: "Order not found" });
  const payment = await Payment.findOne({ order: order._id });
  res.json({ payment });
});

module.exports = router;
