const { BaseModel } = require("../database/BaseModel");

class OtpCode extends BaseModel {
  static get tableName() {
    return "otp_codes";
  }

  static get columnMap() {
    return {
      codeHash: "code_hash",
      expiresAt: "expires_at"
    };
  }

  static get jsonColumns() {
    return new Set(["payload"]);
  }

  static get numericColumns() {
    return new Set(["attempts"]);
  }
}

module.exports = OtpCode;
