/**
 * Security Input Sanitization Middleware
 * Protects against NoSQL Operator Injection, Cross-Site Scripting (XSS),
 * and HTTP Parameter Pollution (HPP).
 */

const DANGEROUS_XSS_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|on[a-zA-Z]+\s*=\s*|<iframe\b|<embed\b|<object\b|<base\b|<link\b/gi;

/**
 * Recursively strip MongoDB query operators ($gt, $ne, $where, etc.) and dot notation
 */
function sanitizeNoSQL(target) {
  if (!target || typeof target !== "object") {
    return target;
  }

  if (Array.isArray(target)) {
    return target.map((item) => sanitizeNoSQL(item));
  }

  const clean = {};
  for (const [key, value] of Object.entries(target)) {
    // Strip keys starting with '$' or containing '.'
    if (key.startsWith("$") || key.includes(".")) {
      continue;
    }

    if (typeof value === "object" && value !== null) {
      clean[key] = sanitizeNoSQL(value);
    } else {
      clean[key] = value;
    }
  }

  return clean;
}

/**
 * Strip malicious script tags and inline handlers from strings
 */
function sanitizeXSS(target) {
  if (typeof target === "string") {
    return target.replace(DANGEROUS_XSS_PATTERN, "");
  }

  if (!target || typeof target !== "object") {
    return target;
  }

  if (Array.isArray(target)) {
    return target.map((item) => sanitizeXSS(item));
  }

  const clean = {};
  for (const [key, value] of Object.entries(target)) {
    clean[key] = sanitizeXSS(value);
  }
  return clean;
}

/**
 * Prevent HTTP Parameter Pollution on standard scalar query parameters
 */
function preventHPP(whitelistArrayParams = ["category", "tags", "images"]) {
  return function preventHPPMiddleware(req, res, next) {
    if (req.query && typeof req.query === "object") {
      for (const [key, value] of Object.entries(req.query)) {
        if (Array.isArray(value) && !whitelistArrayParams.includes(key)) {
          // Take the last parameter value if duplicated unexpectedly
          req.query[key] = value[value.length - 1];
        }
      }
    }
    next();
  };
}

/**
 * Unified Sanitization Middleware
 */
function securitySanitizationMiddleware(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeXSS(sanitizeNoSQL(req.body));
  }

  if (req.query && typeof req.query === "object") {
    req.query = sanitizeXSS(sanitizeNoSQL(req.query));
  }

  if (req.params && typeof req.params === "object") {
    req.params = sanitizeXSS(sanitizeNoSQL(req.params));
  }

  next();
}

module.exports = {
  sanitizeNoSQL,
  sanitizeXSS,
  preventHPP,
  securitySanitizationMiddleware
};
