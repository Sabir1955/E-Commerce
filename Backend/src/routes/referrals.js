const router = require("express").Router();
const Referral = require("../models/Referral");
const { requireAuth } = require("../middleware/auth");
const { pagination } = require("../utils/request");

router.get("/mine", requireAuth, async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = { referrer: req.user._id };
  const [referrals, total] = await Promise.all([
    Referral.find(filter).populate("referredUser", "name createdAt").sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    Referral.countDocuments(filter)
  ]);
  res.json({ referralCode: req.user.referralCode, referrals, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

module.exports = router;
