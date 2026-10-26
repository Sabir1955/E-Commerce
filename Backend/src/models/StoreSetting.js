const { BaseModel } = require("../database/BaseModel");

class StoreSetting extends BaseModel {
  static get tableName() {
    return "store_settings";
  }

  static get columnMap() {
    return {
      storeName: "store_name",
      contactName: "contact_name",
      addressLine: "address_line",
      pinCode: "pin_code"
    };
  }
}

module.exports = StoreSetting;
