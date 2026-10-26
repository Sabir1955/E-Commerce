const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const { BadRequestError, NotFoundError } = require("../../utils/errors");

class CartService {
  async getCart(userId) {
    let cart = await Cart.findOne({ user: userId }).populate("items.product");
    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
    }

    let subtotal = 0;
    let totalQuantity = 0;
    const enrichedItems = [];

    for (const item of cart.items) {
      if (!item.product) continue;
      const price = Number(item.product.price) || 0;
      const qty = Number(item.quantity) || 0;
      const itemSubtotal = price * qty;
      subtotal += itemSubtotal;
      totalQuantity += qty;

      const isItemAvailable = item.product.is_available !== false && item.product.isAvailable !== false && item.product.available !== false;
      enrichedItems.push({
        _id: item._id,
        product: item.product,
        quantity: qty,
        itemSubtotal: Math.round(itemSubtotal * 100) / 100,
        inStock: item.product.stock >= qty && isItemAvailable,
        availableStock: isItemAvailable ? item.product.stock : 0
      });
    }

    return {
      _id: cart._id,
      user: cart.user,
      items: enrichedItems,
      itemCount: enrichedItems.length,
      totalQuantity,
      subtotal: Math.round(subtotal * 100) / 100,
      updatedAt: cart.updatedAt
    };
  }

  async addItem(userId, body = {}) {
    const productId = body.productId || body.product || body.id;
    if (!productId) {
      throw new BadRequestError("productId is required");
    }

    const isObjectId = /^[a-f\d]{24}$/i.test(String(productId));
    const product = await Product.findOne(
      isObjectId ? { _id: productId, active: true } : { $or: [{ sku: productId }, { slug: productId }], active: true }
    );
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    if (product.is_available === false || product.isAvailable === false || product.available === false) {
      throw new BadRequestError(`${product.name} is currently unavailable`);
    }

    const numQuantity = Number(body.quantity !== undefined ? body.quantity : 1);
    if (!Number.isInteger(numQuantity) || numQuantity < 1) {
      throw new BadRequestError("Quantity must be a positive integer");
    }

    const cart = await Cart.findOneAndUpdate(
      { user: userId },
      { $setOnInsert: { user: userId } },
      { new: true, upsert: true }
    );

    const existingItem = cart.items.find((entry) => String(entry.product) === String(product._id));
    const targetQty = existingItem ? existingItem.quantity + numQuantity : numQuantity;

    if (targetQty > product.stock) {
      throw new BadRequestError(`Requested quantity exceeds available stock (${product.stock} available)`);
    }

    if (existingItem) {
      existingItem.quantity = targetQty;
    } else {
      cart.items.push({ product: product._id, quantity: numQuantity });
    }

    await cart.save();
    return this.getCart(userId);
  }

  async updateItemQuantity(userId, productId, quantity) {
    const numQuantity = Number(quantity);
    if (!Number.isInteger(numQuantity)) {
      throw new BadRequestError("Quantity must be an integer");
    }

    if (numQuantity <= 0) {
      return this.removeItem(userId, productId);
    }

    const isObjectId = /^[a-f\d]{24}$/i.test(String(productId));
    const product = await Product.findOne(
      isObjectId ? { _id: productId, active: true } : { $or: [{ sku: productId }, { slug: productId }], active: true }
    );
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    if (product.is_available === false || product.isAvailable === false || product.available === false) {
      throw new BadRequestError(`${product.name} is currently unavailable`);
    }

    if (numQuantity > product.stock) {
      throw new BadRequestError(`Requested quantity exceeds available stock (${product.stock} available)`);
    }

    const targetId = String(product._id);
    const cart = await Cart.findOne({ user: userId });
    const item = cart && cart.items.find((entry) => String(entry.product) === targetId || String(entry.product) === String(productId));
    if (!item) {
      throw new NotFoundError("Cart item not found");
    }

    item.quantity = numQuantity;
    await cart.save();
    return this.getCart(userId);
  }

  async removeItem(userId, productId) {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      throw new NotFoundError("Cart not found");
    }

    const isObjectId = /^[a-f\d]{24}$/i.test(String(productId));
    let targetId = String(productId);
    if (!isObjectId) {
      const p = await Product.findOne({ $or: [{ sku: productId }, { slug: productId }] });
      if (p) targetId = String(p._id);
    }

    cart.items = cart.items.filter((item) => String(item.product) !== targetId && String(item.product) !== String(productId));
    await cart.save();
    return this.getCart(userId);
  }

  async clearCart(userId) {
    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [] } },
      { new: true, upsert: true }
    );
    return this.getCart(userId);
  }
}

module.exports = new CartService();
