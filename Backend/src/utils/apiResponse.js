class ApiResponse {
  /**
   * Send a standardized success response.
   * Spreads data properties onto root for 100% backward compatibility with existing tests and clients.
   */
  static success(res, { data = null, message = "Success", statusCode = 200, ...extra } = {}) {
    const responsePayload = {
      success: true,
      message,
      data,
      ...extra
    };

    // If data is an object, expose its top-level fields for backwards compatibility
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const plainData = typeof data.toObject === "function" ? data.toObject() : (typeof data.toJSON === "function" ? data.toJSON() : data);
      if (plainData && typeof plainData === "object" && !Array.isArray(plainData)) {
        for (const [key, value] of Object.entries(plainData)) {
          if (responsePayload[key] === undefined) {
            responsePayload[key] = value;
          }
        }
      }
    }

    return res.status(statusCode).json(responsePayload);
  }

  /**
   * Send a standardized created response (HTTP 201).
   */
  static created(res, { data = null, message = "Resource created successfully", ...extra } = {}) {
    return ApiResponse.success(res, { data, message, statusCode: 201, ...extra });
  }

  /**
   * Send a standardized error response.
   */
  static error(res, {
    message = "An error occurred",
    statusCode = 500,
    errorCode = "INTERNAL_SERVER_ERROR",
    details = null
  } = {}) {
    return res.status(statusCode).json({
      success: false,
      message,
      data: null,
      error: {
        code: errorCode,
        details
      }
    });
  }
}

module.exports = ApiResponse;
