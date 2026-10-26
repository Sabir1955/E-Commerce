const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../../models/User");
const Referral = require("../../models/Referral");
const OtpCode = require("../../models/OtpCode");
const notifications = require("../../services/notifications");
const { env } = require("../../config/env");
const { isValidEmail, isValidIndianMobile } = require("../../utils/request");
const { BadRequestError, UnauthorizedError, ConflictError, NotFoundError } = require("../../utils/errors");

const BCRYPT_ROUNDS = 10;
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

function createToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

function findUserByIdentifier(identifier) {
  const cleanId = String(identifier || "").trim();
  if (!cleanId) return null;
  if (cleanId.includes("@")) {
    return User.findOne({ email: cleanId.toLowerCase() });
  }
  const rawDigits = cleanId.replace(/[\s\-()]/g, "");
  const bare10 = rawDigits.replace(/^(\+91|91|0)/, "");
  return User.findOne({
    $or: [
      { mobile: cleanId },
      { mobile: rawDigits },
      { mobile: `+91${bare10}` },
      { mobile: bare10 }
    ]
  });
}

function maskContact(contact) {
  if (!contact) return "";
  if (contact.includes("@")) {
    const [local, domain] = contact.split("@");
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }
  const clean = contact.trim();
  if (clean.length <= 4) return clean;
  return `******${clean.slice(-3)}`;
}

