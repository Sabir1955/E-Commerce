const router = require("express").Router();
const paymentsController = require("./payments.controller");
const { requireAuth, optionalAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");
const { paymentLimiter } = require("../../middleware/rateLimit.middleware");

// Direct Online Payment routes (used by checkout flow - supports guest & authenticated)
router.post("/create-order", optionalAuth, paymentLimiter, (req, res) => paymentsController.createDirectOrder(req, res));
router.post("/verify", optionalAuth, paymentLimiter, (req, res) => paymentsController.verifyDirect(req, res));
router.post("/failure", optionalAuth, paymentLimiter, (req, res) => paymentsController.recordFailure(req, res));

// Easebuzz Specific Routes
router.post("/easebuzz/create-order", optionalAuth, paymentLimiter, (req, res) => {
  req.body = { ...req.body, gateway: "easebuzz" };
  paymentsController.createDirectOrder(req, res);
});
router.post("/easebuzz/verify", optionalAuth, paymentLimiter, (req, res) => paymentsController.verifyEasebuzz(req, res));
router.all("/easebuzz/callback", paymentLimiter, (req, res) => paymentsController.handleEasebuzzCallback(req, res));

// Order-specific payment routes (require authentication)
router.post("/:orderId/razorpay", requireAuth, paymentLimiter, (req, res) => paymentsController.createRazorpayOrder(req, res));
router.post("/:orderId/easebuzz", requireAuth, paymentLimiter, (req, res) => paymentsController.createEasebuzzOrder(req, res));
router.post("/:orderId/initiate", requireAuth, paymentLimiter, (req, res) => paymentsController.initiate(req, res));
router.post("/:orderId/verify", requireAuth, paymentLimiter, (req, res) => paymentsController.verify(req, res));
router.get("/:orderId", requireAuth, (req, res) => paymentsController.getByOrderId(req, res));
router.patch("/:orderId", requireAuth, requireAdmin, (req, res) => paymentsController.updatePayment(req, res));

module.exports = router;
