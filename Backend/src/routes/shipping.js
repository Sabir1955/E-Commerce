const router = require("express").Router();
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const PickupLocation = require("../models/PickupLocation");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const shiprocket = require("../services/shiprocket");
const { notifyOrderStage } = require("../services/orderNotifications");
router.use(requireAuth);
router.post("/:orderId/shiprocket", requireAdmin, async (req, res) => {
  const order = await Order.findById(req.params.orderId).populate("user");
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.stockReleasedAt) return res.status(409).json({ message: "Stock is no longer reserved for this order; resolve the inventory review before shipping" });
  const payment = await Payment.findOne({ order: order._id });
  if (order.paymentStatus !== "paid") {
    if (!payment || payment.method !== "cod") {
      return res.status(409).json({ message: "Shipment can be created only after payment is successful" });
    }
  }
  if (!["packed", "pickup_requested"].includes(order.status)) {
    return res.status(409).json({ message: "Admin must mark the order as packed before creating a shipment" });
  }
  await order.populate("items.product", "sku weight dimensions");
  const locationFilter = req.body.pickupLocationId
    ? { _id: req.body.pickupLocationId, active: true }
    : { active: true, isDefault: true };
  const pickupLocation = await PickupLocation.findOne(locationFilter);
  if (!pickupLocation) {
    return res.status(400).json({ message: "Select an active pickup location before creating a shipment" });
  }
  const shipment = await shiprocket.createShipment({ order_id: String(order._id), order_date: order.createdAt.toISOString(),
    pickup_location: pickupLocation.name, billing_customer_name: order.user.name,
    billing_customer_email: order.user.email, billing_customer_phone: order.shippingAddress.mobile || order.shippingAddress.phone,
    billing_address: order.shippingAddress.address || order.shippingAddress.line1, billing_city: order.shippingAddress.city,
    billing_pincode: order.shippingAddress.postalCode, billing_state: order.shippingAddress.state,
    billing_country: order.shippingAddress.country || "India", shipping_is_billing: true,
    order_items: order.items.map((item) => ({
      name: item.name,
      sku: item.product?.sku || String(item.product?._id || item.product),
      units: item.quantity,
      selling_price: item.price
    })),
    payment_method: payment?.method === "cod" ? "COD" : "Prepaid",
    sub_total: order.total,
    length: Math.max(10, ...order.items.map((item) => item.product?.dimensions?.length || 0)),
    breadth: Math.max(10, ...order.items.map((item) => item.product?.dimensions?.width || 0)),
    height: Math.max(10, ...order.items.map((item) => item.product?.dimensions?.height || 0)),
    weight: order.items.reduce((total, item) => total + (item.product?.weight || 0.5) * item.quantity, 0)
  });
  const shipmentData = shipment.data || shipment;
  order.shipment = {
    provider: "shiprocket",
    shipmentId: String(shipmentData.shipment_id || shipmentData.order_id || ""),
    awb: shipmentData.awb_code || shipmentData.awb || undefined,
    pickupLocation: pickupLocation.name,
    pickupRequestedAt: new Date()
  };
  order.status = "pickup_requested";
  order.trackingEvents.push({ status: "pickup_requested", description: "Courier pickup requested", location: pickupLocation.city });
  await order.save();
  res.status(201).json({ pickupLocation, shipment, order });
});

router.patch("/:orderId/picked-up", requireAdmin, async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (!order.shipment || !order.shipment.pickupRequestedAt) {
    return res.status(400).json({ message: "Create a shipment before confirming courier pickup" });
  }
  order.status = "shipped";
  order.shipment.shippedAt = new Date();
  if (req.body.awb) order.shipment.awb = req.body.awb;
  order.trackingEvents.push({ status: "shipped", description: "Courier collected the package", location: order.shipment.pickupLocation });
  await order.save();
  await notifyOrderStage(order, "shipped", order.shipment.awb ? `Tracking number: ${order.shipment.awb}` : "");
  res.json(order);
});
router.get("/:awb/track", async (req, res) => res.json(await shiprocket.trackShipment(req.params.awb)));
module.exports = router;
