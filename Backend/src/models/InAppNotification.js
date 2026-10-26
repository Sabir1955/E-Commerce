const { BaseModel } = require("../database/BaseModel");

class InAppNotification extends BaseModel {
  static get tableName() {
    return "in_app_notifications";
  }

  static get columnMap() {
    return {
      userId: "user_id",
      user: "user_id",
      isRead: "is_read",
      readAt: "read_at"
    };
  }

  static get jsonColumns() {
    return new Set(["metadata"]);
  }

  static get booleanColumns() {
    return new Set(["is_read"]);
  }
}

module.exports = InAppNotification;
