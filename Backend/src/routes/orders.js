const router = require("express").Router();
const Order = require("../models/Order");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const Payment = require("../models/Payment");
const Address = require("../models/Address");
const ShippingSetting = require("../models/ShippingSetting");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { notifyOrderStage } = require("../services/orderNotifications");
const { pagination, validAddress } = require("../utils/request");
const { createOrderAndPayment, restoreOrderStock, releaseExpiredReservations, confirmOrderPayment } = require("../services/orderInventory");
const Coupon = require("../models/Coupon");

router.post("/", requireAuth, async (req, res) => {
  await releaseExpiredReservations();
  const { items, addressId, shippingAddress: requestedAddress, paymentMethod = "online" } = req.body;
  let shippingAddress = requestedAddress;
  if (addressId) {
    const savedAddress = await Address.findOne({ _id: addressId, user: req.user._id });
    if (!savedAddress) return res.status(404).json({ message: "Saved address not found" });
    shippingAddress = savedAddress.toObject();
    delete shippingAddress._id;
    delete shippingAddress.user;
    delete shippingAddress.createdAt;
    delete shippingAddress.updatedAt;
  }
  const cart = await Cart.findOne({ user: req.user._id });
  const checkoutItems = Array.isArray(items) && items.length ? items : cart?.items;
  if (!Array.isArray(checkoutItems) || checkoutItems.length === 0 || !shippingAddress) {
    return res.status(400).json({ message: "items and shippingAddress are required" });
  }
  const normalizedPaymentMethod = String(paymentMethod || "online").toLowerCase().trim();
  if (normalizedPaymentMethod === "cod" || normalizedPaymentMethod === "cash_on_delivery") {
    return res.status(400).json({ message: "Cash on Delivery (COD) is permanently disabled. Please select an online payment method." });
  }
  if (!["upi", "card", "online", "razorpay", "easebuzz"].includes(normalizedPaymentMethod)) {
    return res.status(400).json({ message: "paymentMethod must be upi, card, razorpay, easebuzz, or online" });
  }
  if (!addressId && !validAddress(shippingAddress)) {
    return res.status(400).json({ message: "shippingAddress must include valid fullName, mobile, address, city, state, postalCode, and country" });
  }
  if (!Array.isArray(checkoutItems) || checkoutItems.length > 50) {
    return res.status(400).json({ message: "Checkout must contain between 1 and 50 items" });
  }
  if (checkoutItems.some((item) => !item || typeof item !== "object" || !/^[a-f\d]{24}$/i.test(String(item.product || "")))) {
    return res.status(400).json({ message: "Each item must include a valid product identifier and quantity" });
  }

  const productIds = checkoutItems.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds }, active: true });
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const orderItems = [];
  for (const item of checkoutItems) {
    const product = productMap.get(String(item.product));
    const quantity = Number(item.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ message: "Each item must reference a valid product and quantity" });
    }
    if (product.active === false || product.is_available === false || product.isAvailable === false || product.available === false) {
      return res.status(409).json({ message: `${product.name} is currently unavailable` });
    }
    if (product.stock < quantity) {
      return res.status(409).json({ message: `${product.name} does not have enough stock` });
    }
    orderItems.push({ product: product._id, name: product.name, quantity, price: product.price });
  }

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingSetting = await ShippingSetting.findOne({ name: "default", active: true });
  let coupon;
  let discountAmount = 0;
  if (req.body.couponCode !== undefined) {
    if (typeof req.body.couponCode !== "string" || !req.body.couponCode.trim() || req.body.couponCode.length > 40) {
      return res.status(400).json({ message: "couponCode must be a non-empty string of at most 40 characters" });
    }
    const code = String(req.body.couponCode).trim().toUpperCase();
    coupon = await Coupon.findOne({ code, active: true });
    const now = new Date();
    if (!coupon || (coupon.startsAt && coupon.startsAt > now) || (coupon.endsAt && coupon.endsAt <= now) ||
        (coupon.usageLimit > 0 && coupon.uses >= coupon.usageLimit) || subtotal < coupon.minimumOrderValue) {
      return res.status(400).json({ message: "Coupon is invalid, expired, exhausted, or the order does not meet its minimum value" });
    }
    discountAmount = coupon.discountType === "percentage"
      ? subtotal * coupon.discountValue / 100
      : coupon.discountValue;
    if (coupon.maximumDiscount !== undefined) discountAmount = Math.min(discountAmount, coupon.maximumDiscount);
    discountAmount = Math.min(Math.round(discountAmount * 100) / 100, subtotal);
  }
  const discountedSubtotal = subtotal - discountAmount;
  const shippingFee = shippingSetting && shippingSetting.freeShippingMinimum > 0 &&
    discountedSubtotal >= shippingSetting.freeShippingMinimum ? 0 : shippingSetting?.charge || 0;
  const total = discountedSubtotal + shippingFee;
  const reservationExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const order = await createOrderAndPayment({
    itemList: orderItems,
    orderData: {
      user: req.user._id,
      items: orderItems,
      subtotal,
      discountAmount,
      shippingFee,
      total,
      shippingAddress,
      status: "awaiting_payment",
      paymentStatus: "pending",
      paymentMethod: normalizedPaymentMethod === "easebuzz" ? "Easebuzz" : "Online",
      stockReserved: true,
      stockReservationExpiresAt: reservationExpiresAt,
      trackingEvents: [{ status: "awaiting_payment", description: `Waiting for ${normalizedPaymentMethod === "easebuzz" ? "Easebuzz" : "online"} payment` }]
    },
    paymentData: {
      method: normalizedPaymentMethod,
      provider: normalizedPaymentMethod === "easebuzz" ? "easebuzz" : "razorpay",
      amount: total
    },
    cart,
    coupon
  });
  await Product.updateMany(
    { _id: { $in: orderItems.map((item) => item.product) } },
    { $inc: { popularity: 1 } }
  );
  if (!isOnline) await notifyOrderStage(order, "confirmed");
  const responseData = order.toObject ? order.toObject() : order;
  res.status(201).json({ ...responseData, order: responseData });
});

