const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { env } = require("../config/env");
const { UnauthorizedError } = require("../utils/errors");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      error: { code: "UNAUTHORIZED" }
    });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(payload.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
        error: { code: "UNAUTHORIZED" }
      });
    }

    if (user.active === false) {
      return res.status(401).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
        error: { code: "ACCOUNT_DEACTIVATED" }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: { code: "INVALID_TOKEN" }
    });
  }
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(payload.userId);
    req.user = user && user.active !== false ? user : null;
  } catch {
    req.user = null;
  }
  next();
}

module.exports = {
  requireAuth,
  optionalAuth
};
