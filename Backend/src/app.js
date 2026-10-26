require("express-async-errors");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const masterRouter = require("./routes/index");
const webhookRoutes = require("./routes/webhooks");
const { errorMiddleware, notFoundMiddleware } = require("./middleware/error.middleware");
const { compressionMiddleware } = require("./middleware/cache.middleware");
const { securitySanitizationMiddleware, preventHPP } = require("./middleware/sanitization.middleware");
const { profilerMiddleware, getLatencyMetrics } = require("./middleware/profiler.middleware");
const { getConnectionState } = require("./config/database");
const { cacheService } = require("./services/cache.service");
const { env } = require("./config/env");

const app = express();
app.set("trust proxy", 1);

/* =========================================================
   PERFORMANCE PROFILER & LATENCY MONITORING
   Mounted first to track end-to-end processing time
========================================================= */
app.use(profilerMiddleware);

/* =========================================================
   SECURITY HARDENING
========================================================= */
app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://checkout.razorpay.com",
          "https://*.razorpay.com",
          "https://razorpay.com",
          "https://*.razorpay.in",
          "https://razorpay.in",
          "https://api.sardine.ai",
          "https://*.sardine.ai",
          "https://ebz-static.s3.ap-south-1.amazonaws.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://*.razorpay.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://*.razorpay.com",
          "data:"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*.razorpay.com",
          "https://razorpay.com",
          "https://*.razorpay.in",
          "https://razorpay.in",
          "https://api.sardine.ai",
          "https://*.sardine.ai",
          "https://*.s3.amazonaws.com",
          "https://*.s3.ap-south-1.amazonaws.com",
          "https://s3.amazonaws.com",
          "https://s3.ap-south-1.amazonaws.com",
          "https://*.cloudfront.net",
          "https://ebz-static.s3.ap-south-1.amazonaws.com",
          "https://images.unsplash.com"
        ],
        connectSrc: [
          "'self'",
          "https://*.razorpay.com",
          "https://api.razorpay.com",
          "https://lumberjack.razorpay.com",
          "https://lumberjack-cx.razorpay.com",
          "https://lumberjack-metrics.razorpay.com",
          "https://checkout-static-next.razorpay.com",
          "https://*.razorpay.in",
          "https://razorpay.com",
          "https://api.sardine.ai",
          "https://*.sardine.ai",
          "wss://*.razorpay.com",
          "wss://*.sardine.ai",
          "https://pay.easebuzz.in",
          "https://testpay.easebuzz.in"
        ],
        frameSrc: [
          "'self'",
          "https://api.razorpay.com",
          "https://*.razorpay.com",
          "https://razorpay.com",
          "https://*.razorpay.in",
          "https://razorpay.in",
          "https://api.sardine.ai",
          "https://*.sardine.ai",
          "https://pay.easebuzz.in",
          "https://testpay.easebuzz.in"
        ],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false
  })
);

/* =========================================================
   PERMISSIONS POLICY & CORS
========================================================= */
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    'accelerometer=(self "https://api.razorpay.com" "https://*.razorpay.com"), gyroscope=(self "https://api.razorpay.com" "https://*.razorpay.com")'
  );
  next();
});

const allowedOrigins = new Set(env.ALLOWED_ORIGINS || []);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) {
        return callback(null, origin);
      }
      if (env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, origin);
      }
      return callback(new Error("CORS policy violation: origin not permitted"), false);
    },
    credentials: true,
    exposedHeaders: [
      "x-rtb-fingerprint-id",
      "request-id",
      "x-request-id",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
      "Retry-After"
    ]
  })
);

/* =========================================================
   WEBHOOKS
   Must come before express.json() for raw signature verification
========================================================= */
app.use("/api/webhooks", webhookRoutes);

/* =========================================================
   PARSERS & LOGGING
========================================================= */
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =========================================================
   SANITIZATION & HTTP PARAMETER POLLUTION (HPP)
========================================================= */
app.use(preventHPP());
app.use(securitySanitizationMiddleware);

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

/* =========================================================
   RESPONSE COMPRESSION (GZIP)
========================================================= */
app.use(compressionMiddleware);

/* =========================================================
   STATIC ASSET CACHING (UPLOADS & SVGs)
========================================================= */
const uploadsDir = path.join(__dirname, "..", "uploads");
const staticUploadsMiddleware = [
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(uploadsDir, {
    maxAge: "7d",
    etag: true,
    lastModified: true
  })
];

app.use("/uploads", ...staticUploadsMiddleware);
app.use("/api/uploads", ...staticUploadsMiddleware);

/* =========================================================
   SWAGGER DOCUMENTATION
========================================================= */
app.get("/api-docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

app.use(
  "/api-docs",
  (req, res, next) => {
    if (req.originalUrl === "/api-docs") {
      return res.redirect(301, "/api-docs/");
    }
    next();
  },
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      validatorUrl: null
    },
    customSiteTitle: "Astrology E-Commerce API Documentation"
  })
);

/* =========================================================
   ROOT & TELEMETRY HEALTH CHECK
========================================================= */
app.get("/", (req, res) => {
  res.json({
    message: "Astrology E-commerce API is running",
    health: "/api/health",
    documentation: "/api-docs"
  });
});

app.get("/api/health", (req, res) => {
  const memory = process.memoryUsage();
  const uptimeSeconds = Math.floor(process.uptime());
  const dbState = getConnectionState();
  const isHealthy = dbState === "connected";

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    service: "e-commerce-api",
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptimeSeconds,
      formatted: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`
    },
    database: {
      type: "postgresql",
      status: dbState,
      database: process.env.PGDATABASE || "astro_ecommerce"
    },
    memory: {
      heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(2)),
      heapTotalMb: Number((memory.heapTotal / 1024 / 1024).toFixed(2)),
      rssMb: Number((memory.rss / 1024 / 1024).toFixed(2))
    },
    cache: cacheService.getStats(),
    performance: getLatencyMetrics()
  });
});

/* =========================================================
   API ROUTES & RATE LIMITING
========================================================= */
app.use("/api", masterRouter);

/* =========================================================
   ERROR HANDLING
========================================================= */
app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
