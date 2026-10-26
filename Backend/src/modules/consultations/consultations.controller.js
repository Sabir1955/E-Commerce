const consultationsService = require("./consultations.service");
const { postgresImageService } = require("../../services/postgresImage.service");
const ApiResponse = require("../../utils/apiResponse");
const { BadRequestError } = require("../../utils/errors");

class ConsultationsController {
  // Public / Customer Endpoints
  async getActiveAstrologers(req, res) {
    const astrologers = await consultationsService.getActiveAstrologers();
    return ApiResponse.success(res, {
      message: "Astrologers retrieved successfully",
      data: astrologers
    });
  }

  async getAstrologerDetails(req, res) {
    const astrologer = await consultationsService.getAstrologerById(req.params.id);
    return ApiResponse.success(res, {
      message: "Astrologer details retrieved successfully",
      data: astrologer
    });
  }

  async getServices(req, res) {
    const { astrologerId, mode } = req.query;
    const services = await consultationsService.getServices(astrologerId, mode);
    return ApiResponse.success(res, {
      message: "Consultation services retrieved successfully",
      data: services
    });
  }

  async getServiceById(req, res) {
    const service = await consultationsService.getServiceById(req.params.id);
    return ApiResponse.success(res, {
      message: "Consultation service retrieved successfully",
      data: service
    });
  }

  async getAvailableSlots(req, res) {
    const { date, duration, mode } = req.query;
    const slots = await consultationsService.getAvailableSlots(req.params.id, date, duration, mode);
    return ApiResponse.success(res, {
      message: "Available slots calculated successfully",
      data: slots
    });
  }

  // Reservation & Payment Gating
  async reserveSlot(req, res) {
    const result = await consultationsService.reserveSlotAndInitiatePayment(req.user, req.body);
    return ApiResponse.success(res, {
      message: "Time slot reserved successfully. Complete payment to confirm appointment.",
      data: result
    }, 201);
  }

  async verifyPayment(req, res) {
    const result = await consultationsService.verifyBookingPayment(req.user, req.body);
    const message = result?.booking
      ? "Payment verified and appointment confirmed successfully!"
      : "Payment verified successfully";
    return ApiResponse.success(res, {
      message,
      data: result
    });
  }

  async cancelHold(req, res) {
    const { bookingId, reason } = req.body;
    const success = await consultationsService.cancelSlotHold(req.user, bookingId || req.params.id, reason);
    return ApiResponse.success(res, {
      message: "Slot hold cancelled and released successfully",
      data: { released: success }
    });
  }

  async bookConsultation(req, res) {
    const booking = await consultationsService.createBookingRequest(req.user, req.body);
    return ApiResponse.success(res, {
      message: "Consultation booking request submitted successfully. Status: Pending Admin Approval.",
      data: booking
    }, 201);
  }

  async requestBooking(req, res) {
    return this.bookConsultation(req, res);
  }

  async getPaymentGateways(req, res) {
    const gateways = await consultationsService.getAvailablePaymentGateways();
    return ApiResponse.success(res, {
      message: "Available payment gateways retrieved successfully",
      data: gateways
    });
  }

  async initiateCustomerPayment(req, res) {
    const gateway = (req.body?.gateway || req.query?.gateway || "easebuzz").toLowerCase();
    const result = await consultationsService.initiatePaymentForBooking(req.params.id, req.user, gateway);
    return ApiResponse.success(res, {
      message: "Payment order initiated successfully",
      data: result
    });
  }

  async getMyBookings(req, res) {
    const bookings = await consultationsService.getCustomerBookings(req.user._id || req.user.id);
    return ApiResponse.success(res, {
      message: "Your consultation bookings retrieved successfully",
      data: bookings
    });
  }

  async cancelMyBooking(req, res) {
    const booking = await consultationsService.cancelBookingByCustomer(
      req.params.id,
      req.user._id || req.user.id,
      req.body.reason
    );
    return ApiResponse.success(res, {
      message: "Consultation booking cancelled successfully",
      data: booking
    });
  }

  async handleWebhook(req, res) {
    const signature = req.headers["x-razorpay-signature"];
    const result = await consultationsService.handlePaymentWebhook(req.rawBody || JSON.stringify(req.body), signature, req.body);
    return res.status(200).json(result);
  }

  // Admin Endpoints
  async getAdminBookings(req, res) {
    const result = await consultationsService.getAdminBookings(req.query);
    return ApiResponse.success(res, {
      message: "Consultation bookings retrieved successfully",
      data: result
    });
  }