class AuthService {
  async register({ name, email, mobile, password, confirmPassword, referralCode }) {
    if (typeof name !== "string" || !name.trim() || !email || !mobile || typeof password !== "string" || typeof confirmPassword !== "string") {
      throw new BadRequestError("name, mobile, email, password, and confirmPassword are required");
    }
    if (password !== confirmPassword) {
      throw new BadRequestError("Password and confirmPassword must match");
    }
    if (!isValidEmail(email)) {
      throw new BadRequestError("Enter a valid email address");
    }
    if (!isValidIndianMobile(mobile)) {
      throw new BadRequestError("Enter a valid Indian mobile number");
    }
    if (password.length < 8 || password.length > 128) {
      throw new BadRequestError("Password must be between 8 and 128 characters");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail);
    if (!isGmail) {
      throw new BadRequestError("Only Gmail addresses ending with @gmail.com are accepted");
    }
    const normalizedMobile = mobile.trim();
    const code = referralCode ? String(referralCode).trim().toUpperCase() : undefined;
    const referrer = code ? await User.findOne({ referralCode: code, role: "customer" }) : null;
    if (code && !referrer) {
      throw new BadRequestError("Invalid referral code");
    }

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { mobile: normalizedMobile }]
    });
    if (existingUser) {
      throw new ConflictError(
        existingUser.email === normalizedEmail
          ? "Email is already registered"
          : "Mobile number is already registered"
      );
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      mobile: normalizedMobile,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: "customer", // Normal registration MUST NEVER create an admin
      referralCode: crypto.randomBytes(5).toString("hex").toUpperCase()
    });

    if (referrer) {
      await Referral.create({
        referrer: referrer._id,
        referredUser: user._id,
        referralCode: code
      }).catch(() => {});
    }

    const token = createToken(user);
    return {
      token,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        referralCode: user.referralCode
      }
    };
  }

  async login({ identifier, email, mobile, password }) {
    if (typeof password !== "string" || !(typeof identifier === "string" || typeof email === "string" || typeof mobile === "string")) {
      throw new BadRequestError("identifier and password are required");
    }

    const loginIdentifier = (identifier || email || mobile || "").trim();
    if (!loginIdentifier) {
      throw new BadRequestError("Please enter your Gmail address or mobile number");
    }

    const isEmail = loginIdentifier.includes("@");
    if (isEmail) {
      const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(loginIdentifier);
      const isAdminEmail = Boolean(env.ADMIN_EMAIL && loginIdentifier.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
      if (!isGmail && !isAdminEmail) {
        throw new BadRequestError("Only Gmail addresses ending with @gmail.com are accepted");
      }
    } else {
      const cleanMobile = loginIdentifier.replace(/[\s\-()]/g, "");
      const isMobile = /^(?:\+91|91|0)?[6-9]\d{9}$/.test(cleanMobile);
      if (!isMobile) {
        throw new BadRequestError("Please enter a valid Gmail address (@gmail.com) or a valid 10-digit mobile number");
      }
    }

    if (password.length < 8 || password.length > 64) {
      throw new BadRequestError("Password must be between 8 and 64 characters");
    }

    const userQuery = findUserByIdentifier(loginIdentifier);
    if (!userQuery) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const user = await userQuery.select("+password");

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.active === false) {
      throw new UnauthorizedError("Your account has been deactivated. Please contact support.");
    }

    const matches = user.password ? await bcrypt.compare(password || "", user.password) : false;
    if (!matches) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = createToken(user);
    return {
      token,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        referralCode: user.referralCode
      }
    };
  }

  async requestForgotPasswordOtp(identifier) {
    if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
      throw new BadRequestError("Email or mobile number is required");
    }

    const cleanIdentifier = identifier.trim();
    const isEmail = cleanIdentifier.includes("@");

    if (isEmail && !isValidEmail(cleanIdentifier)) {
      throw new BadRequestError("Please provide a valid email address");
    }

    const user = await findUserByIdentifier(cleanIdentifier);
    if (!user || user.active === false) {
      return {
        message: `If an active account exists with this ${isEmail ? "email" : "mobile number"}, a verification code has been dispatched.`,
        channel: isEmail ? "email" : "mobile",
        destination: maskContact(cleanIdentifier)
      };
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const codeHash = crypto.createHash("sha256").update(otp).digest("hex");
    const destination = isEmail ? user.email : user.mobile;
    const message = `Your password reset OTP is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`;

    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #691724; margin-top: 0;">Password Reset Request</h2>
        <p style="color: #555; font-size: 15px;">You requested to reset your password. Use the verification OTP below to proceed:</p>
        <div style="background: #fbf8f2; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0; border: 1px solid #c9a84c;">
          <span style="font-size: 30px; font-weight: bold; letter-spacing: 6px; color: #691724;">${otp}</span>
        </div>
        <p style="color: #777; font-size: 13px;">This OTP is valid for <strong>${OTP_TTL_MINUTES} minutes</strong>. If you did not request this, please ignore this email.</p>
      </div>
    `;

    const result = isEmail
      ? await notifications.email(user.email, "Your Password Reset OTP", message, htmlMessage)
      : await notifications.sms(user.mobile, message);

    console.log(`\n==========================================`);
    console.log(`[FORGOT PASSWORD OTP]`);
    console.log(`Target:      ${destination} (${isEmail ? "Email" : "SMS"})`);
    console.log(`Delivery:    ${result.sent ? "Sent successfully" : `Skipped (${result.reason})`}`);
    console.log(`==========================================\n`);

    // Remove any previous active OTPs
    await OtpCode.deleteMany({
      $or: [{ identifier: user.email }, { identifier: user.mobile }],
      purpose: "forgot_password"
    });

    await OtpCode.create({
      identifier: destination,
      purpose: "forgot_password",
      codeHash,
      payload: { userId: user._id },
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
    });

    const responsePayload = {
      message: `OTP sent to your registered ${isEmail ? "email" : "mobile number"}`,
      channel: isEmail ? "email" : "mobile",
      destination: maskContact(destination)
    };

    return responsePayload;
  }

  async verifyForgotPasswordOtpOnly({ identifier, otp }) {
    if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
      throw new BadRequestError("Email or mobile number is required");
    }
    if (!otp || typeof otp !== "string" || !otp.trim()) {
      throw new BadRequestError("Verification OTP is required");
    }

    const cleanIdentifier = identifier.trim();
    const user = await findUserByIdentifier(cleanIdentifier);
    if (!user || user.active === false) {
      throw new BadRequestError("Invalid verification request or OTP has expired.");
    }

    const record = await OtpCode.findOne({
      $or: [{ identifier: user.email }, { identifier: user.mobile }],
      purpose: "forgot_password"
    });

    if (!record) {
      throw new BadRequestError("Invalid or expired OTP. Please request a new OTP.");
    }

    if (record.expiresAt <= new Date() || record.attempts >= MAX_OTP_ATTEMPTS) {
      await record.deleteOne();
      throw new BadRequestError("OTP has expired. Please request a new OTP.");
    }

    record.attempts += 1;
    await record.save();

    const providedHash = crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
    if (record.codeHash !== providedHash) {
      throw new BadRequestError("Invalid verification OTP. Please check the code and try again.");
    }

    // Immediately remove/invalidate OTP from MongoDB once verified so it cannot be reused
    await record.deleteOne();

    // Generate short-lived signed password reset token (15 mins)
    const resetToken = jwt.sign(
      {
        userId: user._id || user.id,
        email: user.email,
        purpose: "forgot_password_reset"
      },
      env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    // Store reset token hash in database to enforce single-use
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.passwordResetToken = resetTokenHash;
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    return {
      verified: true,
      resetToken,
      email: user.email,
      message: "OTP verified successfully. You can now set your new password."
    };
  }

  async resetPassword({ resetToken, identifier, otp, password, confirmPassword }) {
    if (!password || typeof password !== "string") {
      throw new BadRequestError("New password is required");
    }
    if (password.length < 8 || password.length > 128) {
      throw new BadRequestError("Password must be between 8 and 128 characters");
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      throw new BadRequestError("Passwords do not match");
    }

    let user;

    if (resetToken && typeof resetToken === "string") {
      try {
        const payload = jwt.verify(resetToken, env.JWT_SECRET);
        if (payload.purpose !== "forgot_password_reset" || !payload.userId) {
          throw new UnauthorizedError("Invalid or expired password reset token");
        }
        user = await User.findById(payload.userId);
        if (!user || user.active === false) {
          throw new NotFoundError("User not found or account is deactivated");
        }

        const expectedHash = crypto.createHash("sha256").update(resetToken).digest("hex");
        if (
          !user.passwordResetToken ||
          user.passwordResetToken !== expectedHash ||
          !user.passwordResetExpires ||
          new Date(user.passwordResetExpires) < new Date()
        ) {
          throw new UnauthorizedError("Password reset token has already been used or expired. Please request a new OTP.");
        }
      } catch (err) {
        if (err instanceof UnauthorizedError || err instanceof NotFoundError) throw err;
        throw new UnauthorizedError("Password reset session expired. Please verify your OTP again.");
      }
    } else if (identifier && otp) {
      // Direct reset via OTP & identifier (backward compatibility)
      const cleanIdentifier = String(identifier).trim();
      user = await findUserByIdentifier(cleanIdentifier);
      if (!user || user.active === false) {
        throw new NotFoundError("User not found");
      }

      const record = await OtpCode.findOne({
        $or: [{ identifier: user.email }, { identifier: user.mobile }],
        purpose: "forgot_password"
      });

      if (!record) {
        throw new BadRequestError("Invalid or expired OTP. Please request a new OTP.");
      }

      if (record.expiresAt <= new Date() || record.attempts >= MAX_OTP_ATTEMPTS) {
        await record.deleteOne();
        throw new BadRequestError("OTP has expired. Please request a new OTP.");
      }

      const providedHash = crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
      if (record.codeHash !== providedHash) {
        record.attempts += 1;
        await record.save();
        throw new BadRequestError("Invalid OTP");
      }

      await record.deleteOne();
    } else {
      throw new BadRequestError("Reset token or verified OTP is required to reset password");
    }

    user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    return {
      message: "Password updated successfully. You can now login with your new password."
    };
  }

  async verifyForgotPasswordOtp(params) {
    if (params.password) {
      return this.resetPassword(params);
    }
    return this.verifyForgotPasswordOtpOnly(params);
  }

  async changePassword({ userId, currentPassword, newPassword, confirmPassword }) {
    if (!currentPassword || !newPassword) {
      throw new BadRequestError("Current password and new password are required");
    }
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      throw new BadRequestError("New password and confirmPassword do not match");
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      throw new BadRequestError("New password must be between 8 and 128 characters");
    }
    if (currentPassword === newPassword) {
      throw new BadRequestError("New password must be different from current password");
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw new BadRequestError("Current password is incorrect");
    }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();

    return {
      message: "Password changed successfully"
    };
  }

  async refreshToken(user) {
    if (!user || user.active === false) {
      throw new UnauthorizedError("Account is inactive or not found");
    }
    const token = createToken(user);
    return {
      token,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        referralCode: user.referralCode
      }
    };
  }
}

module.exports = new AuthService();
