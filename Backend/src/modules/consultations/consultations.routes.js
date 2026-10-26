const router = require("express").Router();
const consultationsController = require("./consultations.controller");
const { requireAuth, optionalAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");
const { uploadArray } = require("../../middleware/upload.middleware");
const { aesEncryptionService } = require("../../services/aes_encryption");

// Customer Public Routes
router.get("/settings", (req, res) => consultationsController.getConsultationSettings(req, res));
router.get("/astrologers", (req, res) => consultationsController.getActiveAstrologers(req, res));
router.get("/astrologers/:id", (req, res) => consultationsController.getAstrologerDetails(req, res));
router.get("/astrologers/:id/slots", (req, res) => consultationsController.getAvailableSlots(req, res));
router.get("/slots", (req, res) => {
  if (req.query.astrologerId) req.params.id = req.query.astrologerId;
  return consultationsController.getAvailableSlots(req, res);
});
router.get("/services", (req, res) => consultationsController.getServices(req, res));
router.get("/services/:id", (req, res) => consultationsController.getServiceById(req, res));
router.get("/payment-gateways", (req, res) => consultationsController.getPaymentGateways(req, res));
router.post("/webhook", (req, res) => consultationsController.handleWebhook(req, res));

// Customer Authenticated Routes (Reservation, Payment Gating & Bookings)
// Protected with aesEncryptionService.middleware() for sensitive horoscope/notes payloads
router.post("/reserve-slot", requireAuth, aesEncryptionService.middleware(), (req, res) => consultationsController.reserveSlot(req, res));
router.post("/verify-payment", optionalAuth, (req, res) => consultationsController.verifyPayment(req, res));
router.post("/cancel-hold", requireAuth, (req, res) => consultationsController.cancelHold(req, res));
router.post("/book", requireAuth, aesEncryptionService.middleware(), (req, res) => consultationsController.bookConsultation(req, res));
router.post("/request-booking", requireAuth, aesEncryptionService.middleware(), (req, res) => consultationsController.requestBooking(req, res));
router.get("/my-bookings", requireAuth, (req, res) => consultationsController.getMyBookings(req, res));
router.post("/my-bookings/:id/initiate-payment", requireAuth, (req, res) => consultationsController.initiateCustomerPayment(req, res));
router.post("/my-bookings/:id/cancel", requireAuth, (req, res) => consultationsController.cancelMyBooking(req, res));

// Admin Consultation Services CRUD
router.get("/admin/services", requireAuth, requireAdmin, (req, res) => consultationsController.getAdminServices(req, res));
router.post("/admin/services", requireAuth, requireAdmin, (req, res) => consultationsController.createService(req, res));
router.put("/admin/services/:id", requireAuth, requireAdmin, (req, res) => consultationsController.updateService(req, res));
router.delete("/admin/services/:id", requireAuth, requireAdmin, (req, res) => consultationsController.deleteService(req, res));

// Admin Office & Astrologer Settings
router.get("/admin/settings", requireAuth, requireAdmin, (req, res) => consultationsController.getConsultationSettings(req, res));
router.put("/admin/settings", requireAuth, requireAdmin, (req, res) => consultationsController.updateConsultationSettings(req, res));
router.post("/admin/upload-photo", requireAuth, requireAdmin, uploadArray("photo", 1), (req, res) => consultationsController.uploadPhoto(req, res));
router.get("/admin/astrologers", requireAuth, requireAdmin, (req, res) => consultationsController.getAllAstrologersAdmin(req, res));
router.post("/admin/astrologers", requireAuth, requireAdmin, (req, res) => consultationsController.createAstrologer(req, res));
router.put("/admin/astrologers/:id", requireAuth, requireAdmin, (req, res) => consultationsController.updateAstrologer(req, res));
router.patch("/admin/astrologers/:id/office", requireAuth, requireAdmin, (req, res) => consultationsController.updateOfficeSettings(req, res));

// Admin Bookings Management
router.get("/admin/bookings", requireAuth, requireAdmin, (req, res) => consultationsController.getAdminBookings(req, res));
router.patch("/admin/bookings/:id/accept", requireAuth, requireAdmin, (req, res) => consultationsController.acceptBooking(req, res));
router.patch("/admin/bookings/:id/reject", requireAuth, requireAdmin, (req, res) => consultationsController.rejectBooking(req, res));
router.patch("/admin/bookings/:id/confirm", requireAuth, requireAdmin, (req, res) => consultationsController.confirmBooking(req, res));
router.patch("/admin/bookings/:id/cancel", requireAuth, requireAdmin, (req, res) => consultationsController.cancelBookingAdmin(req, res));
router.post("/admin/bookings/:id/refund", requireAuth, requireAdmin, (req, res) => consultationsController.processRefund(req, res));
router.patch("/admin/bookings/:id/manual-meet", requireAuth, requireAdmin, (req, res) => consultationsController.updateManualMeetLink(req, res));
router.post("/admin/bookings/:id/retry-meet", requireAuth, requireAdmin, (req, res) => consultationsController.retryGoogleMeet(req, res));

module.exports = router;
