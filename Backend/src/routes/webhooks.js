const router = require("express").Router();
const Payment = require("../models/Payment");
const Order = require("../models/Order");
const { verifyWebhook } = require("../config/razorpay");
const { notifyOrderStage } = require("../services/orderNotifications");
const { confirmOrderPayment, restoreOrderStock } = require("../services/orderInventory");

router.post("/razorpay", require("express").raw({ type: "application/json" }), async (req, res) => {
  if (!verifyWebhook(req.body, req.headers["x-razorpay-signature"])) return res.status(400).json({ message: "Invalid webhook signature" });
  const event = JSON.parse(req.body.toString("utf8"));
  const entity = event.payload && event.payload.payment && event.payload.payment.entity;
  if (entity && entity.order_id) {
    const status = event.event === "payment.captured" ? "paid" : event.event === "payment.failed" ? "failed" : null;
    if (status) {
      const payment = await Payment.findOneAndUpdate(
        { transactionId: entity.order_id },
        { status, transactionId: entity.id },
        { new: true }
      );
      const order = payment
        ? await Order.findById(payment.order)
        : await Order.findOne({ _id: entity.notes && entity.notes.orderId });
      if (order && status === "paid" && order.paymentStatus !== "paid") {
        const inventoryReserved = await confirmOrderPayment(order);
        if (inventoryReserved) await notifyOrderStage(order, "payment_successful");
        else {
          order.paymentStatus = "paid";
          order.trackingEvents.push({ status: "payment_review", description: "Payment captured after stock reservation expired; inventory requires review" });
          await order.save();
        }
      } else if (order && status === "failed") {
        order.paymentStatus = "failed";
        await order.save();
        if (payment && payment.method !== "cod") await restoreOrderStock(order);
      }
    }
  }
  res.json({ received: true });
});
module.exports = router;
