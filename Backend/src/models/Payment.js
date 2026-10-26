const { BaseModel } = require("../database/BaseModel");

class Payment extends BaseModel {
  static get tableName() {
    return "payments";
  }

  static get columnMap() {
    return {
      orderId: "order_id",
      order: "order_id",
      userId: "user_id",
      user: "user_id",
      clientReference: "client_reference",
      gatewayOrderId: "gateway_order_id",
      gatewayMethod: "gateway_method",
      transactionId: "transaction_id",
      failureReason: "failure_reason",
      paidAt: "paid_at",
      refundedAt: "refunded_at"
    };
  }

  static get jsonColumns() {
    return new Set(["items"]);
  }

  static get numericColumns() {
    return new Set(["amount"]);
  }

  get order() {
    return this.orderId;
  }

  set order(val) {
    if (val && typeof val === "object") {
      this.orderId = val._id || val.id;
    } else {
      this.orderId = val;
    }
  }

  get user() {
    return this.userId;
  }

  set user(val) {
    if (val && typeof val === "object") {
      this.userId = val._id || val.id;
    } else {
      this.userId = val;
    }
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
    return super.save();
  }
}

module.exports = Payment;
