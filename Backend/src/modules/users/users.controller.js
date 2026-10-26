const usersService = require("./users.service");
const ApiResponse = require("../../utils/apiResponse");

class UsersController {
  async getProfile(req, res) {
    const user = await usersService.getProfile(req.user._id);
    return ApiResponse.success(res, {
      message: "Profile retrieved successfully",
      data: { user, ...user }
    });
  }

  async updateProfile(req, res) {
    const user = await usersService.updateProfile(req.user._id, req.body);
    return ApiResponse.success(res, {
      message: "Profile updated successfully",
      data: { user, ...user }
    });
  }

  async updatePreferences(req, res) {
    const preferences = await usersService.updatePreferences(req.user._id, req.body);
    return ApiResponse.success(res, {
      message: "Notification preferences updated successfully",
      data: preferences
    });
  }
}

module.exports = new UsersController();
