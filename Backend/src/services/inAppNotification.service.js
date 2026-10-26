const InAppNotification = require("../models/InAppNotification");
const db = require("../database/db");

class InAppNotificationService {
  /**
   * Create an in-app notification for a user
   */
  static async createNotification({ userId, title, message, type = "info", link = null, metadata = {} }) {
    if (!userId || !title || !message) {
      throw new Error("userId, title, and message are required for notifications");
    }

    const notification = await InAppNotification.create({
      userId,
      title,
      message,
      type,
      link,
      isRead: false,
      metadata
    });

    return notification;
  }

  /**
   * Get paginated notifications for a user
   */
  static async getUserNotifications(userId, { limit = 20, offset = 0, unreadOnly = false } = {}) {
    const filter = { userId };
    if (unreadOnly) {
      filter.isRead = false;
    }

    const notifications = await InAppNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit));

    const total = await InAppNotification.countDocuments(filter);
    const unreadCount = await InAppNotification.countDocuments({ userId, isRead: false });

    return {
      notifications,
      total,
      unreadCount,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Mark a specific notification as read
   */
  static async markAsRead(notificationId, userId) {
    const res = await db.query(
      `UPDATE in_app_notifications
       SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );

    if (res.rowCount === 0) {
      return null;
    }
    return InAppNotification.fromRow(res.rows[0]);
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId) {
    const res = await db.query(
      `UPDATE in_app_notifications
       SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND is_read = FALSE
       RETURNING id`,
      [userId]
    );

    return { updatedCount: res.rowCount };
  }

  /**
   * Get unread count
   */
  static async getUnreadCount(userId) {
    return await InAppNotification.countDocuments({ userId, isRead: false });
  }
}

module.exports = InAppNotificationService;
