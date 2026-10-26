/**
 * In-memory rate limiting middleware for sensitive auth and financial endpoints.
 * Provides brute-force and DDoS protection without requiring external Redis.
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 20,
  message = "Too many attempts. Please try again later.",
  skipTestEnv = true
} = {}) {
  const requests = new Map();

  // Periodic cleanup of expired entries every 5 minutes
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requests.entries()) {
      if (now > record.resetTime) {
        requests.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  interval.unref();

  function rateLimiter(req, res, next) {
    if (skipTestEnv && process.env.NODE_ENV === "test") {
      return next();
    }

    const ip =
      req.ip ||
      (req.socket && req.socket.remoteAddress) ||
      (req.connection && req.connection.remoteAddress) ||
      "127.0.0.1";

    const now = Date.now();

    let record = requests.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + windowMs };
      requests.set(ip, record);
    }

    record.count++;

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", resetSeconds);

    if (record.count > max) {
      res.setHeader("Retry-After", resetSeconds);
      return res.status(429).json({
        success: false,
        message,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: resetSeconds
        }
      });
    }

    next();
  }

  // Expose reset method for testing
  rateLimiter.reset = () => requests.clear();
  rateLimiter.getRequests = () => requests;

  return rateLimiter;
}

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per 15 min per IP
  message: "API rate limit exceeded. Please throttle your requests."
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 min per IP
  message: "Too many authentication requests from this IP. Please try again after 15 minutes."
});

const paymentLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // 25 payment attempts per 15 min
  message: "Too many payment operations. Please wait before attempting again."
});

const otpLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 attempts per 10 min
  message: "Too many OTP requests. Please wait 10 minutes before requesting again."
});

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter,
  paymentLimiter,
  otpLimiter
};
