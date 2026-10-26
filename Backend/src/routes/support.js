const router = require("express").Router();
const SupportTicket = require("../models/SupportTicket");
const Order = require("../models/Order");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { pagination } = require("../utils/request");

router.use(requireAuth);

router.post("/", async (req, res) => {
  const { subject, message, orderId } = req.body;
  if (typeof subject !== "string" || !subject.trim() || subject.trim().length > 160 ||
      typeof message !== "string" || !message.trim() || message.trim().length > 5000) {
    return res.status(400).json({ message: "subject (1-160 characters) and message (1-5000 characters) are required" });
  }
  if (orderId && !(await Order.exists({ _id: orderId, user: req.user._id }))) {
    return res.status(404).json({ message: "Order not found" });
  }
  const ticket = await SupportTicket.create({ user: req.user._id, order: orderId, subject: subject.trim(), message: message.trim() });
  res.status(201).json(ticket);
});

router.get("/mine", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = { user: req.user._id };
  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    SupportTicket.countDocuments(filter)
  ]);
  res.json({ tickets, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.get("/", requireAdmin, async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = req.query.status ? { status: req.query.status } : {};
  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter).populate("user", "name email mobile").populate("order", "orderNumber").sort({ createdAt: -1 }).skip(page.skip).limit(page.limit),
    SupportTicket.countDocuments(filter)
  ]);
  res.json({ tickets, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.patch("/:id", requireAdmin, async (req, res) => {
  const updates = {};
  if (req.body.status !== undefined) {
    if (!["open", "in_progress", "resolved", "closed"].includes(req.body.status)) {
      return res.status(400).json({ message: "Invalid support ticket status" });
    }
    updates.status = req.body.status;
  }
  if (req.body.adminReply !== undefined) {
    if (typeof req.body.adminReply !== "string" || req.body.adminReply.length > 5000) {
      return res.status(400).json({ message: "adminReply must be text of at most 5000 characters" });
    }
    updates.adminReply = req.body.adminReply;
  }
  const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!ticket) return res.status(404).json({ message: "Support ticket not found" });
  res.json(ticket);
});

module.exports = router;
