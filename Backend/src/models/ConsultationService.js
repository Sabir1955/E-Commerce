const { BaseModel } = require("../database/BaseModel");

class ConsultationService extends BaseModel {
  static get tableName() {
    return "consultation_services";
  }

  static get columnMap() {
    return {
      astrologerId: "astrologer_id",
      allowOnline: "allow_online",
      allowOffline: "allow_offline",
      onlineFee: "online_fee",
      offlineFee: "offline_fee",
      allowedDurations: "allowed_durations",
      durationPricing: "duration_pricing",
      displayOrder: "display_order"
    };
  }

  static get jsonColumns() {
    return new Set(["allowed_durations", "duration_pricing"]);
  }

  static get numericColumns() {
    return new Set(["online_fee", "offline_fee", "display_order"]);
  }

  static get booleanColumns() {
    return new Set(["active", "allow_online", "allow_offline"]);
  }
}

module.exports = ConsultationService;
