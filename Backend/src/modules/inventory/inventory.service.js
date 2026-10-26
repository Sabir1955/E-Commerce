const Product = require("../../models/Product");
const { parsePagination, formatPaginationMeta } = require("../../utils/pagination");
const { BadRequestError, NotFoundError } = require("../../utils/errors");
const { isNonNegativeInteger } = require("../../utils/request");

class InventoryService {
  async getInventory(query) {
    const pageData = parsePagination(query);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const filter = { active: true };
    if (query.category) filter.category = query.category;
    if (query.outOfStock === "true") filter.stock = 0;
    if (query.lowStock === "true") filter.stock = { $gt: 0, $lte: 5 };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select("name slug brand sku category stock price weight dimensions material")
        .sort({ stock: 1 })
        .skip(pageData.skip)
        .limit(pageData.limit),
      Product.countDocuments(filter)
    ]);

    return {
      products,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async updateStock(id, quantity, availability) {
    const update = {};
    if (quantity !== undefined) {
      if (!isNonNegativeInteger(quantity)) {
        throw new BadRequestError("quantity must be a non-negative integer");
      }
      update.stock = Number(quantity);
    }
    if (availability !== undefined) {
      update.isAvailable = Boolean(availability);
      update.available = Boolean(availability);
    }
    if (Object.keys(update).length === 0) {
      throw new BadRequestError("quantity or available must be provided");
    }

    const product = await Product.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true }
    );
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }

  async adjustStock(id, amount) {
    const intAmount = Number(amount);
    if (!Number.isInteger(intAmount) || intAmount === 0) {
      throw new BadRequestError("amount must be a non-zero integer");
    }

    const product = await Product.findOneAndUpdate(
      { _id: id, $expr: { $gte: [{ $add: ["$stock", intAmount] }, 0] } },
      { $inc: { stock: intAmount } },
      { new: true }
    );
    if (!product) {
      throw new BadRequestError("Product not found or stock cannot become negative");
    }
    return product;
  }
}

module.exports = new InventoryService();
