const User = require("../../models/User");
const Order = require("../../models/Order");
const Address = require("../../models/Address");
const { parsePagination, formatPaginationMeta } = require("../../utils/pagination");
const { BadRequestError, NotFoundError } = require("../../utils/errors");

class CustomersService {
  async listCustomers(query) {
    const pageData = parsePagination(query, 100, 1000);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const filter = { role: { $ne: "admin" } };
    if (query.active !== undefined) {
      filter.active = query.active === "true";
    }
    if (query.search) {
      const search = String(query.search).trim();
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(pageData.skip)
        .limit(pageData.limit),
      User.countDocuments(filter)
    ]);

    const userIds = users.map(u => u._id);
    const [savedAddresses, recentOrders] = await Promise.all([
      Address.find({ user: { $in: userIds } }).sort({ isDefault: -1, createdAt: -1 }).lean(),
      Order.find({ user: { $in: userIds } }).sort({ createdAt: -1 }).select("user shippingAddress").lean()
    ]);

    const addressMap = new Map();
    for (const a of savedAddresses) {
      const uId = String(a.user);
      if (!addressMap.has(uId)) {
        addressMap.set(uId, `${a.address}, ${a.city}, ${a.state} - ${a.postalCode}, ${a.country || "India"}`);
      }
    }
    for (const o of recentOrders) {
      const uId = String(o.user);
      if (!addressMap.has(uId) && o.shippingAddress) {
        const sa = o.shippingAddress;
        addressMap.set(uId, `${sa.address}, ${sa.city}, ${sa.state} - ${sa.postalCode || sa.pin}, ${sa.country || "India"}`);
      }
    }

    const customers = users.map(u => {
      const uObj = u.toObject ? u.toObject() : u;
      uObj.address = addressMap.get(String(u._id)) || "Address not provided";
      return uObj;
    });

    return {
      customers,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async getCustomerById(id, query = {}) {
    const pageData = parsePagination(query, 100, 1000);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const customerDoc = await User.findOne({ _id: id, role: { $ne: "admin" } }).select("-password");
    if (!customerDoc) {
      throw new NotFoundError("Customer not found");
    }

    const customer = customerDoc.toObject ? customerDoc.toObject() : customerDoc;

    const [savedAddr, recentOrder] = await Promise.all([
      Address.findOne({ user: customerDoc._id }).sort({ isDefault: -1, createdAt: -1 }).lean(),
      Order.findOne({ user: customerDoc._id }).sort({ createdAt: -1 }).select("shippingAddress").lean()
    ]);

    if (savedAddr) {
      customer.address = `${savedAddr.address}, ${savedAddr.city}, ${savedAddr.state} - ${savedAddr.postalCode}, ${savedAddr.country || "India"}`;
      customer.rawAddress = savedAddr;
    } else if (recentOrder?.shippingAddress) {
      const sa = recentOrder.shippingAddress;
      customer.address = `${sa.address}, ${sa.city}, ${sa.state} - ${sa.postalCode || sa.pin}, ${sa.country || "India"}`;
      customer.rawAddress = sa;
    } else {
      customer.address = "Address not provided";
    }

    const escapedEmail = customer.email ? customer.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
    const orderFilter = escapedEmail
      ? {
          $or: [
            { user: customer._id },
            { "shippingAddress.email": { $regex: new RegExp(`^${escapedEmail}$`, "i") } }
          ]
        }
      : { user: customer._id };

    const [orders, total] = await Promise.all([
      Order.find(orderFilter)
        .populate("items.product", "name imageUrl images price")
        .sort({ createdAt: -1 })
        .skip(pageData.skip)
        .limit(pageData.limit),
      Order.countDocuments(orderFilter)
    ]);

    return {
      customer,
      orders,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async updateCustomerStatus(id, active) {
    if (typeof active !== "boolean") {
      throw new BadRequestError("active must be a boolean");
    }

    const customer = await User.findOneAndUpdate(
      { _id: id, role: { $ne: "admin" } },
      { active },
      { new: true }
    ).select("-password");

    if (!customer) {
      throw new NotFoundError("Customer not found");
    }

    return customer;
  }
}

module.exports = new CustomersService();
