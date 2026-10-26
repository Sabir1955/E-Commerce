const router = require("express").Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const notifications = require("../services/notificationDelivery");
const { isValidEmail, isValidIndianMobile } = require("../utils/request");
const NotificationLog = require("../models/NotificationLog");
const { pagination } = require("../utils/request");

router.use(requireAuth, requireAdmin);
router.get("/logs", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = {};
  if (["email", "sms", "whatsapp", "system"].includes(req.query.channel)) filter.channel = req.query.channel;
  if (["sent", "skipped", "failed"].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.read !== undefined) filter.read = req.query.read === "true" || req.query.read === true;
  const allLogs = await NotificationLog.find(filter)
    .populate("user", "name email mobile role")
    .populate("order", "orderNumber status total shippingAddress createdAt")
    .populate("returnRequest", "status reason type refundAmount")
    .sort({ createdAt: -1 });

  const seen = new Set();
  const deduped = [];
  for (const log of allLogs) {
    const orderKey = log.order ? String(log.order._id || log.order.orderNumber) : null;
    const returnKey = log.returnRequest ? String(log.returnRequest._id) : null;
    const subjKey = (log.subject || log.message || "").trim();
    const eventKey = orderKey ? `order_${orderKey}_${subjKey}` : (returnKey ? `return_${returnKey}_${subjKey}` : String(log._id));

    if (!seen.has(eventKey)) {
      seen.add(eventKey);
      deduped.push(log);
    }
  }

  const total = deduped.length;
  const logs = deduped.slice(page.skip, page.skip + page.limit);
  res.json({ logs, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.patch("/logs/mark-all-read", async (req, res) => {
  const result = await NotificationLog.updateMany({ read: false }, { $set: { read: true, readAt: new Date() } });
  res.json({ message: "All notifications marked as read", modifiedCount: result.modifiedCount });
});

router.patch("/logs/:id/read", async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(String(req.params.id || ""))) {
    return res.status(400).json({ message: "Valid notification ID is required" });
  }
  const log = await NotificationLog.findByIdAndUpdate(
    req.params.id,
    { read: true, readAt: new Date() },
    { new: true }
  )
    .populate("user", "name email mobile role")
    .populate("order", "orderNumber status total shippingAddress createdAt")
    .populate("returnRequest", "status reason type refundAmount");
  if (!log) return res.status(404).json({ message: "Notification not found" });
  res.json({ message: "Notification marked as read", log });
});
router.post("/email", async (req, res) => {
  if (!isValidEmail(req.body.to) || !req.body.subject || !req.body.text) return res.status(400).json({ message: "A valid to email, subject and text are required" });
  res.json(await notifications.email(req.body.to, req.body.subject, req.body.text));
});
router.post("/sms", async (req, res) => {
  if (!isValidIndianMobile(req.body.to) || !req.body.text) return res.status(400).json({ message: "A valid Indian mobile number and text are required" });
  res.json(await notifications.sms(req.body.to, req.body.text));
});
router.post("/whatsapp", async (req, res) => {
  if (!isValidIndianMobile(req.body.to) || !req.body.text) return res.status(400).json({ message: "A valid Indian mobile number and text are required" });
  res.json(await notifications.whatsapp(req.body.to, req.body.text));
});
module.exports = router;
