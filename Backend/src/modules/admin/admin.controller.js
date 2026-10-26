const adminService = require("./admin.service");
const customersService = require("../customers/customers.service");
const inventoryService = require("../inventory/inventory.service");
const ordersService = require("../orders/orders.service");
const ApiResponse = require("../../utils/apiResponse");

class AdminController {
  async getDashboard(req, res) {
    const summary = await adminService.getDashboardSummary();
    return ApiResponse.success(res, {
      message: "Admin dashboard metrics retrieved successfully",
      data: summary,
      ...summary
    });
  }

  async getSalesAnalytics(req, res) {
    const result = await adminService.getSalesAnalytics();
    return ApiResponse.success(res, {
      message: "Sales analytics retrieved successfully",
      data: result,
      ...result
    });
  }

  async getOrdersAnalytics(req, res) {
    const result = await adminService.getOrdersAnalytics();
    return ApiResponse.success(res, {
      message: "Orders analytics retrieved successfully",
      data: result,
      ...result
    });
  }

  async getInventoryAnalytics(req, res) {
    const result = await adminService.getInventoryAnalytics();
    return ApiResponse.success(res, {
      message: "Inventory analytics retrieved successfully",
      data: result,
      ...result
    });
  }

  async getDateWiseReport(req, res) {
    const reportsService = require("./reports.service");
    const result = await reportsService.getDateWiseReport(req.query);
    return ApiResponse.success(res, {
      message: "Date-wise reports and analytics retrieved successfully",
      data: result,
      ...result
    });
  }

  async getDateWiseOrders(req, res) {
    const reportsService = require("./reports.service");
    const result = await reportsService.getDateWiseOrders(req.query);
    return ApiResponse.success(res, {
      message: "Date-wise order details retrieved successfully",
      data: result,
      ...result
    });
  }


  async listCustomers(req, res) {
    const result = await customersService.listCustomers(req.query);
    return ApiResponse.success(res, {
      message: "Customers retrieved successfully",
      data: result,
      ...result
    });
  }

  async getCustomerById(req, res) {
    const result = await customersService.getCustomerById(req.params.id, req.query);
    return ApiResponse.success(res, {
      message: "Customer details retrieved successfully",
      data: result,
      ...result
    });
  }

  async updateCustomerStatus(req, res) {
    const customer = await customersService.updateCustomerStatus(req.params.id, req.body.active);
    return ApiResponse.success(res, {
      message: "Customer status updated successfully",
      data: customer
    });
  }

  async getInventory(req, res) {
    const result = await inventoryService.getInventory(req.query);
    return ApiResponse.success(res, {
      message: "Inventory retrieved successfully",
      data: result,
      ...result
    });
  }

  async listOrders(req, res) {
    const result = await ordersService.listAllOrders(req.query);
    return ApiResponse.success(res, {
      message: "Orders retrieved successfully",
      data: result,
      ...result
    });
  }

  async updateProductReturnPolicy(req, res) {
    const result = await adminService.updateProductReturnPolicy(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: result.message,
      data: result.product,
      product: result.product
    });
  }


  async bulkUpdateReturnPolicy(req, res) {
    const result = await adminService.bulkUpdateReturnPolicy(req.body);
    return ApiResponse.success(res, {
      message: result.message,
      data: result
    });
  }

  async getStoreAddress(req, res) {
    const result = await adminService.getStoreAddress(req.user);
    return ApiResponse.success(res, {
      message: "Store address retrieved successfully",
      data: result,
      ...result
    });
  }

  async updateStoreAddress(req, res) {
    const result = await adminService.updateStoreAddress(req.user, req.body);
    return ApiResponse.success(res, {
      message: "Store address updated successfully",
      data: result,
      ...result
    });
  }
}

module.exports = new AdminController();
