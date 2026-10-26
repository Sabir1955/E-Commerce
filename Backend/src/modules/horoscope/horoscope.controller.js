const horoscopeService = require("./horoscope.service");
const ApiResponse = require("../../utils/apiResponse");

class HoroscopeController {
  async getZodiacSigns(req, res) {
    const signs = horoscopeService.getZodiacSigns();
    return ApiResponse.success(res, {
      message: "Zodiac signs retrieved successfully",
      data: signs
    });
  }

  async getTodayHoroscopes(req, res) {
    const { date, sign, lang } = req.query;
    const result = await horoscopeService.getPublishedHoroscopes({ date, sign, lang });
    return ApiResponse.success(res, {
      message: "Horoscope predictions retrieved successfully",
      data: result
    });
  }

  async getAdminHoroscopes(req, res) {
    const { date, sign, status, lang, limit, offset } = req.query;
    const result = await horoscopeService.getAdminHoroscopes({ date, sign, status, lang, limit, offset });
    return ApiResponse.success(res, {
      message: "Horoscopes retrieved successfully",
      data: result
    });
  }

  async saveHoroscope(req, res) {
    const result = await horoscopeService.upsertHoroscope(req.body, req.user);
    return ApiResponse.success(res, {
      message: "Horoscope saved successfully",
      data: result
    }, 201);
  }

  async updateHoroscope(req, res) {
    const result = await horoscopeService.updateHoroscope(req.params.id, req.body, req.user);
    return ApiResponse.success(res, {
      message: "Horoscope updated successfully",
      data: result
    });
  }

  async updateStatus(req, res) {
    const result = await horoscopeService.updateStatus(req.params.id, req.body.status);
    return ApiResponse.success(res, {
      message: "Horoscope status updated successfully",
      data: result
    });
  }

  async deleteHoroscope(req, res) {
    const result = await horoscopeService.deleteHoroscope(req.params.id);
    return ApiResponse.success(res, {
      message: "Horoscope deleted successfully",
      data: result
    });
  }
}

module.exports = new HoroscopeController();
