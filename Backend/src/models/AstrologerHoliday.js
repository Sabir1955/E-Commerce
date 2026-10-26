const { BaseModel } = require("../database/BaseModel");

class AstrologerHoliday extends BaseModel {
  static get tableName() {
    return "astrologer_holidays";
  }

  static get columnMap() {
    return {
      astrologerId: "astrologer_id",
      holidayDate: "holiday_date"
    };
  }
}

module.exports = AstrologerHoliday;
