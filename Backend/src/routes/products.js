const router = require("express").Router();
const Product = require("../models/Product");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pagination, isNonNegativeNumber, isNonNegativeInteger } = require("../utils/request");

router.get("/", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = { active: true };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.brand) filter.brand = req.query.brand;
  if (req.query.search) filter.$text = { $search: req.query.search };
  if (req.query.sku) filter.sku = req.query.sku.toUpperCase();
  if (req.query.featured === "true") filter.featured = true;

  if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
    const min = req.query.minPrice === undefined ? 0 : Number(req.query.minPrice);
    const max = req.query.maxPrice === undefined ? Infinity : Number(req.query.maxPrice);
    if ((req.query.minPrice !== undefined && (String(req.query.minPrice).trim() === "" || !Number.isFinite(min) || min < 0)) ||
        (req.query.maxPrice !== undefined && (String(req.query.maxPrice).trim() === "" || !Number.isFinite(max) || max < 0)) || max < min) {
      return res.status(400).json({ message: "Price range must use non-negative numbers with minPrice <= maxPrice" });
    }
    filter.price = { ...(req.query.minPrice !== undefined ? { $gte: min } : {}), ...(req.query.maxPrice !== undefined ? { $lte: max } : {}) };
  }
  if (req.query.available === "true") filter.stock = { $gt: 0 };
  const sort = req.query.sort === "popularity"
    ? { popularity: -1 }
    : req.query.sort === "price_asc"
    ? { price: 1 }
    : req.query.sort === "price_desc" ? { price: -1 } : { createdAt: -1 };
  const [products, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(page.skip).limit(page.limit),
    Product.countDocuments(filter)
  ]);
  res.json({ products, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.get("/featured", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = { active: true, featured: true };
  const [products, total] = await Promise.all([
    Product.find(filter).sort({ popularity: -1, createdAt: -1 }).skip(page.skip).limit(page.limit),
    Product.countDocuments(filter)
  ]);
  res.json({ products, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.get("/latest", async (req, res) => {
  const page = pagination(req.query, 12);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = { active: true };
  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    Product.countDocuments(filter)
  ]);
  res.json({ products, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.get("/:id", async (req, res) => {
  const isObjectId = /^[a-f\d]{24}$/i.test(req.params.id);
  const product = await Product.findOne({ ...(isObjectId ? { _id: req.params.id } : { slug: req.params.id }), active: true });
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  if (!req.body.name || !req.body.description || !req.body.category ||
      !isNonNegativeNumber(req.body.price) || !isNonNegativeInteger(req.body.stock)) {
    return res.status(400).json({ message: "name, description, category, non-negative price, and non-negative integer stock are required" });
  }
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  if (req.body.price !== undefined && !isNonNegativeNumber(req.body.price)) {
    return res.status(400).json({ message: "price must be a non-negative number" });
  }
  if (req.body.stock !== undefined && !isNonNegativeInteger(req.body.stock)) {
    return res.status(400).json({ message: "stock must be a non-negative integer" });
  }
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
});

router.patch("/:id/inventory", requireAuth, requireAdmin, async (req, res) => {
  const quantity = Number(req.body.quantity);
  if (!isNonNegativeInteger(req.body.quantity)) {
    return res.status(400).json({ message: "quantity must be a non-negative integer" });
  }
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { stock: quantity },
    { new: true, runValidators: true }
  );
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
});

router.post("/:id/inventory/adjust", requireAuth, requireAdmin, async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    return res.status(400).json({ message: "amount must be a non-zero integer" });
  }
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, $expr: { $gte: [{ $add: ["$stock", amount] }, 0] } },
    { $inc: { stock: amount } },
    { new: true }
  );
  if (!product) return res.status(400).json({ message: "Product not found or stock cannot become negative" });
  res.json(product);
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json({ message: "Product archived" });
});

module.exports = router;
