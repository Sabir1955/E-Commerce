const router = require("express").Router();
const User = require("../models/User");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Order = require("../models/Order");
const Address = require("../models/Address");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pagination } = require("../utils/request");

router.use(requireAuth, requireAdmin);

router.get("/dashboard", async (req, res) => {
  const [
    products,
    categories,
    customers,
    orders,
    pendingOrders,
    completedOrders,
    outOfStock,
    shippedOrders,
    outForDeliveryOrders,
    cancelledOrders
  ] = await Promise.all([
    Product.countDocuments({ active: true }),
    Category.countDocuments({ active: true }),
    User.countDocuments({ role: { $ne: "admin" } }),
    Order.countDocuments(),
    Order.countDocuments({ status: { $in: ["placed", "processing", "packed", "pickup_requested"] } }),
    Order.countDocuments({ status: "delivered" }),
    Product.countDocuments({ active: true, stock: 0 }),
    Order.countDocuments({ status: "shipped" }),
    Order.countDocuments({ status: "out_for_delivery" }),
    Order.countDocuments({ status: "cancelled" })
  ]);
  const sales = await Order.aggregate([
    { $match: { paymentStatus: "paid" } },
    { $group: { _id: null, total: { $sum: "$total" } } }
  ]);
  res.json({
    products,
    categories,
    customers,
    orders,
    pendingOrders,
    completedOrders,
    outOfStock,
    shippedOrders,
    outForDeliveryOrders,
    cancelledOrders,
    totalSales: sales[0]?.total || 0
  });
});

router.get("/customers", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = { role: { $ne: "admin" } };
  const [customers, total] = await Promise.all([
    User.find(filter).select("-password").sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    User.countDocuments(filter)
  ]);
  res.json({ customers, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.get("/customers/:id", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const customer = await User.findOne({ _id: req.params.id, role: { $ne: "admin" } }).select("-password");
  if (!customer) return res.status(404).json({ message: "Customer not found" });
  const [orders, total] = await Promise.all([
    Order.find({ user: customer._id }).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    Order.countDocuments({ user: customer._id })
  ]);
  res.json({ customer, orders, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.patch("/customers/:id/status", async (req, res) => {
  if (typeof req.body.active !== "boolean") return res.status(400).json({ message: "active must be boolean" });
  const customer = await User.findOneAndUpdate(
    { _id: req.params.id, role: { $ne: "admin" } },
    { active: req.body.active },
    { new: true }
  ).select("-password");
  if (!customer) return res.status(404).json({ message: "Customer not found" });
  res.json(customer);
});

router.get("/inventory", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = { active: true };
  const [products, total] = await Promise.all([
    Product.find(filter).select("name slug brand sku category stock price weight dimensions material").sort({ stock: 1 }).skip(page.skip).limit(page.limit),
    Product.countDocuments(filter)
  ]);
  res.json({ products, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.get("/orders", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
  if (req.query.userId) filter.user = req.query.userId;
  if (req.query.search) {
    const search = String(req.query.search).trim();
    filter.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { "shippingAddress.fullName": { $regex: search, $options: "i" } },
      { "shippingAddress.mobile": { $regex: search, $options: "i" } }
    ];
  }
  const [orders, total] = await Promise.all([
    Order.find(filter).populate("user", "name email mobile").sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    Order.countDocuments(filter)
  ]);
  res.json({ orders, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.patch("/products/:id/return-policy", async (req, res) => {
  const { isReturnable, returnWindowDays, isReplaceable } = req.body;
  const updates = {};
  if (isReturnable !== undefined) updates.isReturnable = Boolean(isReturnable);
  if (isReplaceable !== undefined) updates.isReplaceable = Boolean(isReplaceable);
  if (returnWindowDays !== undefined) {
    const days = Number(returnWindowDays);
    if (!Number.isInteger(days) || days < 0) return res.status(400).json({ message: "returnWindowDays must be a non-negative integer" });
    updates.returnWindowDays = days;
  }
  const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json({ message: "Product return policy updated successfully", product });
});

router.patch("/products/return-policy/bulk", async (req, res) => {
  const { category, productIds, isReturnable, returnWindowDays, isReplaceable } = req.body;
  const filter = {};
  if (category) filter.category = category;
  if (Array.isArray(productIds) && productIds.length) filter._id = { $in: productIds };
  if (!Object.keys(filter).length) return res.status(400).json({ message: "Provide category or productIds to update" });

  const updates = {};
  if (isReturnable !== undefined) updates.isReturnable = Boolean(isReturnable);
  if (isReplaceable !== undefined) updates.isReplaceable = Boolean(isReplaceable);
  if (returnWindowDays !== undefined) {
    const days = Number(returnWindowDays);
    if (!Number.isInteger(days) || days < 0) return res.status(400).json({ message: "returnWindowDays must be a non-negative integer" });
    updates.returnWindowDays = days;
  }
  const result = await Product.updateMany(filter, { $set: updates });
  res.json({ message: `Updated return policy for ${result.modifiedCount} products`, modifiedCount: result.modifiedCount });
});

router.get("/store-address", async (req, res, next) => {
  try {
    const storeSettingService = require("../modules/settings/storeSetting.service");
    const result = await storeSettingService.getStoreSetting();
    res.json({ success: true, data: result, ...result });
  } catch (err) {
    next(err);
  }
});

router.all(["/store-address", "/store-address/update"], async (req, res, next) => {
  if (req.method !== "POST" && req.method !== "PUT") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  try {
    const storeSettingService = require("../modules/settings/storeSetting.service");
    const result = await storeSettingService.updateStoreSetting(req.body);
    res.json({ success: true, data: result, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
