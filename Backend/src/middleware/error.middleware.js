const logger = require("../utils/logger");

function errorMiddleware(err, req, res, next) {
  logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, err);

  // Mongoose Schema Validation Error
  if (err.name === "ValidationError") {
    const details = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: details,
      error: {
        code: "VALIDATION_FAILED",
        details
      }
    });
  }

  // Mongoose CastError (invalid ObjectId, invalid type)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid resource identifier",
      error: {
        code: "INVALID_IDENTIFIER",
        field: err.path
      }
    });
  }

  // MongoDB Duplicate Key Error (11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: `A record with that ${field} already exists`,
      error: {
        code: "DUPLICATE_KEY",
        field
      }
    });
  }

  // MongoDB / Mongoose Network & Connection Errors
  if (
    err.name === "MongooseServerSelectionError" ||
    err.name === "MongoNetworkError" ||
    (err.message && (err.message.includes("SSL") || err.message.includes("tlsv1 alert") || err.message.includes("Server selection timed out")))
  ) {
    console.error("\n========================================================");
    console.error(" [DATABASE CONNECTION ERROR]");
    console.error(` Endpoint: ${req.method} ${req.originalUrl}`);
    console.error(` Error:    ${err.message}`);
    if (err.reason) console.error(" Reason:  ", err.reason);
    console.error(" Tip: Verify MongoDB Atlas Network Access IP Whitelist.");
    console.error("========================================================\n");

    return res.status(503).json({
      success: false,
      message: "Database connection temporarily unavailable. Please try again later.",
      error: {
        code: "DATABASE_UNAVAILABLE",
        details: process.env.NODE_ENV === "production" ? "Database service temporarily unavailable." : err.message
      }
    });
  }

  // Custom AppError
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: {
        code: err.errorCode,
        details: err.details
      }
    });
  }

  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    console.error(`\n[500 INTERNAL SERVER ERROR] ${req.method} ${req.originalUrl}`);
    console.error(`Name:    ${err.name || "Error"}`);
    console.error(`Message: ${err.message}`);
    if (err.code) console.error(`Code:    ${err.code}`);
    if (err.stack) console.error(`Stack:   ${err.stack}`);
    if (err.cause) console.error(`Cause:  `, err.cause);
    console.error("--------------------------------------------------------\n");
  } else {
    logger.error(`Internal server error on ${req.method} ${req.originalUrl}: ${err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    message: err.statusCode ? err.message : "Internal server error",
    error: {
      code: "INTERNAL_SERVER_ERROR",
      details: isProd ? "An internal error occurred. Please contact support if the issue persists." : err.message,
      ...(isProd ? {} : { stack: err.stack })
    }
  });
}

function notFoundMiddleware(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    error: {
      code: "ROUTE_NOT_FOUND"
    }
  });
}

module.exports = {
  errorMiddleware,
  notFoundMiddleware
};
