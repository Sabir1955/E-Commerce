const { BaseModel } = require("../database/BaseModel");

class Category extends BaseModel {
  static get tableName() {
    return "categories";
  }

  static get columnMap() {
    return {
      displayOrder: "display_order"
    };
  }

  static get booleanColumns() {
    return new Set(["active"]);
  }

  static get numericColumns() {
    return new Set(["display_order"]);
  }

  validate() {
    if (!this.slug && this.name) {
      this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    return Promise.resolve();
  }
}

module.exports = Category;
