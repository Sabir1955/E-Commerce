const Address = require("../../models/Address");
const { parsePagination, formatPaginationMeta } = require("../../utils/pagination");
const { BadRequestError, NotFoundError } = require("../../utils/errors");
const { isValidIndianMobile } = require("../../utils/request");

class AddressesService {
  async listAddresses(userId, query) {
    const pageData = parsePagination(query);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const filter = { user: userId };
    const [addresses, total] = await Promise.all([
      Address.find(filter).sort({ isDefault: -1, createdAt: -1 }).skip(pageData.skip).limit(pageData.limit),
      Address.countDocuments(filter)
    ]);

    return {
      addresses,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async createAddress(user, body) {
    const required = ["fullName", "address", "city", "state", "postalCode", "country"];
    if (required.some((field) => !body[field])) {
      throw new BadRequestError("All delivery address fields except mobile are required");
    }

    const maxLengths = { fullName: 100, address: 500, city: 100, state: 100, postalCode: 12, country: 100 };
    for (const field of required) {
      if (typeof body[field] !== "string" || !body[field].trim() || body[field].trim().length > maxLengths[field]) {
        throw new BadRequestError(`Address field ${field} must be text and within its allowed length`);
      }
    }

    const useRegisteredMobile = body.useRegisteredMobile !== false;
    const mobile = useRegisteredMobile ? user.mobile : body.mobile;
    if (!mobile) {
      throw new BadRequestError("Provide a mobile number or ensure your profile has a registered mobile number");
    }
    if (!isValidIndianMobile(mobile)) {
      throw new BadRequestError("Enter a valid Indian mobile number");
    }

    const addressCount = await Address.countDocuments({ user: user._id });
    const isDefault = Boolean(body.isDefault) || addressCount === 0;
    if (isDefault) {
      await Address.updateMany({ user: user._id }, { isDefault: false });
    }

    return Address.create({
      fullName: body.fullName.trim(),
      mobile: mobile.trim(),
      useRegisteredMobile,
      address: body.address.trim(),
      city: body.city.trim(),
      state: body.state.trim(),
      postalCode: body.postalCode.trim(),
      country: body.country.trim(),
      isDefault,
      user: user._id
    });
  }

  async updateAddress(userId, userMobile, id, body) {
    const allowedFields = ["fullName", "address", "city", "state", "postalCode", "country"];
    const updates = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (body.useRegisteredMobile !== undefined) {
      if (typeof body.useRegisteredMobile !== "boolean") {
        throw new BadRequestError("useRegisteredMobile must be a boolean");
      }
      updates.useRegisteredMobile = body.useRegisteredMobile;
      updates.mobile = updates.useRegisteredMobile ? userMobile : body.mobile;
      if (!updates.mobile) {
        throw new BadRequestError("Provide a different mobile number when useRegisteredMobile is false");
      }
    } else if (body.mobile !== undefined) {
      updates.useRegisteredMobile = false;
      updates.mobile = body.mobile;
    }

    if (updates.mobile && !isValidIndianMobile(updates.mobile)) {
      throw new BadRequestError("Enter a valid Indian mobile number");
    }

    const maxLengths = { fullName: 100, address: 500, city: 100, state: 100, postalCode: 12, country: 100 };
    for (const [field, value] of Object.entries(updates)) {
      const max = maxLengths[field];
      if (max && (typeof value !== "string" || !value.trim() || value.trim().length > max)) {
        throw new BadRequestError(`${field} must be non-empty text of at most ${max} characters`);
      }
    }

    if (body.isDefault === true) {
      const exists = await Address.exists({ _id: id, user: userId });
      if (!exists) throw new NotFoundError("Address not found");
      await Address.updateMany({ user: userId }, { isDefault: false });
      updates.isDefault = true;
    }

    const address = await Address.findOneAndUpdate(
      { _id: id, user: userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!address) {
      throw new NotFoundError("Address not found");
    }
    return address;
  }

  async deleteAddress(userId, id) {
    const address = await Address.findOneAndDelete({ _id: id, user: userId });
    if (!address) {
      throw new NotFoundError("Address not found");
    }
    if (address.isDefault) {
      const nextDefault = await Address.findOne({ user: userId }).sort({ createdAt: -1 });
      if (nextDefault) {
        nextDefault.isDefault = true;
        await nextDefault.save();
      }
    }
    return address;
  }
}

module.exports = new AddressesService();
