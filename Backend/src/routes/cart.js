const router = require("express").Router();
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id }).populate("items.product");
  res.json({ cart: cart || { items: [] } });
});

router.post("/items", async (req, res) => {
  const { product: productId, quantity = 1 } = req.body;
  const product = await Product.findOne({ _id: productId, active: true });
  if (!product) return res.status(404).json({ message: "Product not found" });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > product.stock) {
    return res.status(400).json({ message: "Quantity must be available in stock" });
  }

  const cart = await Cart.findOneAndUpdate(
    { user: req.user._id },
    { $setOnInsert: { user: req.user._id } },
    { new: true, upsert: true }
  );
  const item = cart.items.find((entry) => String(entry.product) === String(product._id));
  if (item) item.quantity = quantity;
  else cart.items.push({ product: product._id, quantity });
  await cart.save();
  await cart.populate("items.product");
  res.status(201).json({ cart });
});

router.patch("/items/:productId", async (req, res) => {
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ message: "Quantity must be a positive integer" });
  }
  const product = await Product.findOne({ _id: req.params.productId, active: true });
  if (!product || quantity > product.stock) return res.status(400).json({ message: "Quantity unavailable" });
  const cart = await Cart.findOne({ user: req.user._id });
  const item = cart && cart.items.find((entry) => String(entry.product) === req.params.productId);
  if (!item) return res.status(404).json({ message: "Cart item not found" });
  item.quantity = quantity;
  await cart.save();
  await cart.populate("items.product");
  res.json({ cart });
});

router.delete("/items/:productId", async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return res.status(404).json({ message: "Cart not found" });
  cart.items = cart.items.filter((item) => String(item.product) !== req.params.productId);
  await cart.save();
  res.json({ cart });
});

module.exports = router;
