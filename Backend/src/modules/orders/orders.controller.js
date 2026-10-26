const ordersService = require("./orders.service");
const ApiResponse = require("../../utils/apiResponse");
const { ForbiddenError } = require("../../utils/errors");

class OrdersController {
  async create(req, res, next) {
    try {
      const order = await ordersService.createOrder(req.user, req.body);
      const orderObj = order.toObject ? order.toObject() : order;
      return ApiResponse.created(res, {
        message: "Order created successfully",
        data: orderObj,
        order: orderObj
      });
    } catch (err) {
      if (typeof next === "function") return next(err);
      throw err;
    }
  }

  async getMyOrders(req, res) {
    const result = await ordersService.getMyOrders(req.user._id, req.query, req.user);
    return ApiResponse.success(res, {
      message: "Order history retrieved successfully",
      data: result,
      orders: result.orders
    });
  }

  async getById(req, res) {
    const result = await ordersService.getOrderById(req.params.id, req.user);
    return ApiResponse.success(res, {
      message: "Order details retrieved successfully",
      data: result,
      order: result.order,
      payment: result.payment
    });
  }

  async getTracking(req, res) {
    const result = await ordersService.getOrderTracking(req.params.id, req.user);
    return ApiResponse.success(res, {
      message: "Order tracking retrieved successfully",
      data: result
    });
  }

  async trackByOrderId(req, res) {
    const orderId = req.params.orderId || req.params.id || req.query.orderId;
    const result = await ordersService.trackByOrderId(orderId);
    return ApiResponse.success(res, {
      message: "Order tracking retrieved successfully",
      data: result,
      order: result.order,
      orders: result.orders
    });
  }

  async track(req, res) {
    const id = req.params.orderId || req.params.id || req.query.orderId || req.query.id;
    const result = await ordersService.trackByOrderId(id);
    return ApiResponse.success(res, {
      message: "Order tracking retrieved successfully",
      data: result,
      order: result.order,
      orders: result.orders
    });
  }

  async trackByUser(req, res) {
    const userId = req.params.userId || req.query.userId || req.params.id;
    if (req.user && req.user.role !== "admin" && String(req.user._id) !== String(userId)) {
      throw new ForbiddenError("You are not authorized to view tracking for other users");
    }
    const result = await ordersService.trackOrderByUserId(userId);
    return ApiResponse.success(res, {
      message: "Order tracking retrieved successfully",
      data: result,
      orders: result.orders,
      order: result.order
    });
  }

  async getInvoice(req, res) {
    const { pdf, filename } = await ordersService.getInvoicePdf(req.params.id, req.user);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`
    });
    return res.send(pdf);
  }

  async reorder(req, res) {
    const result = await ordersService.reorderItems(req.params.id, req.user._id);
    return ApiResponse.success(res, {
      message: result.message,
      data: result
    });
  }

  async updateStatus(req, res) {
    const order = await ordersService.updateOrderStatus(req.params.id, req.body, req.user);
    return ApiResponse.success(res, {
      message: "Order status updated successfully",
      data: order,
      order
    });
  }

  async updatePayment(req, res) {
    const payment = await ordersService.updateOrderPayment(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: "Order payment status updated successfully",
      data: payment
    });
  }

  async listAll(req, res) {
    const result = await ordersService.listAllOrders(req.query);
    return ApiResponse.success(res, {
      message: "Orders retrieved successfully",
      data: result
    });
  }

  async getStatuses(req, res) {
    const statuses = await ordersService.getOrderStatuses();
    return ApiResponse.success(res, {
      message: "Order statuses retrieved successfully",
      data: statuses
    });
  }

  async cancel(req, res) {
    const order = await ordersService.cancelOrder(req.params.id, req.user, req.body.reason);
    return ApiResponse.success(res, {
      message: "Order cancelled successfully",
      data: order
    });
  }
}

module.exports = new OrdersController();

