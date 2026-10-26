const NotificationLog = require("../../models/NotificationLog");
const notifications = require("../../services/notificationDelivery");
const { parsePagination, formatPaginationMeta } = require("../../utils/pagination");
const { BadRequestError, NotFoundError } = require("../../utils/errors");
const { isValidEmail, isValidIndianMobile } = require("../../utils/request");

class NotificationsService {
  async getLogs(query = {}) {
    const pageData = parsePagination(query);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const filter = {};
    if (["email", "sms", "whatsapp", "system"].includes(query.channel)) {
      filter.channel = query.channel;
    }
    if (["sent", "skipped", "failed"].includes(query.status)) {
      filter.status = query.status;
    }
    if (query.read !== undefined) {
      filter.read = query.read === "true" || query.read === true;
    }

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
    const logs = deduped.slice(pageData.skip, pageData.skip + pageData.limit);

    return {
      logs,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async markAsRead(id) {
    if (!id || !/^[a-f\d]{24}$/i.test(String(id))) {
      throw new BadRequestError("Valid notification ID is required");
    }
    const log = await NotificationLog.findByIdAndUpdate(
      id,
      { read: true, readAt: new Date() },
      { new: true }
    )
      .populate("user", "name email mobile role")
      .populate("order", "orderNumber status total shippingAddress createdAt")
      .populate("returnRequest", "status reason type refundAmount");

    if (!log) {
      throw new NotFoundError("Notification not found");
    }
    return log;
  }

  async markAllAsRead() {
    const result = await NotificationLog.updateMany(
      { read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    return {
      modifiedCount: result.modifiedCount
    };
  }

  async sendEmail(to, subject, text) {
    if (!isValidEmail(to) || !subject || !text) {
      throw new BadRequestError("A valid 'to' email, subject and text are required");
    }
    return notifications.email(to, subject, text);
  }

  async sendSms(to, text) {
    if (!isValidIndianMobile(to) || !text) {
      throw new BadRequestError("A valid Indian mobile number and text are required");
    }
    return notifications.sms(to, text);
  }

  async sendWhatsApp(to, text) {
    if (!isValidIndianMobile(to) || !text) {
      throw new BadRequestError("A valid Indian mobile number and text are required");
    }
    return notifications.whatsapp(to, text);
  }

  async deleteLog(id) {
    if (!id || !/^[a-f\d]{24}$/i.test(String(id))) {
      throw new BadRequestError("Valid notification ID is required");
    }
    const log = await NotificationLog.findByIdAndDelete(id);
    if (!log) {
      throw new NotFoundError("Notification not found");
    }
    return { id };
  }
}

module.exports = new NotificationsService();
