const { BaseModel } = require("../database/BaseModel");

class Cart extends BaseModel {
  static get tableName() {
    return "carts";
  }

  static get columnMap() {
    return {
      userId: "user_id",
      user: "user_id"
    };
  }

  static get jsonColumns() {
    return new Set(["items"]);
  }

  async save() {
    if (this.user && typeof this.user === "object") {
      this.userId = this.user._id || this.user.id;
    } else if (this.user && !this.userId) {
      this.userId = this.user;
    }
    return super.save();
  }

  static async handlePopulate(carts, path) {
    if (!carts || carts.length === 0) return;
    if (path === "items.product" || path.startsWith("items")) {
      const prodIds = [];
      for (const cart of carts) {
        if (Array.isArray(cart.items)) {
          for (const item of cart.items) {
            const pid = item.product ? (typeof item.product === "object" ? item.product._id || item.product.id : item.product) : null;
            if (pid) prodIds.push(String(pid));
          }
        }
      }
      const uniqueProdIds = [...new Set(prodIds)];
      if (uniqueProdIds.length > 0) {
        const Product = require("./Product");
        const products = await Product.find({ _id: { $in: uniqueProdIds } });
        const prodMap = new Map(products.map((p) => [String(p.id), p]));
        for (const cart of carts) {
          if (Array.isArray(cart.items)) {
            for (const item of cart.items) {
              const pid = item.product ? String(typeof item.product === "object" ? item.product._id || item.product.id : item.product) : null;
              if (pid && prodMap.has(pid)) {
                item.product = prodMap.get(pid);
              }
            }
          }
        }
      }
    }
  }
}

module.exports = Cart;
