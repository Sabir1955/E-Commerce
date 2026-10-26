const { BaseModel } = require("../database/BaseModel");
const db = require("../database/db");

class Order extends BaseModel {
  static get tableName() {
    return "orders";
  }

  static get columnMap() {
    return {
      orderNumber: "order_number",
      userId: "user_id",
      user: "user_id",
      shippingFee: "shipping_fee",
      discountAmount: "discount_amount",
      shippingAddress: "shipping_address",
      paymentStatus: "payment_status",
      paymentMethod: "payment_method",
      stockReserved: "stock_reserved",
      stockDeducted: "stock_deducted",
      stockReservationExpiresAt: "stock_reservation_expires_at",
      stockReleasedAt: "stock_released_at",
      trackingEvents: "tracking_events",
      couponCode: "coupon_code",
      referralCode: "referral_code",
      invoiceNumber: "invoice_number",
      courierName: "courier_name",
      trackingId: "tracking_id",
      confirmedAt: "confirmed_at",
      confirmedBy: "confirmed_by",
      deliveredAt: "delivered_at",
      rejectionReason: "rejection_reason",
      cancelledBy: "cancelled_by"
    };
  }

  static get jsonColumns() {
    return new Set(["shipping_address", "items", "tracking_events", "confirmed_by", "shipment", "cancelled_by"]);
  }

  static get numericColumns() {
    return new Set(["subtotal", "shipping_fee", "discount_amount", "total"]);
  }

  static get booleanColumns() {
    return new Set(["stock_reserved", "stock_deducted"]);
  }

  get user() {
    return this._userObj || this.userId;
  }

  set user(val) {
    if (val && typeof val === "object") {
      this._userObj = val;
      this.userId = val._id || val.id;
    } else {
      this.userId = val;
      this._userObj = undefined;
    }
  }

  static async generateOrderNumber() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const prefix = `ORD ${year}/${month}/`;
    const res = await db.query(
      "SELECT order_number FROM orders WHERE order_number LIKE $1 ORDER BY length(order_number) DESC, order_number DESC LIMIT 1",
      [`${prefix}%`]
    );
    let seq = 1;
    if (res.rows.length > 0) {
      const match = res.rows[0].order_number.match(/\/(\d+)$/);
      if (match) {
        seq = parseInt(match[1], 10) + 1;
      }
    }
    while (true) {
      const candidate = `${prefix}${String(seq).padStart(3, "0")}`;
      const existsRes = await db.query("SELECT 1 FROM orders WHERE order_number = $1", [candidate]);
      if (existsRes.rowCount === 0) {
        return candidate;
      }
      seq++;
    }
  }

  static async handlePopulate(orders, path) {
    if (!orders || orders.length === 0) return;

    if (path === "user" || path.startsWith("user")) {
      const userIds = [...new Set(orders.map((o) => o.userId || o.user).filter(Boolean))];
      if (userIds.length > 0) {
        const User = require("./User");
        const users = await User.find({ _id: { $in: userIds } });
        const userMap = new Map(users.map((u) => [String(u.id), u]));
        for (const order of orders) {
          const uid = String(order.userId || order.user);
          if (userMap.has(uid)) {
            order.user = userMap.get(uid);
          }
        }
      }
    }

    if (path === "items.product" || path.startsWith("items")) {
      const prodIds = [];
      for (const order of orders) {
        if (Array.isArray(order.items)) {
          for (const item of order.items) {
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
        for (const order of orders) {
          if (Array.isArray(order.items)) {
            for (const item of order.items) {
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

  // Pre-save to sync user_id and order_items
  async save() {
    if (this.user && typeof this.user === "object") {
      this.userId = this.user._id || this.user.id;
    } else if (this.user && !this.userId) {
      this.userId = this.user;
    }

    if (!this.orderNumber) {
      this.orderNumber = await Order.generateOrderNumber();
    }

    await super.save();

    // Sync normalized order_items table
    if (Array.isArray(this.items) && this.items.length > 0) {
      await db.query("DELETE FROM order_items WHERE order_id = $1", [this.id]).catch(() => {});
      for (let idx = 0; idx < this.items.length; idx++) {
        const it = this.items[idx];
        const itemId = `${this.id}_item_${idx}`;
        const prodId = it.product ? String(typeof it.product === "object" ? it.product._id || it.product.id : it.product) : null;
        await db.query(
          `INSERT INTO order_items (id, order_id, product_id, name, price, quantity, image, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            itemId,
            this.id,
            prodId,
            it.name || "Product",
            Number(it.price) || 0,
            Number(it.quantity) || 1,
            it.image || it.imageUrl || null,
            this.createdAt || new Date()
          ]
        ).catch(() => {});
      }
    }

    return this;
  }
}

module.exports = Order;
