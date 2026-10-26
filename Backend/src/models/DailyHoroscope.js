const { BaseModel } = require("../database/BaseModel");

class DailyHoroscope extends BaseModel {
  static get tableName() {
    return "daily_horoscopes";
  }

  static get columnMap() {
    return {
      horoscopeDate: "horoscope_date",
      zodiacSign: "zodiac_sign",
      luckyNumber: "lucky_number",
      luckyColor: "lucky_color",
      imageUrl: "image_url",
      publishAt: "publish_at",
      createdBy: "created_by",
      updatedBy: "updated_by"
    };
  }

  static get jsonColumns() {
    return new Set();
  }

  static get numericColumns() {
    return new Set();
  }

  static get booleanColumns() {
    return new Set();
  }
}

module.exports = DailyHoroscope;
