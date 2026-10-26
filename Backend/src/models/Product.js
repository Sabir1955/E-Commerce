const { BaseModel } = require("../database/BaseModel");

class Product extends BaseModel {
  static get tableName() {
    return "products";
  }

  static get columnMap() {
    return {
      categoryId: "category_id",
      imageUrl: "image_url",
      imageFileId: "image_file_id",
      imageFileIds: "image_file_ids",
      reviewCount: "review_count",
      isReturnable: "is_returnable",
      returnWindowDays: "return_window_days",
      isReplaceable: "is_replaceable",
      isAvailable: "is_available",
      available: "is_available",
      is_available: "is_available"
    };
  }

  static get jsonColumns() {
    return new Set(["dimensions", "images", "image_file_ids", "attributes"]);
  }

  static get numericColumns() {
    return new Set(["price", "weight", "stock", "rating", "review_count", "popularity", "return_window_days"]);
  }

  static get booleanColumns() {
    return new Set(["featured", "is_returnable", "is_replaceable", "active", "is_available"]);
  }

  get available() {
    return this.isAvailable !== false;
  }

  set available(val) {
    this.isAvailable = Boolean(val);
  }

  get is_available() {
    return this.isAvailable !== false;
  }

  set is_available(val) {
    this.isAvailable = Boolean(val);
  }

  toObject() {
    const obj = super.toObject();
    obj.available = this.available;
    obj.isAvailable = this.isAvailable !== false;
    obj.is_available = this.is_available;
    return obj;
  }

  validate() {
    if (!this.slug && this.name) {
      this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    return Promise.resolve();
  }
}

Product.schema = {
  indexes: () => [
    [{ name: "text", description: "text" }],
    [{ active: 1, popularity: -1 }],
    [{ active: 1, rating: -1 }],
    [{ active: 1, createdAt: -1 }],
    [{ category: 1, active: 1, price: 1 }]
  ]
};

module.exports = Product;
