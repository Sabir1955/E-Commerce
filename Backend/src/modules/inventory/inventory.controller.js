const inventoryService = require("./inventory.service");
const ApiResponse = require("../../utils/apiResponse");

class InventoryController {
  async getInventory(req, res) {
    const result = await inventoryService.getInventory(req.query);
    return ApiResponse.success(res, {
      message: "Inventory retrieved successfully",
      data: result
    });
  }

  async updateStock(req, res) {
    const availability = req.body.available !== undefined
      ? req.body.available
      : (req.body.isAvailable !== undefined ? req.body.isAvailable : req.body.is_available);
    const product = await inventoryService.updateStock(req.params.id, req.body.quantity, availability);
    return ApiResponse.success(res, {
      message: "Stock updated successfully",
      data: product
    });
  }

  async adjustStock(req, res) {
    const product = await inventoryService.adjustStock(req.params.id, req.body.amount);
    return ApiResponse.success(res, {
      message: "Stock adjusted successfully",
      data: product
    });
  }
}

module.exports = new InventoryController();