router.get("/mine", requireAuth, async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = { user: req.user._id };
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    Order.countDocuments(filter)
  ]);
  res.json({ orders, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.get("/:id", requireAuth, async (req, res) => {
  const isObjectId = /^[a-f\d]{24}$/i.test(String(req.params.id));
  const idFilter = isObjectId ? { $or: [{ _id: req.params.id }, { orderNumber: req.params.id }] } : { orderNumber: req.params.id };
  const filter = req.user.role === "admin"
    ? idFilter
    : { ...idFilter, user: req.user._id };
  const order = await Order.findOne(filter).populate("user", "name email");
  if (!order) return res.status(404).json({ message: "Order not found" });
  const payment = await Payment.findOne({ order: order._id });
  res.json({ order, payment });
});

router.get("/:id/tracking", requireAuth, async (req, res) => {
  const isObjectId = /^[a-f\d]{24}$/i.test(String(req.params.id));
  const idFilter = isObjectId ? { $or: [{ _id: req.params.id }, { orderNumber: req.params.id }] } : { orderNumber: req.params.id };
  const filter = req.user.role === "admin"
    ? idFilter
    : { ...idFilter, user: req.user._id };
  const order = await Order.findOne(filter).select("_id orderNumber status paymentStatus createdAt updatedAt shipment trackingEvents");
  if (!order) return res.status(404).json({ message: "Order not found" });
  res.json({
    orderId: order._id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    lastUpdated: order.updatedAt,
    shipment: order.shipment,
    trackingEvents: order.trackingEvents || [],
    trackingAvailable: Boolean(order.shipment && (order.shipment.awb || order.shipment.trackingUrl)),
    message: order.shipment?.trackingUrl ? "Use the courier tracking link for live shipment updates." : undefined
  });
});

router.get("/:id/invoice", requireAuth, async (req, res) => {
  const isObjectId = /^[a-f\d]{24}$/i.test(String(req.params.id));
  const idFilter = isObjectId ? { $or: [{ _id: req.params.id }, { orderNumber: req.params.id }] } : { orderNumber: req.params.id };
  const filter = req.user.role === "admin" ? idFilter : { ...idFilter, user: req.user._id };
  const order = await Order.findOne(filter).populate("user", "name email mobile");
  let storeInfo = null;
  try {
    const storeSettingService = require("../modules/settings/storeSetting.service");
    storeInfo = await storeSettingService.getStoreSetting();
  } catch (e) {
    // Graceful fallback
  }

  const lines = [
    "TAX INVOICE",
    `Invoice No: ${order.invoiceNumber || order.orderNumber || order._id}`,
    `Order ID: ${order._id}`,
    `Date: ${new Date(order.createdAt).toLocaleDateString("en-IN")}`,
    `Payment Status: ${order.paymentStatus}`,
    `Payment Method: ${order.paymentMethod || "Online"}`,
    "",
    ...(storeInfo ? [
      "Store / Ship From Details:",
      `Store: ${storeInfo.storeName || "Jyotish Astro Store"}`,
      `Contact: ${storeInfo.contactName || storeInfo.fullName || "Master Astrologer"}`,
      ...(storeInfo.phone || storeInfo.mobile ? [`Phone: ${storeInfo.phone || storeInfo.mobile}`] : []),
      `Address: ${storeInfo.formattedAddress || `${storeInfo.addressLine || storeInfo.address}, ${storeInfo.city}, ${storeInfo.state} - ${storeInfo.pinCode || storeInfo.postalCode}, ${storeInfo.country || "India"}`}`,
      ""
    ] : []),
    "Customer Billing & Shipping Details:",
    `Customer: ${order.shippingAddress.fullName || order.user?.name || ""}`,
    ...(order.user?.email ? [`Email: ${order.user.email}`] : []),
    ...(order.shippingAddress.mobile || order.shippingAddress.phone || order.user?.mobile ? [`Phone: ${order.shippingAddress.mobile || order.shippingAddress.phone || order.user?.mobile}`] : []),
    `Shipping Address: ${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}${order.shippingAddress.country ? ', ' + order.shippingAddress.country : ''}`,
    "",
    "Items:"
  ];
  order.items.forEach((item) => lines.push(`${item.name} x ${item.quantity} @ INR ${item.price.toFixed(2)} = INR ${(item.price * item.quantity).toFixed(2)}`));
  lines.push("",   `Subtotal: INR ${order.subtotal.toFixed(2)}`, `Discount: INR ${(order.discountAmount || 0).toFixed(2)}`,
  `Shipping: INR ${order.shippingFee.toFixed(2)}`, `Total: INR ${order.total.toFixed(2)}`, `Payment: ${order.paymentStatus}`);
  const pdf = require("../services/invoice").createInvoicePdf(lines);
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${order.orderNumber || "invoice"}.pdf"` }).send(pdf);
});

router.post("/:id/reorder", requireAuth, async (req, res) => {
  const isObjectId = /^[a-f\d]{24}$/i.test(String(req.params.id));
  const idFilter = isObjectId ? { $or: [{ _id: req.params.id }, { orderNumber: req.params.id }] } : { orderNumber: req.params.id };
  const order = await Order.findOne({ ...idFilter, user: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found" });
  const productIds = order.items.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds }, active: true });
  const available = new Map(products.map((product) => [String(product._id), product]));
  for (const item of order.items) {
    const product = available.get(String(item.product));
    if (!product || product.stock < item.quantity) {
      return res.status(409).json({ message: `${item.name} is unavailable in the required quantity` });
    }
  }
  const cart = await Cart.findOneAndUpdate(
    { user: req.user._id },
    { $set: { items: order.items.map(({ product, quantity }) => ({ product, quantity })) }, $setOnInsert: { user: req.user._id } },
    { new: true, upsert: true, runValidators: true }
  );
  await cart.populate("items.product");
  res.json({ cart, message: "Previous order items are ready in your cart. Review stock and prices before checkout." });
});

router.patch("/:id/status", requireAuth, requireAdmin, async (req, res) => {
  const allowed = ["placed", "confirmed", "processing", "packed", "pickup_requested", "shipped", "delivered", "cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid order status" });
  const isObjectId = /^[a-f\d]{24}$/i.test(String(req.params.id));
  const filter = isObjectId ? { $or: [{ _id: req.params.id }, { orderNumber: req.params.id }] } : { orderNumber: req.params.id };
  const order = await Order.findOne(filter);
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (req.body.status === "cancelled" && ["shipped", "delivered"].includes(order.status)) {
    return res.status(409).json({ message: "Shipped or delivered orders cannot be cancelled." });
  }
  if (req.body.status === "cancelled" && order.status !== "cancelled") await restoreOrderStock(order, "cancelled");
  order.status = req.body.status;
  if (req.body.status === "shipped") {
    if (req.body.courierName) {
      order.courierName = req.body.courierName;
      if (!order.shipment) order.shipment = {};
      order.shipment.provider = req.body.courierName;
    }
    if (req.body.trackingId) {
      order.trackingId = req.body.trackingId;
      if (!order.shipment) order.shipment = {};
      order.shipment.awb = req.body.trackingId;
      order.shipment.shipmentId = req.body.trackingId;
    }
    if (!order.shipment) order.shipment = {};
    order.shipment.shippedAt = new Date();
  }
  if (req.body.status === "delivered") {
    if (!order.deliveredAt) {
      order.deliveredAt = new Date();
    }
  } else if (order.deliveredAt && ["placed", "confirmed", "processing", "packed", "pickup_requested", "shipped"].includes(req.body.status)) {
    order.deliveredAt = null;
  }
  const eventDesc = req.body.note || (req.body.status === "shipped" && req.body.courierName ? `Shipped via ${req.body.courierName}${req.body.trackingId ? ' (Tracking ID: ' + req.body.trackingId + ')' : ''}` : `Order ${req.body.status.replaceAll("_", " ")}`);
  order.trackingEvents.push({ status: req.body.status, description: eventDesc });
  await order.save();
  const notificationStage = {
    placed: "confirmed",
    confirmed: "confirmed",
    processing: "processing",
    shipped: "shipped",
    delivered: "delivered",
    cancelled: "cancelled"
  }[req.body.status];
  if (notificationStage) await notifyOrderStage(order, notificationStage);
  res.json(order);
});

