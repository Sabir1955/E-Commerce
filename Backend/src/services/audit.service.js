/**
 * Security Audit Logging & Sensitive Data Masking Service
 * Tracks critical security events while ensuring sensitive credentials,
 * payment secrets, tokens, and PII are never logged in plaintext.
 */

const SENSITIVE_KEYS = new Set([
  "password",
  "confirmpassword",
  "currentpassword",
  "newpassword",
  "token",
  "refreshtoken",
  "secret",
  "signature",
  "razorpaysignature",
  "key_secret",
  "cvv",
  "cardnumber",
  "pan",
  "otp",
  "otpcode",
  "authorization"
]);

/**
 * Deeply clone and mask sensitive fields in objects
 */
function maskSensitiveData(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item));
  }

  const masked = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      if (typeof value === "string") {
        if (lowerKey === "authorization" && value.startsWith("Bearer ")) {
          masked[key] = "Bearer " + value.substring(7, 13) + "...***";
        } else if (value.length > 4) {
          masked[key] = value.substring(0, 2) + "...***" + value.substring(value.length - 2);
        } else {
          masked[key] = "***MASKED***";
        }
      } else {
        masked[key] = "***MASKED***";
      }
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

class AuditService {
  constructor(maxBufferSize = 500) {
    this.buffer = [];
    this.maxBufferSize = maxBufferSize;
  }

  /**
   * Record a security or administrative audit event
   * @param {string} action - Event action type
   * @param {object} actor - Information about the actor (userId, email, ip, role)
   * @param {object} details - Event details (automatically sanitized and masked)
   */
  log(action, actor = {}, details = {}) {
    const sanitizedDetails = maskSensitiveData(details);
    const sanitizedActor = maskSensitiveData(actor);

    const auditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      action,
      actor: {
        userId: sanitizedActor.userId || null,
        email: sanitizedActor.email || null,
        role: sanitizedActor.role || "guest",
        ip: sanitizedActor.ip || "unknown",
        userAgent: sanitizedActor.userAgent || "unknown"
      },
      details: sanitizedDetails
    };

    this.buffer.unshift(auditEntry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.pop();
    }

    if (process.env.NODE_ENV !== "test") {
      console.log(`[AUDIT] [${auditEntry.timestamp}] [${auditEntry.action}] Actor: ${auditEntry.actor.email || auditEntry.actor.ip} - ${JSON.stringify(auditEntry.details)}`);
    }

    return auditEntry;
  }

  /**
   * Retrieve recent audit logs with optional filtering
   */
  getRecentLogs(limit = 50, filter = {}) {
    let result = [...this.buffer];

    if (filter.action) {
      result = result.filter((entry) => entry.action === filter.action);
    }

    if (filter.email) {
      result = result.filter(
        (entry) => entry.actor.email && entry.actor.email.toLowerCase() === filter.email.toLowerCase()
      );
    }

    if (filter.userId) {
      result = result.filter(
        (entry) => String(entry.actor.userId) === String(filter.userId)
      );
    }

    return result.slice(0, Math.min(limit, this.maxBufferSize));
  }

  clear() {
    this.buffer = [];
  }
}

const auditService = new AuditService();

module.exports = {
  AuditService,
  auditService,
  maskSensitiveData
};
