const customersService = require("./customers.service");
const ApiResponse = require("../../utils/apiResponse");

class CustomersController {
  async list(req, res) {
    const result = await customersService.listCustomers(req.query);
    return ApiResponse.success(res, {
      message: "Customers retrieved successfully",
      data: result
    });
  }

  async getById(req, res) {
    const result = await customersService.getCustomerById(req.params.id, req.query);
    return ApiResponse.success(res, {
      message: "Customer details retrieved successfully",
      data: result
    });
  }

  async updateStatus(req, res) {
    const customer = await customersService.updateCustomerStatus(req.params.id, req.body.active);
    return ApiResponse.success(res, {
      message: "Customer status updated successfully",
      data: customer
    });
  }
}

module.exports = new CustomersController();