  async acceptBooking(req, res) {
    const booking = await consultationsService.acceptBookingAdmin(req.params.id, req.user, req.body);
    return ApiResponse.success(res, {
      message: "Consultation booking accepted successfully",
      data: booking
    });
  }

  async rejectBooking(req, res) {
    const booking = await consultationsService.rejectBookingAdmin(req.params.id, req.user, req.body.reason || req.body.rejectionReason);
    return ApiResponse.success(res, {
      message: "Consultation booking rejected and slot released successfully",
      data: booking
    });
  }

  async confirmBooking(req, res) {
    const booking = await consultationsService.confirmBookingAdmin(req.params.id, req.user, req.body.adminNotes);
    return ApiResponse.success(res, {
      message: "Consultation booking confirmed successfully",
      data: booking
    });
  }

  async cancelBookingAdmin(req, res) {
    const booking = await consultationsService.cancelBookingAdmin(req.params.id, req.user, req.body.reason);
    return ApiResponse.success(res, {
      message: "Consultation booking cancelled/rejected successfully",
      data: booking
    });
  }

  async processRefund(req, res) {
    const booking = await consultationsService.processRefundAdmin(req.params.id, req.user, req.body.reason);
    return ApiResponse.success(res, {
      message: "Refund processed successfully",
      data: booking
    });
  }

  async updateManualMeetLink(req, res) {
    const booking = await consultationsService.updateManualMeetLink(req.params.id, req.body.meetLink || req.body.googleMeetUrl, req.body.adminNotes);
    return ApiResponse.success(res, {
      message: "Meeting link updated successfully",
      data: booking
    });
  }

  async retryGoogleMeet(req, res) {
    const booking = await consultationsService.retryGoogleMeet(req.params.id);
    return ApiResponse.success(res, {
      message: "Google Meet conference created successfully",
      data: booking
    });
  }

  // Admin Consultation Services CRUD
  async getAdminServices(req, res) {
    const services = await consultationsService.getAdminServices();
    return ApiResponse.success(res, {
      message: "All consultation services retrieved successfully",
      data: services
    });
  }

  async createService(req, res) {
    const service = await consultationsService.createService(req.body);
    return ApiResponse.success(res, {
      message: "Consultation service created successfully",
      data: service
    }, 201);
  }

  async updateService(req, res) {
    const service = await consultationsService.updateService(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: "Consultation service updated successfully",
      data: service
    });
  }

  async deleteService(req, res) {
    await consultationsService.deleteService(req.params.id);
    return ApiResponse.success(res, {
      message: "Consultation service deleted successfully"
    });
  }

  async updateOfficeSettings(req, res) {
    const astrologer = await consultationsService.updateOfficeSettings(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: "Office visiting settings updated successfully",
      data: astrologer
    });
  }

  async getAllAstrologersAdmin(req, res) {
    const astrologers = await consultationsService.getAllAstrologersAdmin();
    return ApiResponse.success(res, {
      message: "All astrologers retrieved successfully",
      data: astrologers
    });
  }

  async createAstrologer(req, res) {
    const astrologer = await consultationsService.createAstrologer(req.body);
    return ApiResponse.success(res, {
      message: "Astrologer created successfully",
      data: astrologer
    }, 201);
  }

  async updateAstrologer(req, res) {
    const astrologer = await consultationsService.updateAstrologer(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: "Astrologer updated successfully",
      data: astrologer
    });
  }

  async getConsultationSettings(req, res) {
    const settings = await consultationsService.getConsultationSettings();
    return ApiResponse.success(res, {
      message: "Consultation settings retrieved successfully",
      data: settings
    });
  }

  async updateConsultationSettings(req, res) {
    const settings = await consultationsService.updateConsultationSettings(req.body);
    return ApiResponse.success(res, {
      message: "Consultation settings updated successfully",
      data: settings
    });
  }

  async uploadPhoto(req, res) {
    const file = req.file || (req.files && req.files.length > 0 ? req.files[0] : null);
    if (!file) {
      throw new BadRequestError("No photo uploaded");
    }

    const uploadRes = await postgresImageService.uploadImage(file, {
      filename: file.originalname || "astrologer-profile.jpg"
    });

    return ApiResponse.success(res, {
      message: "Astrologer profile photo uploaded successfully",
      data: {
        url: uploadRes.url,
        fileId: uploadRes.fileId
      }
    }, 201);
  }
}

module.exports = new ConsultationsController();
