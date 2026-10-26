const router = require("express").Router();
const authController = require("./auth.controller");
const usersController = require("../users/users.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { authLimiter, otpLimiter } = require("../../middleware/rateLimit.middleware");

router.post("/register", authLimiter, (req, res) => authController.register(req, res));
router.post("/login", authLimiter, (req, res) => authController.login(req, res));

// Password Reset Flow (with aliases for standard client compatibility)
router.post("/forgot-password", otpLimiter, (req, res) => authController.requestForgotPasswordOtp(req, res));
router.post("/forgot-password/request-otp", otpLimiter, (req, res) => authController.requestForgotPasswordOtp(req, res));
router.post("/forgot-password/verify-otp", otpLimiter, (req, res) => authController.verifyOtp(req, res));
router.post("/verify-otp", otpLimiter, (req, res) => authController.verifyOtp(req, res));
router.post("/reset-password", otpLimiter, (req, res) => authController.resetPassword(req, res));

// Authenticated session and password management
router.post("/change-password", requireAuth, (req, res) => authController.changePassword(req, res));
router.post("/refresh-token", requireAuth, (req, res) => authController.refreshToken(req, res));
router.post("/logout", requireAuth, (req, res) => authController.logout(req, res));

// User Profile routes preserved under /auth for backward compatibility
router.get("/me", requireAuth, (req, res) => usersController.getProfile(req, res));
router.patch("/me", requireAuth, (req, res) => usersController.updateProfile(req, res));
router.patch("/me/preferences", requireAuth, (req, res) => usersController.updatePreferences(req, res));

module.exports = router;
