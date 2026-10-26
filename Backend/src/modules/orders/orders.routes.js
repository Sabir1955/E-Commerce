const router = require("express").Router();
const ordersController = require("./orders.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");

// Statuses list endpoint (loads valid order statuses from database schema)
router.get("/statuses", (req, res) => ordersController.getStatuses(req, res));
router.get("/store-address", async (req, res, next) => {
  try {
    const storeSettingService = require("../settings/storeSetting.service");
    const result = await storeSettingService.getStoreSetting();
    res.json({ success: true, data: result, ...result });
  } catch (err) {
    next(err);
  }
});

// Public order tracking (by Order ID, with legacy track/:id support)
router.get("/track/order/:orderId", (req, res) => ordersController.trackByOrderId(req, res));
router.get("/track/:id", (req, res) => ordersController.track(req, res));

router.use(requireAuth);

// Authenticated user order tracking (requires authentication)
router.get("/track/user/:userId", (req, res) => ordersController.trackByUser(req, res));

// Customer endpoints
router.post("/", (req, res, next) => ordersController.create(req, res, next));
router.get("/mine", (req, res) => ordersController.getMyOrders(req, res));
router.get("/my-orders", (req, res) => ordersController.getMyOrders(req, res));
router.get("/:id", (req, res) => ordersController.getById(req, res));
router.get("/:id/tracking", (req, res) => ordersController.getTracking(req, res));
router.get("/:id/invoice", (req, res) => ordersController.getInvoice(req, res));
router.post("/:id/reorder", (req, res) => ordersController.reorder(req, res));
router.post("/:id/cancel", (req, res) => ordersController.cancel(req, res));

// Admin endpoints
router.get("/", requireAdmin, (req, res) => ordersController.listAll(req, res));
router.patch("/:id/status", requireAdmin, (req, res) => ordersController.updateStatus(req, res));
router.patch("/:id/payment", requireAdmin, (req, res) => ordersController.updatePayment(req, res));

module.exports = router;
