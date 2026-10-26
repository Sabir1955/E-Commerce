const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const Referral = require("../models/Referral");
const OtpCode = require("../models/OtpCode");
const notifications = require("../services/notifications");
const { isValidEmail, isValidIndianMobile } = require("../utils/request");

const BCRYPT_ROUNDS = 10;
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

function createToken(user) {
  return jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
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

router.post("/register", async (req, res) => {
  const { name, email, mobile, password, confirmPassword } = req.body;
  if (typeof name !== "string" || !name.trim() || !email || !mobile || typeof password !== "string" || typeof confirmPassword !== "string") {
    return res.status(400).json({
      message: "name, mobile, email, password, and confirmPassword are required"
    });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Password and confirmPassword must match" });
  }
  if (!isValidEmail(email)) return res.status(400).json({ message: "Enter a valid email address" });
  if (!isValidIndianMobile(mobile)) return res.status(400).json({ message: "Enter a valid Indian mobile number" });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ message: "Password must be between 8 and 128 characters" });

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedMobile = mobile.trim();
  const referralCode = req.body.referralCode ? String(req.body.referralCode).trim().toUpperCase() : undefined;
  const referrer = referralCode ? await User.findOne({ referralCode, role: "customer" }) : null;
  if (referralCode && !referrer) return res.status(400).json({ message: "Invalid referral code" });
  const existingUser = await User.findOne({
    $or: [{ email: normalizedEmail }, { mobile: normalizedMobile }]
  });
  if (existingUser) {
    return res.status(409).json({
      message: existingUser.email === normalizedEmail
        ? "Email is already registered"
        : "Mobile number is already registered"
    });
  }

  const user = await User.create({
    name,
    email: normalizedEmail,
    mobile: normalizedMobile,
    password: await bcrypt.hash(password, BCRYPT_ROUNDS),
    referralCode: crypto.randomBytes(5).toString("hex").toUpperCase()
  });
  if (referrer) await Referral.create({ referrer: referrer._id, referredUser: user._id, referralCode });

  res.status(201).json({
    token: createToken(user),
    user: { id: user._id, name: user.name, email: user.email, mobile: user.mobile, role: user.role, referralCode: user.referralCode }
  });
});

