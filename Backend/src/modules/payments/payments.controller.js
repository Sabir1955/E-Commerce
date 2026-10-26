const paymentsService = require("./payments.service");
const ApiResponse = require("../../utils/apiResponse");

class PaymentsController {
  async createRazorpayOrder(req, res) {
    const result = await paymentsService.createRazorpayOrder(
      req.params.orderId,
      req.user,
      req.body.method
    );
    return ApiResponse.created(res, {
      message: "Razorpay order created successfully",
      data: result,
      ...result
    });
  }

  async initiate(req, res) {
    const result = await paymentsService.initiatePayment(
      req.params.orderId,
      req.user,
      req.body.method
    );
    return ApiResponse.created(res, {
      message: result.message,
      data: result.payment
    });
  }

  async verify(req, res) {
    const result = await paymentsService.verifyPayment(
      req.params.orderId,
      req.user,
      req.body
    );
    return ApiResponse.success(res, {
      message: "Payment verified successfully",
      data: result,
      ...result
    });
  }

  async getByOrderId(req, res) {
    const payment = await paymentsService.getPaymentByOrderId(req.params.orderId, req.user);
    return ApiResponse.success(res, {
      message: "Payment details retrieved successfully",
      data: { payment }
    });
  }

  async updatePayment(req, res) {
    const result = await paymentsService.updatePayment(req.params.orderId, req.body);
    return ApiResponse.success(res, {
      message: "Payment status updated successfully",
      data: result
    });
  }

  async createDirectOrder(req, res) {
    const result = await paymentsService.createDirectOrder(
      req.body?.items,
      req.user,
      req.body?.shippingAddress,
      req.body
    );
    return res.status(201).json(result);
  }

  async verifyDirect(req, res) {
    const result = await paymentsService.verifyDirectPayment(req.body);
    return res.status(200).json(result);
  }

  async createEasebuzzOrder(req, res) {
    const result = await paymentsService.createEasebuzzOrder(
      req.params.orderId,
      req.user
    );
    return ApiResponse.created(res, {
      message: "Easebuzz order created successfully",
      data: result,
      ...result
    });
  }

  async verifyEasebuzz(req, res) {
    const result = await paymentsService.verifyEasebuzzPayment(req.body);
    const isRecognized = ["paid", "cancelled", "usercancelled", "pending", "failed"].includes(result.status);
    return res.status(isRecognized ? 200 : 400).json(result);
  }

  async handleEasebuzzCallback(req, res) {
    const payload = { ...req.query, ...req.body };
    try {
      const result = await paymentsService.handleEasebuzzCallback(payload);
      // If requested by a browser redirect
      if (req.accepts("html") && !req.xhr) {
        const orderParam = result.orderNumber || result.order?._id || result.recordId || "";
        const statusParam = result.status || "failed";
        const txnidParam = result.txnid || payload.txnid || "";
        return res.redirect(`/checkout?easebuzz_status=${encodeURIComponent(statusParam)}&order=${encodeURIComponent(orderParam)}&recordId=${encodeURIComponent(result.recordId || "")}&txnid=${encodeURIComponent(txnidParam)}`);
      }
      const isRecognized = ["paid", "cancelled", "usercancelled", "pending", "failed"].includes(result.status);
      return res.status(isRecognized ? 200 : 400).json(result);
    } catch (err) {
      if (req.accepts("html") && !req.xhr) {
        return res.redirect(`/checkout?easebuzz_status=failed&error=${encodeURIComponent(err.message)}`);
      }
      return res.status(400).json({ status: "failed", message: err.message });
    }
  }

  async recordFailure(req, res) {
    const result = await paymentsService.recordDirectFailure(req.body);
    return res.status(200).json(result);
  }
}

module.exports = new PaymentsController();

