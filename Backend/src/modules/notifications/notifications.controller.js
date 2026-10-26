const notificationsService = require("./notifications.service");
const inAppNotificationService = require("../../services/inAppNotification.service");
const ApiResponse = require("../../utils/apiResponse");

class NotificationsController {
  // In-App Notifications for Current User
  async getMyNotifications(req, res) {
    const userId = req.user._id || req.user.id;
    const { limit = 20, offset = 0, unreadOnly = false } = req.query;
    const result = await inAppNotificationService.getUserNotifications(userId, {
      limit,
      offset,
      unreadOnly: unreadOnly === "true" || unreadOnly === true
    });
    return ApiResponse.success(res, {
      message: "Notifications retrieved successfully",
      data: result
    });
  }

  async getMyUnreadCount(req, res) {
    const userId = req.user._id || req.user.id;
    const count = await inAppNotificationService.getUnreadCount(userId);
    return ApiResponse.success(res, {
      message: "Unread count retrieved",
      data: { count }
    });
  }

  async markMyNotificationRead(req, res) {
    const userId = req.user._id || req.user.id;
    const result = await inAppNotificationService.markAsRead(req.params.id, userId);
    return ApiResponse.success(res, {
      message: "Notification marked as read",
      data: result
    });
  }

  async markAllMyNotificationsRead(req, res) {
    const userId = req.user._id || req.user.id;
    const result = await inAppNotificationService.markAllAsRead(userId);
    return ApiResponse.success(res, {
      message: "All notifications marked as read",
      data: result
    });
  }

  // Admin Logs & Dispatch
  async getLogs(req, res) {
    const result = await notificationsService.getLogs(req.query);
    return ApiResponse.success(res, {
      message: "Notification logs retrieved successfully",
      data: result
    });
  }

  async markAsRead(req, res) {
    const result = await notificationsService.markAsRead(req.params.id);
    return ApiResponse.success(res, {
      message: "Notification marked as read",
      data: result
    });
  }

  async markAllAsRead(req, res) {
    const result = await notificationsService.markAllAsRead();
    return ApiResponse.success(res, {
      message: "All notifications marked as read",
      data: result
    });
  }

  async sendEmail(req, res) {
    const result = await notificationsService.sendEmail(req.body.to, req.body.subject, req.body.text);
    return ApiResponse.success(res, {
      message: result.sent ? "Email sent successfully" : `Email skipped: ${result.reason}`,
      data: result
    });
  }

  async sendSms(req, res) {
    const result = await notificationsService.sendSms(req.body.to, req.body.text);
    return ApiResponse.success(res, {
      message: result.sent ? "SMS sent successfully" : `SMS skipped: ${result.reason}`,
      data: result
    });
  }

  async sendWhatsApp(req, res) {
    const result = await notificationsService.sendWhatsApp(req.body.to, req.body.text);
    return ApiResponse.success(res, {
      message: result.sent ? "WhatsApp message sent successfully" : `WhatsApp skipped: ${result.reason}`,
      data: result
    });
  }

  async delete(req, res) {
    await notificationsService.deleteLog(req.params.id);
    return ApiResponse.success(res, {
      message: "Notification deleted successfully"
    });
  }
}

module.exports = new NotificationsController();
