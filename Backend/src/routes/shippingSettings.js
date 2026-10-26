const router = require("express").Router();
const ShippingSetting = require("../models/ShippingSetting");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { cacheMiddleware, invalidateCache } = require("../middleware/cache.middleware");
const ApiResponse = require("../utils/apiResponse");

router.get("/", cacheMiddleware(600, "shipping"), async (req, res) => {
  const setting = await ShippingSetting.findOne({ name: "default", active: true });
  const data = setting || { charge: 0, freeShippingMinimum: 0, estimatedDaysMin: 3, estimatedDaysMax: 7 };
  const raw = data.toObject ? data.toObject() : data;
  return ApiResponse.success(res, {
    message: "Shipping settings retrieved successfully",
    data: { shipping: data, shippingSettings: data, ...raw }
  });
});

router.put("/", requireAuth, requireAdmin, async (req, res) => {
  const fields = ["charge", "freeShippingMinimum", "estimatedDaysMin", "estimatedDaysMax", "defaultReturnDays"];
  const updates = {};
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      const value = Number(req.body[field]);
      if (!Number.isFinite(value) || value < 0) return res.status(400).json({ message: `${field} must be a non-negative number` });
      updates[field] = value;
    }
  }
  if (req.body.returnPolicyActive !== undefined) {
    updates.returnPolicyActive = Boolean(req.body.returnPolicyActive);
  }
  if (updates.estimatedDaysMax !== undefined && updates.estimatedDaysMin !== undefined &&
      updates.estimatedDaysMax < updates.estimatedDaysMin) {
    return res.status(400).json({ message: "estimatedDaysMax cannot be less than estimatedDaysMin" });
  }
  const setting = await ShippingSetting.findOneAndUpdate(
    { name: "default" },
    { $set: updates, $setOnInsert: { name: "default" } },
    { new: true, upsert: true, runValidators: true }
  );
  invalidateCache("shipping");
  const raw = setting.toObject ? setting.toObject() : setting;
  return ApiResponse.success(res, {
    message: "Shipping settings updated successfully",
    data: { shipping: setting, shippingSettings: setting, ...raw }
  });
});

module.exports = router;
