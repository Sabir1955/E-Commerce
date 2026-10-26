const { BaseModel } = require("../database/BaseModel");

class Astrologer extends BaseModel {
  static get tableName() {
    return "astrologers";
  }

  static get columnMap() {
    return {
      photoUrl: "photo_url",
      experienceYears: "experience_years",
      reviewCount: "review_count",
      feePerSession: "fee_per_session",
      allowedDurations: "allowed_durations",
      durationPricing: "duration_pricing",
      displayOrder: "display_order",
      officeName: "office_name",
      officeAddress: "office_address",
      officeCity: "office_city",
      officeState: "office_state",
      officePincode: "office_pincode",
      officeMapsUrl: "office_maps_url",
      officeInstructions: "office_instructions",
      allowOnline: "allow_online",
      allowOffline: "allow_offline",
      consultationTitle: "consultation_title",
      organizationName: "organization_name",
      venueTitle: "venue_title",
      visitingHours: "visiting_hours",
      workingDays: "working_days"
    };
  }

  static get jsonColumns() {
    return new Set(["specialties", "languages", "allowed_durations", "duration_pricing"]);
  }

  static get numericColumns() {
    return new Set(["experience_years", "rating", "review_count", "fee_per_session", "display_order"]);
  }

  static get booleanColumns() {
    return new Set(["active", "allow_online", "allow_offline"]);
  }
}

module.exports = Astrologer;
