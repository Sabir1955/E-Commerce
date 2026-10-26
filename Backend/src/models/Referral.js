const { BaseModel } = require("../database/BaseModel");

class Referral extends BaseModel {
  static get tableName() {
    return "referrals";
  }

  static get columnMap() {
    return {
      referrerId: "referrer_id",
      referrer: "referrer_id",
      referredUserId: "referred_user_id",
      referredUser: "referred_user_id",
      referralCode: "referral_code"
    };
  }

  async save() {
    if (this.referrer && typeof this.referrer === "object") {
      this.referrerId = this.referrer._id || this.referrer.id;
    } else if (this.referrer && !this.referrerId) {
      this.referrerId = this.referrer;
    }
    if (this.referredUser && typeof this.referredUser === "object") {
      this.referredUserId = this.referredUser._id || this.referredUser.id;
    } else if (this.referredUser && !this.referredUserId) {
      this.referredUserId = this.referredUser;
    }
    return super.save();
  }
}

module.exports = Referral;
