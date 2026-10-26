const cartService = require("./cart.service");
const ApiResponse = require("../../utils/apiResponse");

class CartController {
  async get(req, res) {
    const cart = await cartService.getCart(req.user._id);
    return ApiResponse.success(res, {
      message: "Cart retrieved successfully",
      data: { cart, ...cart }
    });
  }

  async addItem(req, res) {
    const cart = await cartService.addItem(req.user._id, req.body);
    return ApiResponse.created(res, {
      message: "Item added to cart",
      data: { cart, ...cart }
    });
  }

  async updateItem(req, res) {
    const cart = await cartService.updateItemQuantity(req.user._id, req.params.productId, req.body.quantity);
    return ApiResponse.success(res, {
      message: "Cart item updated",
      data: { cart, ...cart }
    });
  }

  async removeItem(req, res) {
    const cart = await cartService.removeItem(req.user._id, req.params.productId);
    return ApiResponse.success(res, {
      message: "Cart item removed",
      data: { cart, ...cart }
    });
  }

  async clear(req, res) {
    const cart = await cartService.clearCart(req.user._id);
    return ApiResponse.success(res, {
      message: "Cart cleared",
      data: { cart, ...cart }
    });
  }
}

module.exports = new CartController();
