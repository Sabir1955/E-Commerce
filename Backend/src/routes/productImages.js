const router = require("express").Router();
const path = require("path");
const multer = require("multer");
const Product = require("../models/Product");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "..", "uploads"),
  filename: (req, file, callback) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-");
    callback(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) return callback(new Error("Only image files are allowed"));
    callback(null, true);
  }
});

router.post("/:id/images", requireAuth, requireAdmin, upload.array("images", 8), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  product.images.push(...req.files.map((file) => `/uploads/${file.filename}`));
  if (!product.imageUrl && product.images.length) product.imageUrl = product.images[0];
  await product.save();
  res.status(201).json({ product });
});

module.exports = router;
