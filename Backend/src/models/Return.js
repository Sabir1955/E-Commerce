const { BaseModel } = require("../database/BaseModel");

class Return extends BaseModel {
  static get tableName() {
    return "returns";
  }

  static get columnMap() {
    return {
      orderId: "order_id",
      order: "order_id",
      userId: "user_id",
      user: "user_id",
      refundAmount: "refund_amount",
      adminNote: "admin_note",
      trackingNumber: "tracking_number",
      trackingUrl: "tracking_url",
      pickupLocationId: "pickup_location_id",
      pickupLocation: "pickup_location_id",
      pickupLocationName: "pickup_location_name",
      pickupAddress: "pickup_address",
      trackingEvents: "tracking_events",
      refundReference: "refund_reference",
      evidenceImages: "evidence_images",
      comments: "comments",
      adminMessage: "admin_message",
      rejectionReason: "rejection_reason",
      refundGateway: "refund_gateway",
      refundStatus: "refund_status",
      refundError: "refund_error",
      refundedAt: "refunded_at",
      isRestocked: "is_restocked",
      restockedAt: "restocked_at",
      statusHistory: "status_history"
    };
  }

  static get jsonColumns() {
    return new Set(["items", "tracking_events", "evidence_images", "status_history"]);
  }

  static get booleanColumns() {
    return new Set(["is_restocked"]);
  }

  static get numericColumns() {
    return new Set(["refund_amount"]);
  }

  async save() {
    if (this.order && typeof this.order === "object") {
      this.orderId = this.order._id || this.order.id;
    } else if (this.order && !this.orderId) {
      this.orderId = this.order;
    }
    if (this.user && typeof this.user === "object") {
      this.userId = this.user._id || this.user.id;
    } else if (this.user && !this.userId) {
      this.userId = this.user;
    }
    if (this.pickupLocation && typeof this.pickupLocation === "object") {
      this.pickupLocationId = this.pickupLocation._id || this.pickupLocation.id;
    } else if (this.pickupLocation && !this.pickupLocationId) {
      this.pickupLocationId = this.pickupLocation;
    }
    return super.save();
  }

  static async handlePopulate(returns, path) {
    if (!returns || returns.length === 0 || !path) return;

    if (path === "order" || path.startsWith("order")) {
      const orderIds = [...new Set(returns.map((r) => r.orderId || (typeof r.order === "object" ? r.order?._id || r.order?.id : r.order)).filter(Boolean))];
      if (orderIds.length > 0) {
        const Order = require("./Order");
        const orders = await Order.find({ _id: { $in: orderIds } });
        const orderMap = new Map(orders.map((o) => [String(o.id), o]));
        for (const ret of returns) {
          const oid = String(ret.orderId || (typeof ret.order === "object" ? ret.order?._id || ret.order?.id : ret.order));
          if (orderMap.has(oid)) {
            ret.order = orderMap.get(oid);
          }
        }
      }
    }

    if (path === "user" || path.startsWith("user")) {
      const userIds = [...new Set(returns.map((r) => r.userId || (typeof r.user === "object" ? r.user?._id || r.user?.id : r.user)).filter(Boolean))];
      if (userIds.length > 0) {
        const User = require("./User");
        const users = await User.find({ _id: { $in: userIds } });
        const userMap = new Map(users.map((u) => [String(u.id), u]));
        for (const ret of returns) {
          const uid = String(ret.userId || (typeof ret.user === "object" ? ret.user?._id || ret.user?.id : ret.user));
          if (userMap.has(uid)) {
            ret.user = userMap.get(uid);
          }
        }
      }
    }

    if (path === "pickupLocation" || path.startsWith("pickupLocation")) {
      const locIds = [...new Set(returns.map((r) => r.pickupLocationId || (typeof r.pickupLocation === "object" ? r.pickupLocation?._id || r.pickupLocation?.id : r.pickupLocation)).filter(Boolean))];
      if (locIds.length > 0) {
        const PickupLocation = require("./PickupLocation");
        const locations = await PickupLocation.find({ _id: { $in: locIds } });
        const locMap = new Map(locations.map((l) => [String(l.id), l]));
        for (const ret of returns) {
          const lid = String(ret.pickupLocationId || (typeof ret.pickupLocation === "object" ? ret.pickupLocation?._id || ret.pickupLocation?.id : ret.pickupLocation));
          if (locMap.has(lid)) {
            ret.pickupLocation = locMap.get(lid);
          }
        }
      }
    }

    if (path === "items.product" || path.startsWith("items")) {
      const prodIds = [];
      for (const ret of returns) {
        if (Array.isArray(ret.items)) {
          for (const item of ret.items) {
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
        for (const ret of returns) {
          if (Array.isArray(ret.items)) {
            for (const item of ret.items) {
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

module.exports = Return;
