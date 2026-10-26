const router = require("express").Router();
const { aesEncryptionService } = require("../../services/aes_encryption");
const ApiResponse = require("../../utils/apiResponse");

/**
 * GET /api/crypto/session-key
 * Returns runtime encryption configuration and active session key over secure HTTPS.
 * Never embed confidential keys in frontend source code or build bundles.
 */
router.get("/session-key", (req, res) => {
  return ApiResponse.error(
    res,
    "Endpoint decommissioned for security: Key distribution over public API is prohibited.",
    403
  );
});

/**
 * POST /api/crypto/test-echo
 * Diagnostic endpoint for testing client-server encryption/decryption round-trip.
 * Uses aesEncryptionService.middleware() to auto-decrypt payload.
 */
router.post("/test-echo", aesEncryptionService.middleware(), (req, res) => {
  return ApiResponse.success(res, {
    message: "Payload decrypted successfully",
    wasEncrypted: Boolean(req._wasEncrypted),
    decryptedData: req.body
  });
});

module.exports = router;
