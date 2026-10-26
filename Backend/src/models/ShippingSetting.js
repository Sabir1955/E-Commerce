const { BaseModel } = require("../database/BaseModel");

class ShippingSetting extends BaseModel {
  static get tableName() {
    return "shipping_settings";
  }

  static get columnMap() {
    return {
      freeShippingMinimum: "free_shipping_minimum",
      estimatedDaysMin: "estimated_days_min",
      estimatedDaysMax: "estimated_days_max",
      defaultReturnDays: "default_return_days",
      returnPolicyActive: "return_policy_active"
    };
  }

  static get numericColumns() {
    return new Set(["charge", "free_shipping_minimum", "estimated_days_min", "estimated_days_max", "default_return_days"]);
  }

  static get booleanColumns() {
    return new Set(["return_policy_active", "active"]);
  }
}

module.exports = ShippingSetting;
