const SENSITIVE_KEYS = new Set([
  "password",
  "confirmpassword",
  "token",
  "secret",
  "jwt_secret",
  "razorpay_key_secret",
  "razorpay_webhook_secret",
  "smtp_password",
  "twilio_auth_token",
  "signature",
  "cardnumber",
  "cvv"
]);

function sanitize(data) {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(sanitize);
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const logger = {
  info(message, meta) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, meta ? sanitize(meta) : "");
  },
  warn(message, meta) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`, meta ? sanitize(meta) : "");
  },
  error(message, error) {
    const timestamp = new Date().toISOString();
    const errorDetails = error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          code: error.code,
          stack: error.stack
        }
      : error;
    console.error(`[${timestamp}] [ERROR] ${message}`, errorDetails ? sanitize(errorDetails) : "");
  },
  debug(message, meta) {
    if (process.env.NODE_ENV === "development") {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] [DEBUG] ${message}`, meta ? sanitize(meta) : "");
    }
  }
};

module.exports = logger;
