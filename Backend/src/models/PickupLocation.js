const { BaseModel } = require("../database/BaseModel");

class PickupLocation extends BaseModel {
  static get tableName() {
    return "pickup_locations";
  }

  static get columnMap() {
    return {
      contactName: "contact_name",
      postalCode: "postal_code",
      pinCode: "postal_code",
      isDefault: "is_default"
    };
  }

  static get booleanColumns() {
    return new Set(["active", "is_default"]);
  }
}

module.exports = PickupLocation;
