const router = require("express").Router();
const db = require("../database/db");
const Review = require("../models/Review");
const Product = require("../models/Product");
const Order = require("../models/Order");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pagination } = require("../utils/request");

async function refresh(productId) {
  try {
    if (!productId) return;
    const pId = typeof productId === "object" ? (productId._id || productId.id) : productId;
    if (!pId) return;
    const res = await db.query(
      "SELECT AVG(rating)::numeric(3,1) as avg_rating, COUNT(*)::int as cnt FROM reviews WHERE product_id = $1 AND status = 'approved'",
      [String(pId)]
    );
    const avg = Number(res.rows[0]?.avg_rating || 0);
    const count = Number(res.rows[0]?.cnt || 0);
    await Product.findByIdAndUpdate(pId, {
      rating: avg,
      reviewCount: count
    });
  } catch (err) {
    console.warn("[Reviews:refresh] Error refreshing rating:", err.message);
  }
}

// Public: Get approved reviews for a specific product
router.get("/product/:productId", async (req, res) => {
  try {
    const page = pagination(req.query);
    if (page.error) return res.status(400).json({ message: page.error });
    let productId = req.params.productId;
    if (!/^[a-f\d]{24}$/i.test(String(productId))) {
      const p = await Product.findOne({ $or: [{ sku: productId }, { slug: productId }], active: true });
      if (p) productId = String(p._id);
    }
    const filter = { product: productId, status: "approved" };
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("user", "name")
        .populate("order", "orderNumber")
        .sort({ createdAt: -1 })
        .skip(page.skip)
        .limit(page.limit),
      Review.countDocuments(filter)
    ]);
    res.json({ reviews, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
  } catch (err) {
    console.error("[Reviews:product] Error:", err);
    res.status(500).json({ message: err.message || "Failed to fetch reviews" });
  }
});

// Authenticated: Get reviews written by the logged-in customer
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.user._id })
      .populate("product", "name price image images slug sku")
      .populate("order", "orderNumber status deliveredAt")
      .sort({ createdAt: -1 });
    res.json({ reviews });
  } catch (err) {
    console.error("[Reviews:mine] Error:", err);
    res.status(500).json({ message: err.message || "Failed to fetch your reviews" });
  }
});

// Authenticated: Submit a review
router.post("/", requireAuth, async (req, res) => {
  try {
    const rating = Number(req.body.rating);
    let productId = req.body.product;
    if (productId && !/^[a-f\d]{24}$/i.test(String(productId))) {
      const p = await Product.findOne({ $or: [{ sku: productId }, { slug: productId }], active: true });
      if (p) productId = String(p._id);
    }
    if (
      !/^[a-f\d]{24}$/i.test(String(productId || "")) ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      (req.body.comment !== undefined && (typeof req.body.comment !== "string" || req.body.comment.length > 2000))
    ) {
      return res.status(400).json({
        message: "product must be valid, rating must be an integer from 1 to 5, and comment must be at most 2000 characters"
      });
    }

    // Prevent duplicate reviews for the same product by the same customer
    const existing = await Review.findOne({ product: productId, user: req.user._id });
    if (existing) {
      return res.status(409).json({
        message: "You have already reviewed this product.",
        review: existing
      });
    }

    let orderDoc = null;
    if (req.body.orderId) {
      const rawOrderId = String(req.body.orderId).trim();
      const cleanOrderNum = rawOrderId.replace(/^#+/, "").trim();
      const isObjectId = /^[a-f\d]{24}$/i.test(rawOrderId);

      orderDoc = await Order.findOne({
        ...(isObjectId
          ? { $or: [{ _id: rawOrderId }, { orderNumber: rawOrderId }, { orderNumber: cleanOrderNum }, { orderNumber: `#${cleanOrderNum}` }] }
          : { $or: [{ orderNumber: rawOrderId }, { orderNumber: cleanOrderNum }, { orderNumber: `#${cleanOrderNum}` }] }),
        user: req.user._id,
        status: { $regex: /^delivered$/i }
      });

      if (orderDoc) {
        const hasProduct = Array.isArray(orderDoc.items) && orderDoc.items.some(
          (it) => String(it.product?._id || it.product?.id || it.product || it.productId || "") === String(productId)
        );
        if (!hasProduct) {
          orderDoc = null;
        }
      }
      if (!orderDoc) {
        return res.status(400).json({
          message: "Review can only be submitted for delivered products you purchased."
        });
      }
    } else {
      // If not explicitly provided, find delivered order for verified purchase
      const orders = await Order.find({
        user: req.user._id,
        status: { $regex: /^delivered$/i }
      });
      orderDoc = orders.find(
        (ord) => Array.isArray(ord.items) && ord.items.some(
          (it) => String(it.product?._id || it.product?.id || it.product || it.productId || "") === String(productId)
        )
      ) || null;
    }

    const review = await Review.create({
      product: productId,
      user: req.user._id,
      order: orderDoc ? orderDoc._id : undefined,
      verifiedPurchase: Boolean(orderDoc),
      rating,
      comment: req.body.comment,
      status: "approved"
    });

    await review.populate([
      { path: "user", select: "name" },
      { path: "order", select: "orderNumber status deliveredAt" }
    ]);
    await refresh(productId);
    res.status(201).json(review);
  } catch (err) {
    console.error("[Reviews:create] Error:", err);
    res.status(500).json({ message: err.message || "Failed to create review" });
  }
});

// Authenticated: Update own review
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const rating = req.body.rating !== undefined ? Number(req.body.rating) : undefined;
    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({ message: "Rating must be an integer from 1 to 5" });
    }
    const review = await Review.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        ...(rating !== undefined ? { rating } : {}),
        ...(req.body.comment !== undefined ? { comment: req.body.comment } : {})
      },
      { new: true, runValidators: true }
    );
    if (!review) return res.status(404).json({ message: "Review not found" });
    await review.populate("user", "name");
    await refresh(review.productId || review.product);
    res.json(review);
  } catch (err) {
    console.error("[Reviews:patch] Error:", err);
    res.status(500).json({ message: err.message || "Failed to update review" });
  }
});

