const { BaseModel } = require("../database/BaseModel");

class Coupon extends BaseModel {
  static get tableName() {
    return "coupons";
  }

  static get columnMap() {
    return {
      discountType: "discount_type",
      discountValue: "discount_value",
      maximumDiscount: "maximum_discount",
      minimumOrderValue: "minimum_order_value",
      usageLimit: "usage_limit",
      startsAt: "starts_at",
      endsAt: "ends_at"
    };
  }

  static get numericColumns() {
    return new Set(["discount_value", "maximum_discount", "minimum_order_value", "usage_limit", "uses"]);
  }

  static get booleanColumns() {
    return new Set(["active"]);
  }
}

module.exports = Coupon;
