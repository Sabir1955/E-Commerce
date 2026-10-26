const router = require("express").Router();
const storeSettingService = require("../modules/settings/storeSetting.service");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireAdmin } = require("../middleware/admin.middleware");

// GET /api/settings/store - Read configured store/ship-from address from MongoDB
router.get("/store", async (req, res, next) => {
  try {
    const setting = await storeSettingService.getStoreSetting();
    res.json({
      success: true,
      message: "Store address retrieved successfully from MongoDB",
      data: setting,
      ...setting
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings/store - Update store/ship-from address in MongoDB (Admin only)
router.put("/store", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const updated = await storeSettingService.updateStoreSetting(req.body);
    res.json({
      success: true,
      message: "Store address updated successfully in MongoDB",
      data: updated,
      ...updated
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/store - Also accept POST for clients using POST
router.post("/store", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const updated = await storeSettingService.updateStoreSetting(req.body);
    res.json({
      success: true,
      message: "Store address updated successfully in MongoDB",
      data: updated,
      ...updated
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
