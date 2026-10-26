const { BaseModel } = require("../database/BaseModel");

class ConsultationBooking extends BaseModel {
  static get tableName() {
    return "consultation_bookings";
  }

  static get columnMap() {
    return {
      bookingNumber: "booking_number",
      customerId: "customer_id",
      astrologerId: "astrologer_id",
      serviceId: "service_id",
      serviceName: "service_name",
      consultationMode: "consultation_mode",
      officeAddress: "office_address",
      officeMapsUrl: "office_maps_url",
      scheduledDate: "scheduled_date",
      startTime: "start_time",
      endTime: "end_time",
      durationMinutes: "duration_minutes",
      startTimestamp: "start_timestamp",
      endTimestamp: "end_timestamp",
      slotHoldExpiresAt: "slot_hold_expires_at",
      paymentStatus: "payment_status",
      paymentId: "payment_id",
      paymentGatewayOrderId: "payment_gateway_order_id",
      paymentTransactionId: "payment_transaction_id",
      paymentSignature: "payment_signature",
      paymentVerifiedAt: "payment_verified_at",
      paymentMethod: "payment_method",
      amountPaid: "amount_paid",
      bookingStatus: "booking_status",
      customerNotes: "customer_notes",
      astrologerNotes: "astrologer_notes",
      rejectionReason: "rejection_reason",
      cancellationReason: "cancellation_reason",
      refundStatus: "refund_status",
      refundAmount: "refund_amount",
      refundReason: "refund_reason",
      refundTransactionId: "refund_transaction_id",
      refundedAt: "refunded_at",
      googleCalendarEventId: "google_calendar_event_id",
      googleMeetLink: "google_meet_link",
      googleMeetStatus: "google_meet_status",
      googleMeetError: "google_meet_error",
      confirmedAt: "confirmed_at",
      confirmedBy: "confirmed_by",
      acceptedAt: "accepted_at",
      acceptedBy: "accepted_by",
      fee: "fee"
    };
  }

  static get numericColumns() {
    return new Set(["duration_minutes", "fee", "amount_paid", "refund_amount"]);
  }
}

module.exports = ConsultationBooking;