router.post("/login", async (req, res) => {
  const { identifier, email, mobile, password } = req.body;
  if (typeof password !== "string" || !(typeof identifier === "string" || typeof email === "string" || typeof mobile === "string")) {
    return res.status(400).json({ message: "identifier and password are required" });
  }
  const loginIdentifier = (identifier || email || mobile || "").trim();
  if (!loginIdentifier) {
    return res.status(400).json({ message: "Please enter your Gmail address or mobile number" });
  }

  const isEmail = loginIdentifier.includes("@");
  if (isEmail) {
    const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(loginIdentifier);
    if (!isGmail) {
      return res.status(400).json({ message: "Only Gmail addresses ending with @gmail.com are accepted" });
    }
  } else {
    const cleanMobile = loginIdentifier.replace(/[\s\-()]/g, "");
    const isMobile = /^(?:\+91|91|0)?[6-9]\d{9}$/.test(cleanMobile);
    if (!isMobile) {
      return res.status(400).json({ message: "Please enter a valid Gmail address (@gmail.com) or a valid 10-digit mobile number" });
    }
  }

  if (password.length < 8 || password.length > 64) {
    return res.status(400).json({ message: "Password must be between 8 and 64 characters" });
  }

  let query;
  if (isEmail) {
    query = { email: loginIdentifier.toLowerCase() };
  } else {
    const rawDigits = loginIdentifier.replace(/[\s\-()]/g, "");
    const bare10 = rawDigits.replace(/^(\+91|91|0)/, "");
    query = {
      $or: [
        { mobile: loginIdentifier },
        { mobile: rawDigits },
        { mobile: `+91${bare10}` },
        { mobile: bare10 }
      ]
    };
  }
  const user = await User.findOne(query).select("+password");
  if (!user || !user.active || !(await bcrypt.compare(password || "", user.password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  res.json({
    token: createToken(user),
    user: { id: user._id, name: user.name, email: user.email, mobile: user.mobile, role: user.role, referralCode: user.referralCode }
  });
});

/* =========================================================
   FORGOT PASSWORD FLOW
========================================================= */

/**
 * 1. Request OTP for Forgot Password
 * POST /api/auth/forgot-password/request-otp
 * Body: { identifier: "email@example.com" or "9876543210" }
 */
router.post("/forgot-password/request-otp", async (req, res) => {
  const identifier = req.body.identifier || req.body.email || req.body.mobile;
  if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
    return res.status(400).json({ message: "Email or mobile number is required" });
  }

  const cleanIdentifier = identifier.trim();
  const isEmail = cleanIdentifier.includes("@");

  if (isEmail && !isValidEmail(cleanIdentifier)) {
    return res.status(400).json({ message: "Please provide a valid email address" });
  }

  const user = await findUserByIdentifier(cleanIdentifier);
  if (!user || !user.active) {
    return res.status(404).json({ message: "No active account found with this email or mobile number" });
  }

  // Generate 6-digit OTP
  const otp = String(crypto.randomInt(100000, 1000000));
  const codeHash = crypto.createHash("sha256").update(otp).digest("hex");

  // Destination contact
  const destination = isEmail ? user.email : user.mobile;
  const message = `Your password reset OTP is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`;
  const htmlMessage = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
      <p style="color: #555; font-size: 15px;">You requested to reset your password. Use the verification OTP below to proceed:</p>
      <div style="background: #f4f6f8; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
        <span style="font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #1a73e8;">${otp}</span>
      </div>
      <p style="color: #777; font-size: 13px;">This OTP is valid for <strong>${OTP_TTL_MINUTES} minutes</strong>. If you did not request this, please ignore this email.</p>
    </div>
  `;

  // Deliver via Email or SMS
  const result = isEmail
    ? await notifications.email(user.email, "Your Password Reset OTP", message, htmlMessage)
    : await notifications.sms(user.mobile, message);

  // Log delivery status in backend console
  console.log(`\n==========================================`);
  console.log(`[FORGOT PASSWORD OTP]`);
  console.log(`Target:      ${destination} (${isEmail ? "Email" : "SMS"})`);
  console.log(`Delivery:    ${result.sent ? "Sent successfully" : `Skipped (${result.reason})`}`);
  console.log(`==========================================\n`);

  if (!result.sent && process.env.NODE_ENV === "production") {
    return res.status(503).json({ message: `Failed to deliver OTP: ${result.reason}` });
  }

  // Remove any previous active OTPs for this user's email/mobile
  await OtpCode.deleteMany({
    $or: [{ identifier: user.email }, { identifier: user.mobile }],
    purpose: "forgot_password"
  });

  // Store new OTP record with expiration
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

  res.json(responsePayload);
});

/**
 * 2. Verify OTP & Set New Password
 * POST /api/auth/forgot-password/verify-otp
 * Body: { identifier, otp, password, confirmPassword }
 */
router.post("/forgot-password/verify-otp", async (req, res) => {
  const { otp, password, confirmPassword } = req.body;
  const identifier = req.body.identifier || req.body.email || req.body.mobile;

  if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
    return res.status(400).json({ message: "Email or mobile number is required" });
  }

  if (!otp || typeof otp !== "string" || !otp.trim()) {
    return res.status(400).json({ message: "OTP is required" });
  }

  if (!password || typeof password !== "string") {
    return res.status(400).json({ message: "New password is required" });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: "Password must be between 8 and 128 characters" });
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  const cleanIdentifier = identifier.trim();
  const user = await findUserByIdentifier(cleanIdentifier);
  if (!user || !user.active) {
    return res.status(404).json({ message: "User not found" });
  }

  // Look up active OTP for this user
  const record = await OtpCode.findOne({
    $or: [{ identifier: user.email }, { identifier: user.mobile }],
    purpose: "forgot_password"
  });

  if (!record) {
    return res.status(400).json({ message: "Invalid or expired OTP. Please request a new OTP." });
  }

  if (record.expiresAt <= new Date() || record.attempts >= MAX_OTP_ATTEMPTS) {
    await record.deleteOne();
    return res.status(400).json({ message: "OTP has expired. Please request a new OTP." });
  }

  // Increment attempts counter
  record.attempts += 1;
  await record.save();

  // Validate OTP
  const providedHash = crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
  if (record.codeHash !== providedHash) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  // OTP is valid! Delete consumed OTP
  await record.deleteOne();

  // Update password in database
  user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({
    message: "Password updated successfully. You can now login with your new password."
  });
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: { id: req.user._id, name: req.user.name, email: req.user.email, mobile: req.user.mobile, role: req.user.role, referralCode: req.user.referralCode, notificationPreferences: req.user.notificationPreferences } });
});

router.patch("/me", requireAuth, async (req, res) => {
  const updates = {};
  if (req.body.name !== undefined) {
    if (typeof req.body.name !== "string" || !req.body.name.trim() || req.body.name.trim().length > 100) return res.status(400).json({ message: "name must be non-empty text of at most 100 characters" });
    updates.name = req.body.name.trim();
  }
  if (req.body.mobile !== undefined) updates.mobile = req.body.mobile;
  if (updates.mobile && !isValidIndianMobile(updates.mobile)) return res.status(400).json({ message: "Enter a valid Indian mobile number" });
  const user = await require("../models/User").findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true
  });
  res.json({
    user: { id: user._id, name: user.name, email: user.email, mobile: user.mobile, role: user.role, notificationPreferences: user.notificationPreferences }
  });
});

router.patch("/me/preferences", requireAuth, async (req, res) => {
  const allowed = ["orderEmail", "orderSms", "orderWhatsapp", "marketingEmail", "marketingSms", "marketingWhatsapp"];
  const preferences = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      if (typeof req.body[key] !== "boolean") return res.status(400).json({ message: `${key} must be a boolean` });
      preferences[`notificationPreferences.${key}`] = req.body[key];
    }
  }
  if (!Object.keys(preferences).length) return res.status(400).json({ message: "Provide at least one notification preference" });
  const user = await User.findByIdAndUpdate(req.user._id, { $set: preferences }, { new: true, runValidators: true });
  res.json({ notificationPreferences: user.notificationPreferences });
});

router.post("/logout", requireAuth, (req, res) => {
  res.json({ message: "Logged out successfully. Discard the JWT on the client." });
});

module.exports = router;
