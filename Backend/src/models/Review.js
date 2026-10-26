const { BaseModel } = require("../database/BaseModel");

class Review extends BaseModel {
  static get tableName() {
    return "reviews";
  }

  static get columnMap() {
    return {
      productId: "product_id",
      product: "product_id",
      userId: "user_id",
      user: "user_id",
      orderId: "order_id",
      order: "order_id",
      verifiedPurchase: "verified_purchase"
    };
  }

  static get numericColumns() {
    return new Set(["rating"]);
  }

  static get booleanColumns() {
    return new Set(["verified_purchase"]);
  }

  async save() {
    if (this.product && typeof this.product === "object") {
      this.productId = this.product._id || this.product.id;
    } else if (this.product && !this.productId) {
      this.productId = this.product;
    }
    if (this.user && typeof this.user === "object") {
      this.userId = this.user._id || this.user.id;
    } else if (this.user && !this.userId) {
      this.userId = this.user;
    }
    if (this.order && typeof this.order === "object") {
      this.orderId = this.order._id || this.order.id;
    } else if (this.order && !this.orderId) {
      this.orderId = this.order;
    }
    return super.save();
  }

  static async handlePopulate(reviews, path) {
    if (!reviews || reviews.length === 0 || !path) return;

    if (path === "user" || path.startsWith("user")) {
      const userIds = [...new Set(reviews.map((r) => r.userId || (typeof r.user === "object" ? r.user?._id || r.user?.id : r.user)).filter(Boolean))];
      if (userIds.length > 0) {
        const User = require("./User");
        const users = await User.find({ _id: { $in: userIds } });
        const userMap = new Map(users.map((u) => [String(u.id), u]));
        for (const review of reviews) {
          const uid = String(review.userId || (typeof review.user === "object" ? review.user?._id || review.user?.id : review.user));
          if (userMap.has(uid)) {
            review.user = userMap.get(uid);
          }
        }
      }
    }

    if (path === "product" || path.startsWith("product")) {
      const prodIds = [...new Set(reviews.map((r) => r.productId || (typeof r.product === "object" ? r.product?._id || r.product?.id : r.product)).filter(Boolean))];
      if (prodIds.length > 0) {
        const Product = require("./Product");
        const products = await Product.find({ _id: { $in: prodIds } });
        const prodMap = new Map(products.map((p) => [String(p.id), p]));
        for (const review of reviews) {
          const pid = String(review.productId || (typeof review.product === "object" ? review.product?._id || review.product?.id : review.product));
          if (prodMap.has(pid)) {
            review.product = prodMap.get(pid);
          }
        }
      }
    }

    if (path === "order" || path.startsWith("order")) {
      const orderIds = [...new Set(reviews.map((r) => r.orderId || (typeof r.order === "object" ? r.order?._id || r.order?.id : r.order)).filter(Boolean))];
      if (orderIds.length > 0) {
        const Order = require("./Order");
        const orders = await Order.find({ _id: { $in: orderIds } });
        const orderMap = new Map(orders.map((o) => [String(o.id), o]));
        for (const review of reviews) {
          const oid = String(review.orderId || (typeof review.order === "object" ? review.order?._id || review.order?.id : review.order));
          if (orderMap.has(oid)) {
            review.order = orderMap.get(oid);
          }
        }
      }
    }
  }
}

module.exports = Review;
