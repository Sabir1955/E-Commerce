const router = require("express").Router();
const notificationsController = require("./notifications.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");

// In-App Notifications for Authenticated Users
router.get("/", requireAuth, (req, res) => notificationsController.getMyNotifications(req, res));
router.get("/unread-count", requireAuth, (req, res) => notificationsController.getMyUnreadCount(req, res));
router.patch("/read-all", requireAuth, (req, res) => notificationsController.markAllMyNotificationsRead(req, res));
router.patch("/:id/read", requireAuth, (req, res) => notificationsController.markMyNotificationRead(req, res));

// Admin-only Logs & Dispatch
router.get("/logs", requireAuth, requireAdmin, (req, res) => notificationsController.getLogs(req, res));
router.patch("/logs/mark-all-read", requireAuth, requireAdmin, (req, res) => notificationsController.markAllAsRead(req, res));
router.patch("/logs/:id/read", requireAuth, requireAdmin, (req, res) => notificationsController.markAsRead(req, res));
router.post("/email", requireAuth, requireAdmin, (req, res) => notificationsController.sendEmail(req, res));
router.post("/sms", requireAuth, requireAdmin, (req, res) => notificationsController.sendSms(req, res));
router.post("/whatsapp", requireAuth, requireAdmin, (req, res) => notificationsController.sendWhatsApp(req, res));
router.delete("/logs/:id", requireAuth, requireAdmin, (req, res) => notificationsController.delete(req, res));
router.delete("/:id", requireAuth, requireAdmin, (req, res) => notificationsController.delete(req, res));

module.exports = router;
