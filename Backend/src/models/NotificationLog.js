const { BaseModel } = require("../database/BaseModel");

class NotificationLog extends BaseModel {
  static get tableName() {
    return "notification_logs";
  }

  static get columnMap() {
    return {
      userId: "user_id",
      user: "user_id",
      orderId: "order_id",
      order: "order_id",
      returnRequestId: "return_request_id",
      readAt: "read_at"
    };
  }

  static get booleanColumns() {
    return new Set(["read"]);
  }

  async save() {
    if (this.user && typeof this.user === "object") {
      this.userId = this.user._id || this.user.id;
    } else if (this.user && !this.userId) {
      this.userId = this.user;
    }
    if (this.order && typeof this.order === "object") {
      this.orderId = this.order._id || this.order.id;
    } else if (this.order && !this.orderId) {
      this.orderId = this.order;
    }
    return super.save();
  }
}

module.exports = NotificationLog;
