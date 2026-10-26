const User = require("../../models/User");
const { BadRequestError, NotFoundError, ConflictError } = require("../../utils/errors");
const { isValidIndianMobile, isValidEmail } = require("../../utils/request");

class UsersService {
  async getProfile(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      referralCode: user.referralCode,
      notificationPreferences: user.notificationPreferences
    };
  }

  async updateProfile(userId, { name, mobile, email }) {
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        throw new BadRequestError("name must be non-empty text of at most 100 characters");
      }
      updates.name = name.trim();
    }
    if (mobile !== undefined) {
      if (!isValidIndianMobile(mobile)) {
        throw new BadRequestError("Enter a valid Indian mobile number");
      }
      const normalizedMobile = mobile.trim();
      const existing = await User.findOne({ mobile: normalizedMobile, _id: { $ne: userId } });
      if (existing) {
        throw new ConflictError("Mobile number is already registered by another account");
      }
      updates.mobile = normalizedMobile;
    }
    if (email !== undefined) {
      if (!isValidEmail(email)) {
        throw new BadRequestError("Enter a valid email address");
      }
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } });
      if (existing) {
        throw new ConflictError("Email is already registered by another account");
      }
      updates.email = normalizedEmail;
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true
    });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    return {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      notificationPreferences: user.notificationPreferences
    };
  }

  async updatePreferences(userId, body) {
    const allowed = [
      "orderEmail",
      "orderSms",
      "orderWhatsapp",
      "marketingEmail",
      "marketingSms",
      "marketingWhatsapp"
    ];
    const preferences = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== "boolean") {
          throw new BadRequestError(`${key} must be a boolean`);
        }
        preferences[`notificationPreferences.${key}`] = body[key];
      }
    }

    if (Object.keys(preferences).length === 0) {
      throw new BadRequestError("Provide at least one notification preference");
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: preferences },
      { new: true, runValidators: true }
    );
    if (!user) {
      throw new NotFoundError("User not found");
    }

    return {
      notificationPreferences: user.notificationPreferences
    };
  }
}

module.exports = new UsersService();
