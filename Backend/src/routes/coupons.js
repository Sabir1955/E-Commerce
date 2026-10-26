const router = require("express").Router();
const Coupon = require("../models/Coupon");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pagination } = require("../utils/request");

router.get("/", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const now = new Date();
  const filter = { active: true, $and: [
    { $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
    { $or: [{ endsAt: { $exists: false } }, { endsAt: { $gt: now } }] },
    { $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$uses", "$usageLimit"] } }] }
  ] };
  const [coupons, total] = await Promise.all([
    Coupon.find(filter).select("code discountType discountValue maximumDiscount minimumOrderValue endsAt").sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    Coupon.countDocuments(filter)
  ]);
  res.json({ coupons, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.post("/apply", async (req, res) => {
  const { code, subtotal } = req.body;
  if (!code || typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ success: false, message: "Coupon code is required" });
  }
  const cleanCode = String(code).trim().toUpperCase();
  const coupon = await Coupon.findOne({ code: cleanCode, active: true });
  const now = new Date();
  if (
    !coupon ||
    (coupon.startsAt && coupon.startsAt > now) ||
    (coupon.endsAt && coupon.endsAt <= now) ||
    (coupon.usageLimit > 0 && coupon.uses >= coupon.usageLimit)
  ) {
    return res.status(400).json({ success: false, message: "Coupon is invalid, expired, or exhausted" });
  }

  const orderSubtotal = Number(subtotal) || 0;
  if (orderSubtotal < coupon.minimumOrderValue) {
    return res.status(400).json({
      success: false,
      message: `Coupon requires a minimum order value of ₹${coupon.minimumOrderValue}`
    });
  }

  let discountAmount = coupon.discountType === "percentage"
    ? (orderSubtotal * coupon.discountValue) / 100
    : coupon.discountValue;
  if (coupon.maximumDiscount !== undefined && coupon.maximumDiscount > 0) {
    discountAmount = Math.min(discountAmount, coupon.maximumDiscount);
  }
  discountAmount = Math.min(Math.round(discountAmount * 100) / 100, orderSubtotal);

  return res.json({
    success: true,
    message: "Coupon applied successfully",
    coupon: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maximumDiscount: coupon.maximumDiscount,
      discountAmount,
      finalSubtotal: orderSubtotal - discountAmount
    }
  });
});

router.post("/verify", (req, res) => res.redirect(307, "/api/coupons/apply"));

const ALLOWED_COUPON_FIELDS = [
  "code",
  "discountType",
  "discountValue",
  "maximumDiscount",
  "minimumOrderValue",
  "startsAt",
  "endsAt",
  "usageLimit",
  "active"
];

function pickCouponFields(body) {
  const clean = {};
  for (const field of ALLOWED_COUPON_FIELDS) {
    if (body[field] !== undefined) {
      clean[field] = body[field];
    }
  }
  return clean;
}

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const { code, discountType, discountValue } = req.body;
  if (!code || !["fixed", "percentage"].includes(discountType) || !Number.isFinite(Number(discountValue)) || Number(discountValue) <= 0 ||
      (discountType === "percentage" && Number(discountValue) > 100)) {
    return res.status(400).json({ message: "A coupon code and valid fixed or percentage discount are required" });
  }
  const cleanData = pickCouponFields(req.body);
  cleanData.code = String(code).trim().toUpperCase();
  cleanData.discountValue = Number(discountValue);
  const coupon = await Coupon.create(cleanData);
  res.status(201).json(coupon);
});

router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  const cleanData = pickCouponFields(req.body);
  if (cleanData.code) {
    cleanData.code = String(cleanData.code).trim().toUpperCase();
  }
  if (cleanData.discountValue !== undefined) {
    cleanData.discountValue = Number(cleanData.discountValue);
  }
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, cleanData, { new: true, runValidators: true });
  if (!coupon) return res.status(404).json({ message: "Coupon not found" });
  res.json(coupon);
});

module.exports = router;
