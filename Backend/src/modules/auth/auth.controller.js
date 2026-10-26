const authService = require("./auth.service");
const ApiResponse = require("../../utils/apiResponse");

class AuthController {
  async register(req, res) {
    const result = await authService.register(req.body);
    return ApiResponse.created(res, {
      message: "Customer registered successfully",
      data: result
    });
  }

  async login(req, res) {
    const result = await authService.login(req.body);
    return ApiResponse.success(res, {
      message: "Login successful",
      data: result
    });
  }

  async requestForgotPasswordOtp(req, res) {
    const identifier = req.body.identifier || req.body.email || req.body.mobile;
    const result = await authService.requestForgotPasswordOtp(identifier);
    return ApiResponse.success(res, {
      message: result.message,
      data: result
    });
  }

  async verifyForgotPasswordOtp(req, res) {
    const identifier = req.body.identifier || req.body.email || req.body.mobile;
    const result = await authService.verifyForgotPasswordOtp({
      identifier,
      otp: req.body.otp,
      resetToken: req.body.resetToken,
      password: req.body.password,
      confirmPassword: req.body.confirmPassword
    });
    return ApiResponse.success(res, {
      message: result.message,
      data: result
    });
  }

  async verifyOtp(req, res) {
    const identifier = req.body.identifier || req.body.email || req.body.mobile;
    const result = await authService.verifyForgotPasswordOtpOnly({
      identifier,
      otp: req.body.otp
    });
    return ApiResponse.success(res, {
      message: result.message,
      data: result
    });
  }

  async resetPassword(req, res) {
    const identifier = req.body.identifier || req.body.email || req.body.mobile;
    const result = await authService.resetPassword({
      resetToken: req.body.resetToken,
      identifier,
      otp: req.body.otp,
      password: req.body.password,
      confirmPassword: req.body.confirmPassword
    });
    return ApiResponse.success(res, {
      message: result.message,
      data: result
    });
  }

  async changePassword(req, res) {
    const result = await authService.changePassword({
      userId: req.user._id,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
      confirmPassword: req.body.confirmPassword
    });
    return ApiResponse.success(res, {
      message: result.message
    });
  }

  async refreshToken(req, res) {
    const result = await authService.refreshToken(req.user);
    return ApiResponse.success(res, {
      message: "Token refreshed successfully",
      data: result
    });
  }

  async logout(req, res) {
    return ApiResponse.success(res, {
      message: "Logged out successfully. Discard the JWT on the client."
    });
  }
}

module.exports = new AuthController();
