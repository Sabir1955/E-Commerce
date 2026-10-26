/**
 * HTTP Caching, Invalidation, and Compression Middleware
 */
const crypto = require("crypto");
const zlib = require("zlib");
const { cacheService } = require("../services/cache.service");

/**
 * Generate ETag hash from JSON payload string
 */
function generateETag(payload) {
  const str = typeof payload === "string" ? payload : JSON.stringify(payload);
  const hash = crypto.createHash("sha1").update(str).digest("base64url");
  return `W/"${hash.substring(0, 16)}"`;
}

/**
 * Route-level in-memory caching middleware
 * @param {number} durationSeconds - Cache TTL in seconds (default: 120s)
 * @param {string} [prefix] - Optional custom key prefix
 */
function cacheMiddleware(durationSeconds = 120, prefix = "") {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    // Skip caching for authenticated requests (e.g. admin panel) or query all=true / includeInactive=true
    if (req.headers?.authorization || req.query?.all === "true" || req.query?.includeInactive === "true") {
      return next();
    }

    const cacheKey = `${prefix || req.baseUrl || "route"}:${req.originalUrl}`;
    const cachedData = cacheService.get(cacheKey);

    if (cachedData !== null) {
      const etag = generateETag(cachedData);
      
      // Conditional HTTP 304 validation
      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch && ifNoneMatch === etag) {
        res.setHeader("X-Cache", "HIT");
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", `public, max-age=${durationSeconds}, stale-while-revalidate=30`);
        return res.status(304).end();
      }

      res.setHeader("X-Cache", "HIT");
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", `public, max-age=${durationSeconds}, stale-while-revalidate=30`);
      return res.json(cachedData);
    }

    // Cache MISS: Intercept res.json to capture response
    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", `public, max-age=${durationSeconds}, stale-while-revalidate=30`);

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful 200 responses
      if (res.statusCode === 200 && body !== null && body !== undefined) {
        cacheService.set(cacheKey, body, durationSeconds);
        const etag = generateETag(body);
        res.setHeader("ETag", etag);
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Strict no-cache middleware for private, authenticated, or sensitive endpoints
 */
function noCacheMiddleware(req, res, next) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
}

/**
 * Invalidate cache by one or more key prefixes
 * @param {string|string[]} prefixes
 */
function invalidateCache(prefixes) {
  const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];
  let totalInvalidated = 0;
  for (const prefix of prefixList) {
    totalInvalidated += cacheService.invalidatePrefix(prefix);
  }
  return totalInvalidated;
}

/**
 * Native Gzip Response Compression Middleware
 * Automatically compresses JSON and text responses > 1KB when client supports gzip
 */
function compressionMiddleware(req, res, next) {
  // Do not compress swagger documentation or static swagger assets
  if (req.originalUrl && req.originalUrl.startsWith("/api-docs")) {
    return next();
  }

  const acceptEncoding = req.headers["accept-encoding"] || "";
  if (!acceptEncoding.includes("gzip")) {
    return next();
  }

  const originalSend = res.send.bind(res);

  res.send = (body) => {
    // Only compress string or Buffer payloads
    if (!body || res.headersSent) {
      return originalSend(body);
    }

    // Determine and preserve Content-Type BEFORE compressing to a Buffer
    // to prevent Express from falling back to application/octet-stream
    const existingContentType = typeof res.getHeader === "function"
      ? res.getHeader("Content-Type")
      : (typeof res.get === "function" ? res.get("Content-Type") : null);

    if (!existingContentType && typeof res.setHeader === "function") {
      if (typeof body === "string") {
        const trimmed = body.trim();
        if (trimmed.startsWith("<")) {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
        } else {
          try {
            JSON.parse(body);
            res.setHeader("Content-Type", "application/json; charset=utf-8");
          } catch {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
          }
        }
      } else if (typeof body === "object" && !Buffer.isBuffer(body)) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
    }

    const buffer = Buffer.isBuffer(body)
      ? body
      : typeof body === "string"
      ? Buffer.from(body, "utf8")
      : typeof body === "object"
      ? Buffer.from(JSON.stringify(body), "utf8")
      : null;

    // Only compress if payload is >= 1024 bytes (1 KB)
    if (!buffer || buffer.length < 1024) {
      return originalSend(body);
    }

    try {
      const gzipped = zlib.gzipSync(buffer, { level: 6 });
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Length", gzipped.length);
      return originalSend(gzipped);
    } catch {
      return originalSend(body);
    }
  };

  next();
}

module.exports = {
  cacheMiddleware,
  noCacheMiddleware,
  invalidateCache,
  compressionMiddleware,
  generateETag
};
