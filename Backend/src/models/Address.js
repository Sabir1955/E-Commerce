const { BaseModel } = require("../database/BaseModel");

class Address extends BaseModel {
  static get tableName() {
    return "addresses";
  }

  static get columnMap() {
    return {
      userId: "user_id",
      user: "user_id",
      fullName: "full_name",
      useRegisteredMobile: "use_registered_mobile",
      postalCode: "postal_code",
      pinCode: "postal_code",
      pin: "postal_code",
      isDefault: "is_default"
    };
  }

  static get booleanColumns() {
    return new Set(["use_registered_mobile", "is_default"]);
  }

  async save() {
    if (this.user && typeof this.user === "object") {
      this.userId = this.user._id || this.user.id;
    } else if (this.user && !this.userId) {
      this.userId = this.user;
    }
    return super.save();
  }
}

module.exports = Address;
