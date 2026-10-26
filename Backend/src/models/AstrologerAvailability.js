const { BaseModel } = require("../database/BaseModel");

class AstrologerAvailability extends BaseModel {
  static get tableName() {
    return "astrologer_availability";
  }

  static get columnMap() {
    return {
      astrologerId: "astrologer_id",
      dayOfWeek: "day_of_week",
      startTime: "start_time",
      endTime: "end_time",
      breakStart: "break_start",
      breakEnd: "break_end",
      isActive: "is_active"
    };
  }

  static get numericColumns() {
    return new Set(["day_of_week"]);
  }

  static get booleanColumns() {
    return new Set(["is_active"]);
  }
}

module.exports = AstrologerAvailability;