// Authenticated: Delete review (Owner or Admin)
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const filter = req.user.role === "admin"
      ? { _id: req.params.id }
      : { _id: req.params.id, user: req.user._id };
    const review = await Review.findOneAndDelete(filter);
    if (!review) return res.status(404).json({ message: "Review not found" });
    await refresh(review.productId || review.product);
    res.json({ message: "Review deleted successfully" });
  } catch (err) {
    console.error("[Reviews:delete] Error:", err);
    res.status(500).json({ message: err.message || "Failed to delete review" });
  }
});

// Admin: Get all reviews for moderation with status filter, search, and stats
router.get("/moderation", requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = pagination(req.query);
    if (page.error) return res.status(400).json({ message: page.error });

    const filter = {};
    if (req.query.status && req.query.status.toLowerCase() !== "all") {
      filter.status = req.query.status.toLowerCase();
    }

    if (req.query.search) {
      const s = String(req.query.search).trim();
      filter.$or = [
        { comment: { $regex: s, $options: "i" } }
      ];
    }

    const [reviews, total, totalAll, approvedCount, pendingCount, rejectedCount] = await Promise.all([
      Review.find(filter)
        .populate("product", "name price sku slug image images")
        .populate("user", "name email mobile")
        .populate("order", "orderNumber status deliveredAt total")
        .sort({ createdAt: -1 })
        .skip(page.skip)
        .limit(page.limit),
      Review.countDocuments(filter),
      Review.countDocuments({}),
      Review.countDocuments({ status: "approved" }),
      Review.countDocuments({ status: "pending" }),
      Review.countDocuments({ status: "rejected" })
    ]);

    const avgRes = await db.query(
      "SELECT AVG(rating)::numeric(3,1) as avg_rating FROM reviews WHERE status = 'approved'"
    );
    const averageRating = Number(avgRes.rows[0]?.avg_rating || 0);

    res.json({
      reviews,
      pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) },
      stats: {
        total: totalAll,
        approved: approvedCount,
        pending: pendingCount,
        rejected: rejectedCount,
        averageRating
      }
    });
  } catch (err) {
    console.error("[Reviews:moderation] Error:", err);
    res.status(500).json({ message: err.message || "Failed to fetch moderation reviews" });
  }
});

// Admin: Moderate review status (approved, pending, rejected)
router.patch("/:id/moderate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be pending, approved, or rejected" });
    }

    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!review) return res.status(404).json({ message: "Review not found" });
    await review.populate([
      { path: "product", select: "name price sku slug image images" },
      { path: "user", select: "name email mobile" },
      { path: "order", select: "orderNumber status deliveredAt total" }
    ]);
    const prodId = review.productId || (typeof review.product === "object" ? review.product._id || review.product.id : review.product);
    await refresh(prodId);
    res.json(review);
  } catch (err) {
    console.error("[Reviews:moderate] Error:", err);
    res.status(500).json({ message: err.message || "Failed to moderate review" });
  }
});

module.exports = router;
