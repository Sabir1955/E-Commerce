const bcrypt = require("bcryptjs");
const { BaseModel } = require("../database/BaseModel");

class User extends BaseModel {
  static get tableName() {
    return "users";
  }

  static get columnMap() {
    return {
      notificationPreferences: "notification_preferences",
      referralCode: "referral_code",
      passwordResetToken: "password_reset_token",
      passwordResetExpires: "password_reset_expires"
    };
  }

  static get jsonColumns() {
    return new Set(["notification_preferences"]);
  }

  static get booleanColumns() {
    return new Set(["active"]);
  }

  async comparePassword(candidatePassword) {
    if (!this.password || !candidatePassword) return false;
    return bcrypt.compare(candidatePassword, this.password);
  }

  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  constructor(data = {}) {
    super(data);
    if (this.role === undefined) this.role = "customer";
    if (this.active === undefined) this.active = true;
  }

  // Pre-save password hashing if new or modified
  async save() {
    if (this.password && !this.password.startsWith("$2a$") && !this.password.startsWith("$2b$")) {
      this.password = await User.hashPassword(this.password);
    }
    return super.save();
  }
}

User.schema = {
  indexes: () => [
    [{ role: 1, active: 1 }]
  ]
};

module.exports = User;
