const {
  isValidEmail: checkEmail,
  isValidIndianMobile: checkMobile,
  isNonNegativeNumber,
  isNonNegativeInteger
} = require("../utils/request");

function isValidIdentifier(id) {
  if (typeof id !== "string") return false;
  return /^[a-f\d]{24}$/i.test(id) || /^[a-f\d-]{36}$/i.test(id) || /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

/**
 * Validate identifier in req.params
 */
function validateObjectId(paramName = "id") {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !isValidIdentifier(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} identifier`,
        error: { code: "INVALID_IDENTIFIER" }
      });
    }
    next();
  };
}

/**
 * Validate required fields in req.body
 */
function validateRequiredFields(fields = []) {
  return (req, res, next) => {
    const missing = [];
    for (const field of fields) {
      if (
        req.body[field] === undefined ||
        req.body[field] === null ||
        (typeof req.body[field] === "string" && !req.body[field].trim())
      ) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${missing.join(", ")}`,
        error: { code: "VALIDATION_ERROR", details: missing }
      });
    }
    next();
  };
}

/**
 * Password strength policy:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special symbol
 */
function isStrongPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    return false;
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password);

  return hasUpper && hasLower && hasDigit && hasSpecial;
}

function validatePasswordStrength(field = "password") {
  return (req, res, next) => {
    const password = req.body && req.body[field];
    if (!password) {
      return res.status(400).json({
        success: false,
        message: `${field} is required`,
        error: { code: "MISSING_PASSWORD" }
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        error: { code: "WEAK_PASSWORD" }
      });
    }

    next();
  };
}

/**
 * Email validation middleware
 */
function validateEmail(field = "email") {
  return (req, res, next) => {
    const email = req.body && req.body[field];
    if (!email || !checkEmail(email)) {
      return res.status(400).json({
        success: false,
        message: `A valid ${field} address is required`,
        error: { code: "INVALID_EMAIL" }
      });
    }
    next();
  };
}

/**
 * Indian Mobile (10-digit starting with 6-9, optional +91) validation middleware
 */
function validateIndianMobile(field = "mobile") {
  return (req, res, next) => {
    const mobile = req.body && req.body[field];
    if (!mobile || !checkMobile(mobile)) {
      return res.status(400).json({
        success: false,
        message: `A valid 10-digit Indian ${field} number is required`,
        error: { code: "INVALID_MOBILE" }
      });
    }
    next();
  };
}

/**
 * Star Rating validation (1 to 5 integer or half-rating)
 */
function isValidRating(rating) {
  const num = Number(rating);
  return Number.isFinite(num) && num >= 1 && num <= 5;
}

function validateRating(field = "rating") {
  return (req, res, next) => {
    const rating = req.body && req.body[field];
    if (rating === undefined || !isValidRating(rating)) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a number between 1 and 5`,
        error: { code: "INVALID_RATING" }
      });
    }
    next();
  };
}

module.exports = {
  validateObjectId,
  validateRequiredFields,
  isStrongPassword,
  validatePasswordStrength,
  isValidEmail: checkEmail,
  validateEmail,
  isValidIndianMobile: checkMobile,
  validateIndianMobile,
  isValidRating,
  validateRating,
  isNonNegativeNumber,
  isNonNegativeInteger
};
