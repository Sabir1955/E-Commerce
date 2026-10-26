const addressesService = require("./addresses.service");
const ApiResponse = require("../../utils/apiResponse");

class AddressesController {
  async list(req, res) {
    const result = await addressesService.listAddresses(req.user._id, req.query);
    return ApiResponse.success(res, {
      message: "Addresses retrieved successfully",
      data: result
    });
  }

  async create(req, res) {
    const address = await addressesService.createAddress(req.user, req.body);
    return ApiResponse.created(res, {
      message: "Address created successfully",
      data: address
    });
  }

  async update(req, res) {
    const address = await addressesService.updateAddress(req.user._id, req.user.mobile, req.params.id, req.body);
    return ApiResponse.success(res, {
      message: "Address updated successfully",
      data: address
    });
  }

  async delete(req, res) {
    await addressesService.deleteAddress(req.user._id, req.params.id);
    return ApiResponse.success(res, {
      message: "Address deleted"
    });
  }
}

module.exports = new AddressesController();
