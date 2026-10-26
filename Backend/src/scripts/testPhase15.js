/**
 * Phase 15 Verification Suite: Security Hardening, Rate Limiting, Audit & Validation
 * Covers: NoSQL Injection Stripping, XSS Sanitization, HPP Protection,
 * Sensitive Data Masking, Audit Logging, Rate Limiting (429 & Headers),
 * Password Strength, Mobile & Email Validation, Rating Validation,
 * Security Headers, and Route Pipeline Integration.
 */

const {
  sanitizeNoSQL,
  sanitizeXSS,
  preventHPP,
  securitySanitizationMiddleware
} = require("../middleware/sanitization.middleware");

const {
  AuditService,
  auditService,
  maskSensitiveData
} = require("../services/audit.service");

const {
  createRateLimiter,
  apiLimiter,
  authLimiter,
  paymentLimiter,
  otpLimiter
} = require("../middleware/rateLimit.middleware");

const {
  validateObjectId,
  validateRequiredFields,
  isStrongPassword,
  validatePasswordStrength,
  isValidEmail,
  validateEmail,
  isValidIndianMobile,
  validateIndianMobile,
  isValidRating,
  validateRating
} = require("../middleware/validation.middleware");

const app = require("../app");

function runTests() {
  console.log("======================================================");
  console.log("Running Phase 15 Security Hardening & Validation Tests");
  console.log("======================================================\n");

  let passed = 0;
  let failed = 0;

  // Test 1: NoSQL Operator Injection Stripping
  try {
    const maliciousPayload = {
      email: "user@vedicstore.com",
      password: { $gt: "" },
      filter: {
        $where: "this.role == 'admin'",
        category: "yantras",
        nested: {
          $ne: null,
          validKey: "sacred"
        }
      },
      "dotted.key": "exploit"
    };

    const sanitized = sanitizeNoSQL(maliciousPayload);

    if (sanitized.password && sanitized.password.$gt !== undefined) {
      throw new Error("$gt operator was not stripped from password");
    }
    if (sanitized.filter && sanitized.filter.$where !== undefined) {
      throw new Error("$where operator was not stripped from filter");
    }
    if (sanitized.filter && sanitized.filter.nested && sanitized.filter.nested.$ne !== undefined) {
      throw new Error("$ne operator was not stripped from nested filter");
    }
    if (sanitized["dotted.key"] !== undefined) {
      throw new Error("Dotted key was not stripped");
    }
    if (sanitized.email !== "user@vedicstore.com" || sanitized.filter.category !== "yantras") {
      throw new Error("Legitimate fields were corrupted during NoSQL sanitization");
    }

    console.log("  ✓ [PASS] 1. NoSQL operator injection stripping purges $, where, and dot notations");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 1. NoSQL operator injection stripping:", e.message);
    failed++;
  }

  // Test 2: XSS Dangerous Script & Handler Stripping
  try {
    const xssPayload = {
      title: "Navgraha Yantra <script>alert('pwned')</script>",
      description: "Blessed copper plate <img src='x' onerror='stealCookie()'>",
      link: "javascript:alert(1)",
      iframeExploit: "<iframe src='malicious.com'></iframe>safe-content"
    };

    const cleaned = sanitizeXSS(xssPayload);

    if (cleaned.title.includes("<script>")) {
      throw new Error("Script tag was not stripped from title");
    }
    if (cleaned.description.includes("onerror=")) {
      throw new Error("Inline event handler onerror was not stripped");
    }
    if (cleaned.link.includes("javascript:")) {
      throw new Error("javascript: pseudo-protocol was not stripped");
    }
    if (cleaned.iframeExploit.includes("<iframe")) {
      throw new Error("iframe tag was not stripped");
    }
    if (!cleaned.title.includes("Navgraha Yantra") || !cleaned.iframeExploit.includes("safe-content")) {
      throw new Error("Safe text content was accidentally removed");
    }

    console.log("  ✓ [PASS] 2. XSS sanitizer eliminates script tags, inline event handlers, and iframes");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 2. XSS sanitization:", e.message);
    failed++;
  }

  // Test 3: HTTP Parameter Pollution (HPP) Prevention
  try {
    const hppMiddleware = preventHPP(["category", "tags"]);

    const req = {
      query: {
        page: ["1", "2"], // polluted scalar query param
        sort: ["asc", "desc"], // polluted scalar query param
        category: ["yantras", "rudraksha"], // whitelisted array param
        keyword: "gemstone" // standard single param
      }
    };
    const res = {};
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    hppMiddleware(req, res, next);

    if (!nextCalled) {
      throw new Error("HPP middleware did not invoke next()");
    }
    if (Array.isArray(req.query.page) || req.query.page !== "2") {
      throw new Error(`Polluted 'page' parameter was not collapsed to last scalar value (got: ${req.query.page})`);
    }
    if (Array.isArray(req.query.sort) || req.query.sort !== "desc") {
      throw new Error(`Polluted 'sort' parameter was not collapsed to last scalar value (got: ${req.query.sort})`);
    }
    if (!Array.isArray(req.query.category) || req.query.category.length !== 2) {
      throw new Error("Whitelisted array parameter 'category' was inappropriately collapsed");
    }

    console.log("  ✓ [PASS] 3. HTTP Parameter Pollution (HPP) collapses polluted params while preserving whitelisted arrays");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 3. HPP prevention:", e.message);
    failed++;
  }

  // Test 4: Sensitive Data Masking in Audit Service
  try {
    const sensitiveInput = {
      userId: "usr-123",
      email: "devotee@temple.org",
      password: "SuperSecretPassword123!",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
      otp: "948271",
      authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      paymentDetails: {
        cardNumber: "4111111111111234",
        cvv: "892",
        razorpaySignature: "sec_sig_999988887777"
      },
      productName: "Siddha Parad Shivling"
    };

    const masked = maskSensitiveData(sensitiveInput);

    if (masked.password.includes("SuperSecretPassword123!")) {
      throw new Error("Password was not masked");
    }
    if (masked.otp.includes("948271")) {
      throw new Error("OTP was not masked");
    }
    if (masked.token.includes("payload.sig")) {
      throw new Error("JWT token was not masked");
    }
    if (!masked.authorization.startsWith("Bearer ") || masked.authorization.includes("payload.sig")) {
      throw new Error("Authorization header was not properly masked");
    }
    if (masked.paymentDetails.cvv !== "***MASKED***") {
      throw new Error("CVV was not masked");
    }
    if (masked.productName !== "Siddha Parad Shivling" || masked.email !== "devotee@temple.org") {
      throw new Error("Non-sensitive fields were erroneously altered");
    }

    console.log("  ✓ [PASS] 4. Sensitive data masking recursively sanitizes passwords, tokens, OTPs, and card credentials");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 4. Sensitive data masking:", e.message);
    failed++;
  }

  // Test 5: Security Audit Logging & Buffer Management
  try {
    const testAudit = new AuditService(5);

    testAudit.log("USER_LOGIN_SUCCESS", { userId: "u1", email: "user1@vedic.com" }, { ip: "192.168.1.10" });
    testAudit.log("PASSWORD_CHANGE_REQUEST", { userId: "u1", email: "user1@vedic.com" }, { password: "SecretPassword123!" });
    testAudit.log("ADMIN_ROLE_ELEVATION", { userId: "u2", email: "admin@vedic.com" }, { targetUser: "u3" });

    const recentAll = testAudit.getRecentLogs(10);
    if (recentAll.length !== 3) {
      throw new Error(`Expected 3 audit logs, got ${recentAll.length}`);
    }

    const filtered = testAudit.getRecentLogs(10, { email: "user1@vedic.com" });
    if (filtered.length !== 2) {
      throw new Error(`Expected 2 audit logs for user1, got ${filtered.length}`);
    }

    const passChangeEntry = filtered.find((e) => e.action === "PASSWORD_CHANGE_REQUEST");
    if (!passChangeEntry || passChangeEntry.details.password.includes("SecretPassword123!")) {
      throw new Error("Audit log contains plaintext password details");
    }

    // Test buffer capping
    testAudit.log("EVENT_4", { userId: "u1" });
    testAudit.log("EVENT_5", { userId: "u1" });
    testAudit.log("EVENT_6", { userId: "u1" });
    if (testAudit.buffer.length > 5) {
      throw new Error(`Buffer exceeded max bounded capacity: ${testAudit.buffer.length}`);
    }

    console.log("  ✓ [PASS] 5. Audit service records events in bounded buffer with automatic sensitive masking");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 5. Audit logging & buffer:", e.message);
    failed++;
  }

  // Test 6: Rate Limiter Response Headers Generation
  try {
    const limiter = createRateLimiter({
      windowMs: 60 * 1000,
      max: 5,
      skipTestEnv: false
    });

    const headers = {};
    const req = { ip: "10.0.0.1" };
    const res = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
      status: () => res,
      json: () => res
    };
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    limiter(req, res, next);

    if (!nextCalled) {
      throw new Error("Rate limiter did not invoke next() on initial request");
    }
    if (headers["RateLimit-Limit"] !== 5) {
      throw new Error(`Expected RateLimit-Limit 5, got ${headers["RateLimit-Limit"]}`);
    }
    if (headers["RateLimit-Remaining"] !== 4) {
      throw new Error(`Expected RateLimit-Remaining 4, got ${headers["RateLimit-Remaining"]}`);
    }
    if (typeof headers["RateLimit-Reset"] !== "number") {
      throw new Error("RateLimit-Reset header is missing or non-numeric");
    }

    console.log("  ✓ [PASS] 6. Rate limiter correctly sets RateLimit-Limit, Remaining, and Reset headers");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 6. Rate limiter headers:", e.message);
    failed++;
  }

  // Test 7: Rate Limiter Throttling (HTTP 429)
  try {
    const limiter = createRateLimiter({
      windowMs: 60 * 1000,
      max: 2,
      skipTestEnv: false,
      message: "Custom throttle message"
    });

    const req = { ip: "10.0.0.99" };
    let statusCode = null;
    let jsonBody = null;
    const headers = {};

    const res = {
      setHeader: (k, v) => {
        headers[k] = v;
      },
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (body) => {
        jsonBody = body;
        return res;
      }
    };
    const next = () => {};

    // 1st request
    limiter(req, res, next);
    // 2nd request
    limiter(req, res, next);
    // 3rd request (should trigger 429)
    limiter(req, res, next);

    if (statusCode !== 429) {
      throw new Error(`Expected HTTP 429 status code on 3rd request, got ${statusCode}`);
    }
    if (!jsonBody || jsonBody.error.code !== "RATE_LIMIT_EXCEEDED") {
      throw new Error(`Expected RATE_LIMIT_EXCEEDED error code, got ${JSON.stringify(jsonBody)}`);
    }
    if (!headers["Retry-After"]) {
      throw new Error("Retry-After header was not set on HTTP 429 response");
    }

    console.log("  ✓ [PASS] 7. Rate limiter enforces HTTP 429 throttling and Retry-After header on excess requests");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 7. Rate limiter 429 throttling:", e.message);
    failed++;
  }

  // Test 8: Password Strength Validation Policy
  try {
    const weakPasswords = [
      "short", // too short
      "alllowercase123!", // no uppercase
      "ALLUPPERCASE123!", // no lowercase
      "NoNumbersHere!", // no digit
      "NoSpecialSymbols123" // no special symbol
    ];

    for (const weak of weakPasswords) {
      if (isStrongPassword(weak)) {
        throw new Error(`Weak password "${weak}" was incorrectly accepted as strong`);
      }
    }

    const strongPasswords = [
      "VedicSecure@2026",
      "OmNamahShivaya#108",
      "Trishul*Protection99"
    ];

    for (const strong of strongPasswords) {
      if (!isStrongPassword(strong)) {
        throw new Error(`Strong password "${strong}" was incorrectly rejected`);
      }
    }

    // Test middleware wrapper
    const reqWeak = { body: { password: "weak" } };
    let weakStatus = null;
    const resWeak = {
      status: (code) => {
        weakStatus = code;
        return { json: () => {} };
      }
    };
    validatePasswordStrength()(reqWeak, resWeak, () => {});

    if (weakStatus !== 400) {
      throw new Error(`Expected 400 validation error for weak password middleware, got ${weakStatus}`);
    }

    console.log("  ✓ [PASS] 8. Password strength validator rigorously enforces length, casing, numbers, and symbols");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 8. Password strength validation:", e.message);
    failed++;
  }

  // Test 9: Indian Mobile Format Validation
  try {
    const validMobiles = [
      "9876543210",
      "+919876543210",
      "+91-9876543210",
      "+91 9876543210",
      "8765432109",
      "7654321098",
      "6543210987"
    ];

    for (const mob of validMobiles) {
      if (!isValidIndianMobile(mob)) {
        throw new Error(`Valid Indian mobile "${mob}" was rejected`);
      }
    }

    const invalidMobiles = [
      "1234567890", // does not start with 6-9
      "5876543210", // starts with 5
      "987654321", // 9 digits
      "987654321000", // too long
      "abcdefghij" // alphabetic
    ];

    for (const mob of invalidMobiles) {
      if (isValidIndianMobile(mob)) {
        throw new Error(`Invalid mobile "${mob}" was incorrectly accepted`);
      }
    }

    console.log("  ✓ [PASS] 9. Indian mobile validator verifies standard 10-digit formats with prefix compatibility");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 9. Indian mobile validation:", e.message);
    failed++;
  }

  // Test 10: Email and Rating Validation
  try {
    if (!isValidEmail("devotee@haridwar.org") || isValidEmail("invalid-email@")) {
      throw new Error("Email validation regex produced unexpected output");
    }

    if (!isValidRating(1) || !isValidRating(5) || !isValidRating("4.5")) {
      throw new Error("Valid ratings were rejected");
    }

    if (isValidRating(0) || isValidRating(6) || isValidRating("abc") || isValidRating(-1)) {
      throw new Error("Invalid out-of-bounds ratings were accepted");
    }

    // Test rating middleware
    let ratingStatus = null;
    const reqInvalidRating = { body: { rating: 10 } };
    const resRating = {
      status: (c) => {
        ratingStatus = c;
        return { json: () => {} };
      }
    };
    validateRating()(reqInvalidRating, resRating, () => {});
    if (ratingStatus !== 400) {
      throw new Error(`Expected 400 for out-of-range rating, got ${ratingStatus}`);
    }

    console.log("  ✓ [PASS] 10. Email and 1-5 star rating validators reject malformed and out-of-range inputs");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 10. Email & rating validation:", e.message);
    failed++;
  }

  // Test 11: Security Headers Configuration (Helmet & X-Powered-By)
  try {
    if (app.get("x-powered-by")) {
      throw new Error("X-Powered-By is enabled on Express application");
    }

    // Verify Helmet is mounted in the express middleware stack
    const stack = app._router ? app._router.stack : [];
    const hasHelmet = stack.some(
      (layer) => layer.name === "helmet" || layer.name === "helmetMiddleware"
    );

    if (!hasHelmet) {
      throw new Error("Helmet security middleware was not found in application middleware stack");
    }

    console.log("  ✓ [PASS] 11. Security headers hardened: X-Powered-By disabled and Helmet protection active");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 11. Security headers:", e.message);
    failed++;
  }

  // Test 12: Global Sanitization & Rate Limiter Pipeline Integration
  try {
    const stack = app._router ? app._router.stack : [];
    const hasHPP = stack.some((layer) => layer.name === "preventHPPMiddleware");
    const hasSanitization = stack.some((layer) => layer.name === "securitySanitizationMiddleware");
    const hasRateLimiter = stack.some((layer) => layer.name === "rateLimiter");

    if (!hasHPP) {
      throw new Error("preventHPPMiddleware was not registered in app.js");
    }
    if (!hasSanitization) {
      throw new Error("securitySanitizationMiddleware was not registered in app.js");
    }
    if (!hasRateLimiter) {
      throw new Error("rateLimiter was not registered in app.js");
    }

    console.log("  ✓ [PASS] 12. Global sanitization, HPP protection, and rate limiting pipelines successfully mounted in Express app");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 12. Pipeline integration:", e.message);
    failed++;
  }

  console.log("\n==========================================");
  console.log(`Phase 15 Verification Completed: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