router.patch("/:id/payment", requireAuth, requireAdmin, async (req, res) => {
  const { status, transactionId } = req.body;
  if (!["pending", "paid", "failed", "refunded"].includes(status)) {
    return res.status(400).json({ message: "Invalid payment status" });
  }
  const isObjectId = /^[a-f\d]{24}$/i.test(String(req.params.id));
  const filter = isObjectId ? { $or: [{ _id: req.params.id }, { orderNumber: req.params.id }] } : { orderNumber: req.params.id };
  const order = await Order.findOne(filter);
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (status === "paid" && !await confirmOrderPayment(order)) {
    return res.status(409).json({ message: "Inventory is unavailable for this paid order; resolve it manually before shipping." });
  }
  const payment = await Payment.findOneAndUpdate(
    { order: order._id },
    { status, transactionId },
    { new: true }
  );
  if (!payment) return res.status(404).json({ message: "Payment not found" });
  if (status !== "paid") {
    order.paymentStatus = status;
    await order.save();
    if (status === "failed" && payment.method !== "cod") await restoreOrderStock(order);
  }
  if (status === "paid") await notifyOrderStage(order, "payment_successful");
  res.json(payment);
});

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = req.query.includePending === "true" ? {} : { status: { $ne: "awaiting_payment" } };
  const [orders, total] = await Promise.all([
    Order.find(filter).populate("user", "name email").sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    Order.countDocuments(filter)
  ]);
  res.json({ orders, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

module.exports = router;
