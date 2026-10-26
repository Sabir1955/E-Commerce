const crypto = require("crypto");
const Astrologer = require("../../models/Astrologer");
const AstrologerAvailability = require("../../models/AstrologerAvailability");
const AstrologerHoliday = require("../../models/AstrologerHoliday");
const ConsultationBooking = require("../../models/ConsultationBooking");
const ConsultationService = require("../../models/ConsultationService");
const InAppNotificationService = require("../../services/inAppNotification.service");
const GoogleMeetService = require("../../services/googleMeet.service");
const { getRazorpayClient, verifySignature, verifyWebhook } = require("../../config/razorpay");
const { env } = require("../../config/env");
const db = require("../../database/db");
const easebuzzService = require("../../services/easebuzz");
const { BadRequestError, NotFoundError, ConflictError, UnauthorizedError } = require("../../utils/errors");

const HOLD_DURATION_MINUTES = 10;

function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTimeString(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

class ConsultationsService {
  /**
   * Helper: Get current date & time in Asia/Kolkata
   */
  getKolkataNow() {
    const now = new Date();
    const formatterDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const formatterTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    const dateStr = formatterDate.format(now);
    const timeStr = formatterTime.format(now);
    return { dateStr, timeStr, minutes: timeStringToMinutes(timeStr) };
  }

  /**
   * Release any expired slot holds automatically
   */
  async releaseExpiredSlotHolds() {
    try {
      await db.query(`
        UPDATE consultation_bookings
        SET booking_status = 'payment_expired',
            payment_status = 'expired',
            updated_at = NOW()
        WHERE booking_status = 'pending_payment'
          AND slot_hold_expires_at IS NOT NULL
          AND slot_hold_expires_at < NOW()
      `);
    } catch (err) {
      console.warn("[SlotHolds] Error cleaning up expired holds:", err.message);
    }
  }

  /**
   * Get all active astrologers for customer browsing (filters to active only)
   */
  async getActiveAstrologers() {
    const query = `
      SELECT * FROM astrologers
      WHERE active = TRUE
      ORDER BY display_order ASC, rating DESC
    `;
    const res = await db.query(query);
    return res.rows.map(row => Astrologer.fromRow(row));
  }

  /**
   * Get all astrologers for admin management
   */
  async getAllAstrologersAdmin() {
    const res = await db.query(`SELECT * FROM astrologers ORDER BY display_order ASC, created_at ASC`);
    return res.rows.map(row => Astrologer.fromRow(row));
  }

  /**
   * Create an astrologer (admin)
   */
  async createAstrologer(data) {
    const id = data.id || `astro_${Date.now()}`;
    const res = await db.query(
      `INSERT INTO astrologers (
        id, name, email, phone, photo_url, experience_years, rating, review_count,
        specialties, languages, bio, allowed_durations, duration_pricing, active,
        display_order, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      RETURNING *`,
      [
        id,
        data.name,
        data.email || null,
        data.phone || null,
        data.photoUrl || null,
        data.experienceYears || 5,
        data.rating || 4.9,
        data.reviewCount || 0,
        JSON.stringify(data.specialties || []),
        JSON.stringify(data.languages || []),
        data.bio || null,
        JSON.stringify(data.allowedDurations || [15, 30, 60]),
        JSON.stringify(data.durationPricing || {}),
        data.active !== undefined ? Boolean(data.active) : true,
        data.displayOrder || 0
      ]
    );
    return Astrologer.fromRow(res.rows[0]);
  }

  /**
   * Update an astrologer (admin)
   */
  async updateAstrologer(id, data) {
    const existing = await Astrologer.findById(id);
    if (!existing) throw new NotFoundError("Astrologer not found");

    const res = await db.query(
      `UPDATE astrologers SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        photo_url = COALESCE($4, photo_url),
        experience_years = COALESCE($5, experience_years),
        rating = COALESCE($6, rating),
        bio = COALESCE($7, bio),
        specialties = COALESCE($8, specialties),
        languages = COALESCE($9, languages),
        allowed_durations = COALESCE($10, allowed_durations),
        duration_pricing = COALESCE($11, duration_pricing),
        active = COALESCE($12, active),
        updated_at = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        data.name || null,
        data.email || null,
        data.phone || null,
        data.photoUrl || null,
        data.experienceYears !== undefined ? Number(data.experienceYears) : null,
        data.rating !== undefined ? Number(data.rating) : null,
        data.bio || null,
        data.specialties ? JSON.stringify(data.specialties) : null,
        data.languages ? JSON.stringify(data.languages) : null,
        data.allowedDurations ? JSON.stringify(data.allowedDurations) : null,
        data.durationPricing ? JSON.stringify(data.durationPricing) : null,
        data.active !== undefined ? Boolean(data.active) : null,
        id
      ]
    );
    return Astrologer.fromRow(res.rows[0]);
  }

  /**
   * Get astrologer profile with schedule and office address by ID
   */
  async getAstrologerById(id) {
    const astrologer = await Astrologer.findById(id);
    if (!astrologer) {
      throw new NotFoundError("Astrologer not found");
    }

    const availRes = await db.query(
      `SELECT * FROM astrologer_availability WHERE astrologer_id = $1 ORDER BY day_of_week ASC`,
      [id]
    );

    const servicesRes = await db.query(
      `SELECT * FROM consultation_services WHERE astrologer_id = $1 AND active = TRUE ORDER BY display_order ASC`,
      [id]
    );

    return {
      ...(astrologer.toJSON ? astrologer.toJSON() : astrologer),
      availability: availRes.rows.map(row => AstrologerAvailability.fromRow(row)),
      services: servicesRes.rows.map(row => ConsultationService.fromRow(row))
    };
  }

  /**
   * Get active consultation services for an astrologer
   */
  async getServices(astrologerId, mode) {
    let sql = `SELECT * FROM consultation_services WHERE active = TRUE`;
    const params = [];

    if (astrologerId) {
      params.push(astrologerId);
      sql += ` AND astrologer_id = $${params.length}`;
    }

    if (mode === "online") {
      sql += ` AND allow_online = TRUE`;
    } else if (mode === "offline") {
      sql += ` AND allow_offline = TRUE`;
    }

    sql += ` ORDER BY display_order ASC, created_at ASC`;
    const res = await db.query(sql, params);
    return res.rows.map(row => ConsultationService.fromRow(row));
  }

  /**
   * Get single consultation service by ID
   */
  async getServiceById(id) {
    const service = await ConsultationService.findById(id);
    if (!service) {
      throw new NotFoundError("Consultation service not found");
    }
    return service;
  }

  /**
   * Compute available time slots for an astrologer on a given date and mode
   */
  async getAvailableSlots(astrologerId, dateStr, durationMinutes = 30, mode = "online") {
    durationMinutes = Number(durationMinutes) || 30;
    await this.releaseExpiredSlotHolds();

    const astrologer = await Astrologer.findById(astrologerId);
    if (!astrologer || !astrologer.active) {
      throw new NotFoundError("Active astrologer not found");
    }

    if (mode === "offline" && astrologer.allowOffline === false) {
      return {
        date: dateStr,
        isPast: false,
        isHoliday: false,
        isWeeklyOff: false,
        offlineDisabled: true,
        slots: []
      };
    }

    const kolkata = this.getKolkataNow();
    if (dateStr < kolkata.dateStr) {
      return {
        date: dateStr,
        isPast: true,
        isHoliday: false,
        slots: []
      };
    }

    // Check holiday
    const holidayRes = await db.query(
      `SELECT * FROM astrologer_holidays WHERE astrologer_id = $1 AND holiday_date = $2`,
      [astrologerId, dateStr]
    );
    if (holidayRes.rows.length > 0) {
      return {
        date: dateStr,
        isPast: false,
        isHoliday: true,
        holidayReason: holidayRes.rows[0].reason || "Astrologer is not available on this date",
        slots: []
      };
    }

    // Parse day of week from dateStr (YYYY-MM-DD)
    const dateObj = new Date(`${dateStr}T12:00:00Z`);
    const dayOfWeek = dateObj.getUTCDay();

    const availRes = await db.query(
      `SELECT * FROM astrologer_availability WHERE astrologer_id = $1 AND day_of_week = $2 AND is_active = TRUE`,
      [astrologerId, dayOfWeek]
    );

    if (availRes.rows.length === 0) {
      return {
        date: dateStr,
        isPast: false,
        isHoliday: false,
        isWeeklyOff: true,
        slots: []
      };
    }

    const avail = availRes.rows[0];
    const dayStart = timeStringToMinutes(avail.start_time || "09:00");
    const dayEnd = timeStringToMinutes(avail.end_time || "19:00");
    const breakStart = avail.break_start ? timeStringToMinutes(avail.break_start) : null;
    const breakEnd = avail.break_end ? timeStringToMinutes(avail.break_end) : null;

    // Get existing booked slots or active holds for this day
    const bookingsRes = await db.query(
      `SELECT start_time, end_time, duration_minutes, booking_status, slot_hold_expires_at
       FROM consultation_bookings
       WHERE astrologer_id = $1
         AND scheduled_date = $2
         AND (
           booking_status IN ('pending_admin_approval', 'approved_pending_payment', 'pending_approval', 'confirmed', 'meeting_creation_pending', 'completed')
           OR (booking_status = 'pending_payment' AND (slot_hold_expires_at IS NULL OR slot_hold_expires_at > NOW()))
         )`,
      [astrologerId, dateStr]
    );

    const bookedIntervals = bookingsRes.rows.map(b => ({
      start: timeStringToMinutes(b.start_time),
      end: timeStringToMinutes(b.end_time)
    }));

    const isToday = dateStr === kolkata.dateStr;
    const currentMins = kolkata.minutes;

    const slots = [];
    for (let current = dayStart; current + durationMinutes <= dayEnd; current += durationMinutes) {
      const slotEnd = current + durationMinutes;

      // Check break overlap
      let isBreak = false;
      if (breakStart !== null && breakEnd !== null) {
        if (current < breakEnd && slotEnd > breakStart) {
          isBreak = true;
        }
      }

      // Check booking / hold overlap
      let isBooked = false;
      for (const b of bookedIntervals) {
        if (current < b.end && slotEnd > b.start) {
          isBooked = true;
          break;
        }
      }

      // Check past time if today
      let isPastSlot = false;
      if (isToday && current <= currentMins + 15) {
        isPastSlot = true;
      }

      const isAvailable = !isBreak && !isBooked && !isPastSlot;

      slots.push({
        startTime: minutesToTimeString(current),
        endTime: minutesToTimeString(slotEnd),
        durationMinutes,
        isAvailable,
        reason: isBooked ? "Booked / Reserved" : isBreak ? "Lunch / Break" : isPastSlot ? "Time Passed" : "Available"
      });
    }

    return {
      date: dateStr,
      dayOfWeek,
      isPast: false,
      isHoliday: false,
      slots
    };
  }

  /**
   * Get all available and configured payment gateways for consultation booking
   */
  getAvailablePaymentGateways() {
    const razorpayKey = env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";
    const easebuzzCreds = easebuzzService.getCredentials();
    const hasEasebuzz = Boolean(easebuzzCreds.key && easebuzzCreds.salt) || (easebuzzCreds.env || "").toLowerCase().includes("test");

    return [
      {
        id: "easebuzz",
        name: "Easebuzz Payment Gateway",
        description: "Fast & secure payment via UPI, Credit / Debit Cards, NetBanking, or QR code",
        badge: "⚡ Fast & Secure",
        icon: "💳",
        isConfigured: hasEasebuzz,
        methods: ["Instant UPI", "Cards", "NetBanking", "QR Code"]
      }
    ];
  }

  /**
   * Helper: Create Razorpay Order or simulated gateway order
   */
  async createGatewayOrder(bookingId, amount, receipt) {
    const keyId = env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";
    const keySecret = env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || "";

    let razorpayOrder = null;
    const amountInPaise = Math.round(Number(amount) * 100);

    if (keyId && keySecret && !keyId.includes("test_astrology") && !keyId.includes("mock")) {
      try {
        const client = getRazorpayClient();
        razorpayOrder = await client.orders.create({
          amount: amountInPaise,
          currency: "INR",
          receipt: receipt.slice(0, 40),
          notes: { bookingId: String(bookingId) }
        });
      } catch (err) {
        console.warn("[Consultations Razorpay] Gateway order creation failed, falling back to simulated order:", err.message);
      }
    }

    if (!razorpayOrder) {
      razorpayOrder = {
        id: `order_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
        entity: "order",
        amount: amountInPaise,
        currency: "INR",
        receipt,
        status: "created"
      };
    }

    return {
      razorpayOrder,
      keyId: keyId || "rzp_test_astrology_store"
    };
  }

  /**
   * Step 1: Reserve Slot and Initiate Payment (Gated Booking)
   * Prevents double-booking by placing a temporary hold during checkout
   */
  async reserveSlotAndInitiatePayment(user, body) {
    await this.releaseExpiredSlotHolds();

    const astrologerId = body.astrologerId;
    const serviceId = body.serviceId;
    const scheduledDate = body.scheduledDate || body.bookingDate || body.date;
    const startTime = body.startTime;
    const durationMinutes = Number(body.durationMinutes || body.duration) || 30;
    const consultationMode = (body.consultationMode || body.mode || "online").toLowerCase();
    const customerNotes = body.customerNotes || body.topicNotes || body.notes || "";
    const birthDetails = body.birthDetails || {};

    if (!astrologerId || !scheduledDate || !startTime) {
      throw new BadRequestError("astrologerId, scheduledDate, and startTime are required");
    }

    if (!["online", "offline"].includes(consultationMode)) {
      throw new BadRequestError("consultationMode must be either 'online' or 'offline'");
    }

    const astrologer = await Astrologer.findById(astrologerId);
    if (!astrologer || !astrologer.active) {
      throw new NotFoundError("Selected astrologer is currently unavailable");
    }

    if (consultationMode === "offline" && astrologer.allowOffline === false) {
      throw new ConflictError("In-person offline consultations are not enabled for this astrologer");
    }

    // Determine service & fee
    let service = null;
    let serviceName = "Vedic Astrology Consultation";
    let fee = 899;

    if (serviceId) {
      service = await ConsultationService.findById(serviceId);
      if (!service || !service.active) {
        throw new NotFoundError("Selected consultation service is not active");
      }
      if (consultationMode === "online" && !service.allowOnline) {
        throw new ConflictError("This service is not available for Online Consultation");
      }
      if (consultationMode === "offline" && !service.allowOffline) {
        throw new ConflictError("This service is not available for Offline Office Visit");
      }

      serviceName = service.name;

      // Calculate price based on mode & duration
      const pricingObj = service.durationPricing || {};
      const modePricing = pricingObj[consultationMode] || pricingObj;
      if (modePricing && (modePricing[durationMinutes] || modePricing[String(durationMinutes)])) {
        fee = Number(modePricing[durationMinutes] || modePricing[String(durationMinutes)]);
      } else {
        fee = consultationMode === "offline" ? Number(service.offlineFee) : Number(service.onlineFee);
      }
    } else {
      // Fallback to astrologer direct pricing if no specific service picked
      const durPricing = astrologer.durationPricing || {};
      const modePricing = durPricing[consultationMode] || durPricing;
      fee = Number(modePricing[durationMinutes] || modePricing[String(durationMinutes)]) || (consultationMode === "offline" ? 1199 : 899);
    }

    const startMins = timeStringToMinutes(startTime);
    const endMins = startMins + durationMinutes;
    const endTime = minutesToTimeString(endMins);

    const startIso = `${scheduledDate}T${startTime}:00+05:30`;
    const endIso = `${scheduledDate}T${endTime}:00+05:30`;

    // Office details for offline visit
    const fullOfficeAddress = astrologer.officeAddress
      ? `${astrologer.officeName || astrologer.name}\n${astrologer.officeAddress}, ${astrologer.officeCity}, ${astrologer.officeState} ${astrologer.officePincode || ''}`
      : "Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri, Patna, Bihar 800001";
    const officeMapsUrl = astrologer.officeMapsUrl || "https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001";

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // Concurrency check inside transaction with table lock
      const collisionRes = await client.query(
        `SELECT id, booking_number, booking_status, slot_hold_expires_at
         FROM consultation_bookings
         WHERE astrologer_id = $1
           AND scheduled_date = $2
           AND (
             booking_status IN ('confirmed', 'meeting_creation_pending', 'completed')
             OR (booking_status = 'pending_payment' AND slot_hold_expires_at > NOW())
           )
           AND (start_time < $4 AND end_time > $3)
         FOR UPDATE`,
        [astrologerId, scheduledDate, startTime, endTime]
      );

      if (collisionRes.rows.length > 0) {
        throw new ConflictError("This time slot has already been reserved or booked by another client. Please select another slot.");
      }

      // Generate booking number: ASTRO-CN-XXXXXX
      const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
      const bookingNumber = `ASTRO-CN-${randomSuffix}`;
      const bookingId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

      // Generate payment gateway order
      const { razorpayOrder, keyId } = await this.createGatewayOrder(bookingId, fee, bookingNumber);

      const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MINUTES * 60 * 1000);

      const notesPayload = typeof birthDetails === "object" && Object.keys(birthDetails).length > 0
        ? `Birth Details: ${JSON.stringify(birthDetails)}\nNotes: ${customerNotes}`
        : customerNotes;

      const insertRes = await client.query(
        `INSERT INTO consultation_bookings (
          id, booking_number, customer_id, astrologer_id, service_id, service_name,
          consultation_mode, office_address, office_maps_url, scheduled_date,
          start_time, end_time, duration_minutes, start_timestamp, end_timestamp,
          fee, payment_status, booking_status, slot_hold_expires_at,
          payment_gateway_order_id, customer_notes, google_meet_status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, 'pending', 'pending_payment', $17,
          $18, $19, 'pending', NOW(), NOW()
        ) RETURNING *`,
        [
          bookingId,
          bookingNumber,
          user._id || user.id,
          astrologerId,
          serviceId || null,
          serviceName,
          consultationMode,
          consultationMode === "offline" ? fullOfficeAddress : null,
          consultationMode === "offline" ? officeMapsUrl : null,
          scheduledDate,
          startTime,
          endTime,
          durationMinutes,
          startIso,
          endIso,
          fee,
          holdExpiresAt,
          razorpayOrder.id,
          notesPayload
        ]
      );

      // Record pending payment in payments table
      const paymentRecordId = `pay_rec_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      await client.query(
        `INSERT INTO payments (
          id, booking_id, user_id, amount, status, provider,
          gateway_order_id, method, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'pending', 'razorpay', $5, 'online', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        [paymentRecordId, bookingId, user._id || user.id, fee, razorpayOrder.id]
      );

      await client.query("COMMIT");

      const bookingRow = insertRes.rows[0];

      return {
        booking: ConsultationBooking.fromRow(bookingRow),
        bookingId,
        bookingNumber,
        fee,
        consultationMode,
        officeAddress: consultationMode === "offline" ? fullOfficeAddress : null,
        officeMapsUrl: consultationMode === "offline" ? officeMapsUrl : null,
        holdExpiresAt: holdExpiresAt.toISOString(),
        razorpayOrder,
        keyId
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Step 2: Verify Payment & Confirm Consultation Appointment
   * Confirms appointment ONLY after payment signature is verified
   */
  async verifyBookingPayment(user, body) {
    const bookingId = body?.bookingId;
    const isEasebuzz = (body?.gateway === "easebuzz") || Boolean(body?.txnid || body?.easepayid);
    let razorpayOrderId = body?.razorpayOrderId || body?.razorpay_order_id || body?.orderId || "";
    let transactionId = body?.transactionId || body?.razorpayPaymentId || body?.razorpay_payment_id || body?.easepayid || body?.txnid || "";
    let signature = body?.signature || body?.razorpaySignature || body?.razorpay_signature || body?.hash || "";

    if (!bookingId) {
      if (body?.recordId || body?.txnid || body?.gatewayOrderId || body?.orderId || isEasebuzz) {
        const paymentsService = require("../payments/payments.service");
        if (isEasebuzz || body?.hash || body?.status) {
          return await paymentsService.verifyEasebuzzPayment(body);
        }
        return await paymentsService.verifyDirectPayment({
          recordId: body?.recordId,
          orderId: razorpayOrderId,
          paymentId: transactionId,
          signature
        });
      }
      throw new BadRequestError("bookingId is required");
    }

    if (!user) {
      throw new UnauthorizedError("Authentication required to verify consultation booking");
    }

    if (isEasebuzz) {
      transactionId = transactionId || body.txnid || `EBZ_TXN_${Date.now()}`;
      signature = signature || "easebuzz_verified";
      if (body.hash && typeof easebuzzService.verifyResponseHash === "function") {
        const isValid = easebuzzService.verifyResponseHash(body);
        if (!isValid && env.NODE_ENV === "production") {
          throw new BadRequestError("Invalid Easebuzz payment response hash");
        }
      }
    } else {
      if (!razorpayOrderId || !transactionId || !signature) {
        throw new BadRequestError("bookingId, razorpayOrderId, transactionId, and signature are required");
      }
      if (!verifySignature(razorpayOrderId, transactionId, signature)) {
        throw new BadRequestError("Invalid payment gateway signature");
      }
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const bookingRes = await client.query(
        `SELECT * FROM consultation_bookings WHERE id = $1 FOR UPDATE`,
        [bookingId]
      );

      if (bookingRes.rows.length === 0) {
        throw new NotFoundError("Consultation booking not found");
      }

      const booking = bookingRes.rows[0];

      // Security check: Customer can only verify their own booking
      if (user.role !== "admin" && String(booking.customer_id) !== String(user._id || user.id)) {
        throw new BadRequestError("You are not authorized to verify this booking");
      }

      // Idempotency: If already confirmed, return existing confirmed booking
      if (["confirmed", "meeting_creation_pending", "completed"].includes(booking.booking_status)) {
        await client.query("COMMIT");
        return {
          booking: ConsultationBooking.fromRow(booking),
          alreadyConfirmed: true
        };
      }

      // Check if slot hold expired and another booking took the slot during hold expiration
      const collisionCheck = await client.query(
        `SELECT id FROM consultation_bookings
         WHERE astrologer_id = $1
           AND scheduled_date = $2
           AND id != $3
           AND booking_status IN ('confirmed', 'meeting_creation_pending', 'completed')
           AND (start_time < $5 AND end_time > $4)`,
        [booking.astrologer_id, booking.scheduled_date, booking.id, booking.start_time, booking.end_time]
      );

      if (collisionCheck.rows.length > 0) {
        // Slot collision after hold expiry: mark refund pending and alert admin
        await client.query(
          `UPDATE consultation_bookings SET
             booking_status = 'refund_pending',
             payment_status = 'paid',
             payment_transaction_id = $1,
             payment_signature = $2,
             payment_verified_at = NOW(),
             amount_paid = fee,
             refund_status = 'pending',
             refund_reason = 'Slot collision occurred after reservation hold expired',
             updated_at = NOW()
           WHERE id = $3`,
          [transactionId, signature, bookingId]
        );

        await client.query(
          `UPDATE payments SET
             status = 'paid',
             transaction_id = $1,
             paid_at = NOW(),
             updated_at = NOW()
           WHERE (booking_id = $2 OR gateway_order_id = $3)`,
          [transactionId, bookingId, razorpayOrderId]
        );

        await client.query("COMMIT");

        // Notify customer
        await InAppNotificationService.createNotification({
          userId: user._id || user.id,
          title: "Booking Conflict — Full Refund Queued",
          message: `Your payment for booking #${booking.booking_number} was received, but the reservation expired and the slot was taken. A full refund has been queued and admin will assist you.`,
          type: "consultation",
          link: "/my-consultations"
        }).catch(() => {});

        throw new ConflictError("Your payment was received, but the reservation hold expired and another client booked this slot. Your payment is safe and a full refund has been queued. Please contact support or book another slot.");
      }

      // Mark payment as paid in payments table
      await client.query(
        `UPDATE payments SET
           status = 'paid',
           transaction_id = $1,
           paid_at = NOW(),
           updated_at = NOW()
         WHERE (booking_id = $2 OR gateway_order_id = $3 OR transaction_id = $1)`,
        [transactionId, bookingId, razorpayOrderId]
      );

      // Determine meeting setup based on consultation mode
      let newBookingStatus = "confirmed";
      let meetStatus = "not_applicable";
      let meetLink = null;
      let calendarEventId = null;
      let meetError = null;

      const isOffline = booking.consultation_mode === "offline";

      if (isOffline) {
        // Offline Office Visit: Never create Google Meet link!
        newBookingStatus = "confirmed";
        meetStatus = "not_applicable";
        meetLink = null;
      } else {
        // Online Consultation: Attempt real Google Meet creation
        try {
          const astrologer = await Astrologer.findById(booking.astrologer_id);
          const meetResult = await GoogleMeetService.createMeeting({
            bookingNumber: booking.booking_number,
            astrologerName: astrologer ? astrologer.name : "Astro Poonam Vaish Mam",
            astrologerEmail: astrologer ? astrologer.email : "poonam.vaish@astronirvan.com",
            customerName: user.name || "Astro Client",
            customerEmail: user.email,
            scheduledDate: booking.scheduled_date,
            startTime: booking.start_time,
            endTime: booking.end_time,
            topic: booking.service_name || "Vedic Astrology Consultation"
          });

          if (meetResult && meetResult.meetUrl) {
            newBookingStatus = "confirmed";
            meetStatus = "created";
            meetLink = meetResult.meetUrl;
            calendarEventId = meetResult.calendarEventId || null;
          } else {
            // Pending credentials or manual fallback
            newBookingStatus = "meeting_creation_pending";
            meetStatus = "pending_credentials";
            meetError = meetResult?.reason || "Google Calendar credentials pending configuration";
          }
        } catch (mErr) {
          console.warn("[GoogleMeet] Meeting creation failed during payment verification:", mErr.message);
          newBookingStatus = "meeting_creation_pending";
          meetStatus = "failed";
          meetError = mErr.message;
        }
      }

      const updateRes = await client.query(
        `UPDATE consultation_bookings SET
           booking_status = $1,
           payment_status = 'paid',
           payment_transaction_id = $2,
           payment_signature = $3,
           payment_verified_at = NOW(),
           payment_method = $8,
           amount_paid = fee,
           google_meet_status = $4,
           google_meet_link = $5,
           google_calendar_event_id = $6,
           google_meet_error = $7,
           confirmed_at = NOW(),
           updated_at = NOW()
         WHERE id = $9
         RETURNING *`,
        [
          newBookingStatus,
          transactionId,
          signature,
          meetStatus,
          meetLink,
          calendarEventId,
          meetError,
          isEasebuzz ? 'easebuzz' : 'razorpay',
          bookingId
        ]
      );

      await client.query("COMMIT");

      const confirmedBooking = updateRes.rows[0];

      // Send In-App Notifications
      if (isOffline) {
        await InAppNotificationService.createNotification({
          userId: user._id || user.id,
          title: "Confirmed — Offline Office Visit",
          message: `Your in-person consultation #${booking.booking_number} is confirmed for ${booking.scheduled_date} at ${booking.start_time}. Address: ${booking.office_address || 'Patna Office'}.`,
          type: "consultation",
          link: "/my-consultations",
          metadata: { bookingId, mode: "offline" }
        }).catch(() => {});
      } else {
        const notifTitle = meetStatus === "created"
          ? "Confirmed — Online Google Meet"
          : "Payment Confirmed — Meeting Setup Pending";
        const notifMsg = meetStatus === "created"
          ? `Your online consultation #${booking.booking_number} is confirmed for ${booking.scheduled_date} at ${booking.start_time}. Join link is ready in your account.`
          : `Your payment for consultation #${booking.booking_number} was successful. Our administrator will verify and attach your Google Meet link shortly.`;

        await InAppNotificationService.createNotification({
          userId: user._id || user.id,
          title: notifTitle,
          message: notifMsg,
          type: "consultation",
          link: "/my-consultations",
          metadata: { bookingId, mode: "online" }
        }).catch(() => {});
      }

      return {
        booking: ConsultationBooking.fromRow(confirmedBooking),
        alreadyConfirmed: false
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel slot hold when customer dismisses checkout modal or explicitly cancels
   */
  async cancelSlotHold(user, bookingId, reason) {
    const filter = user.role === "admin"
      ? `id = $1`
      : `id = $1 AND customer_id = $2`;
    const params = user.role === "admin" ? [bookingId] : [bookingId, user._id || user.id];

    const res = await db.query(
      `UPDATE consultation_bookings SET
         booking_status = 'cancelled',
         payment_status = 'failed',
         cancellation_reason = $${params.length + 1},
         updated_at = NOW()
       WHERE ${filter} AND booking_status = 'pending_payment'
       RETURNING *`,
      [...params, reason || "Checkout window closed or payment cancelled by client"]
    );

    return res.rows.length > 0;
  }

  /**
   * Idempotent payment webhook handler (Razorpay)
   */
  async handlePaymentWebhook(rawBody, signature, event) {
    if (!verifyWebhook(rawBody, signature)) {
      throw new BadRequestError("Invalid webhook signature");
    }

    if (event.event === "payment.captured" || event.event === "order.paid") {
      const entity = event.payload?.payment?.entity;
      const razorpayOrderId = entity?.order_id;
      const transactionId = entity?.id;

      if (!razorpayOrderId) return { received: true };

      const bookingRes = await db.query(
        `SELECT id, customer_id FROM consultation_bookings WHERE payment_gateway_order_id = $1`,
        [razorpayOrderId]
      );

      if (bookingRes.rows.length > 0) {
        const booking = bookingRes.rows[0];
        try {
          await this.verifyBookingPayment(
            { id: booking.customer_id, role: "customer" },
            {
              bookingId: booking.id,
              razorpayOrderId,
              transactionId,
              signature: "webhook_verified"
            }
          );
        } catch (e) {
          console.warn("[Webhook] Booking verify caught:", e.message);
        }
      }
    }

    return { received: true };
  }

  /**
   * Get customer consultation bookings
   */
  async getCustomerBookings(userId) {
    await this.releaseExpiredSlotHolds();

    const query = `
      SELECT b.*,
             a.name as astrologer_name,
             a.photo_url as astrologer_photo,
             a.specialties as astrologer_specialties,
             a.office_address as current_office_address,
             a.office_maps_url as current_office_maps_url
      FROM consultation_bookings b
      LEFT JOIN astrologers a ON b.astrologer_id = a.id
      WHERE b.customer_id = $1
      ORDER BY b.created_at DESC, b.scheduled_date DESC
    `;
    const res = await db.query(query, [userId]);
    return res.rows.map(row => ({
      ...ConsultationBooking.fromRow(row),
      astrologerName: row.astrologer_name,
      astrologerPhoto: row.astrologer_photo,
      astrologerSpecialties: row.astrologer_specialties,
      effectiveOfficeAddress: row.office_address || row.current_office_address,
      effectiveOfficeMapsUrl: row.office_maps_url || row.current_office_maps_url
    }));
  }

  /**
   * Cancel booking by customer
   */
  async cancelBookingByCustomer(bookingId, userId, reason) {
    const booking = await ConsultationBooking.findById(bookingId);
    if (!booking) {
      throw new NotFoundError("Booking not found");
    }

    if (String(booking.customerId) !== String(userId)) {
      throw new BadRequestError("You are not authorized to cancel this booking");
    }

    if (["completed", "cancelled"].includes(booking.bookingStatus)) {
      throw new ConflictError(`Cannot cancel a booking that is already ${booking.bookingStatus}`);
    }

    const wasPaid = booking.paymentStatus === "paid";
    const newBookingStatus = wasPaid ? "refund_pending" : "cancelled";
    const refundStatus = wasPaid ? "pending" : null;

    const res = await db.query(
      `UPDATE consultation_bookings SET
         booking_status = $1,
         refund_status = $2,
         cancellation_reason = $3,
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newBookingStatus, refundStatus, reason || "Cancelled by client", bookingId]
    );

    return ConsultationBooking.fromRow(res.rows[0]);
  }

  /**
   * Customer submits consultation booking request
   * Status: 'pending_admin_approval'
   * Durations: 30, 45, 60, or 90 minutes
   */
  async createBookingRequest(user, body) {
    if (!user) {
      throw new BadRequestError("You must be logged in to book a consultation");
    }

    const astrologerId = body.astrologerId || "astro_poonam_vaish_mam";
    const serviceId = body.serviceId || null;
    const scheduledDate = body.scheduledDate || body.bookingDate || body.date;
    const startTime = body.startTime;
    const durationMinutes = Number(body.durationMinutes || body.duration) || 30;
    const consultationMode = (body.consultationMode || body.mode || "online").toLowerCase();
    const customerNotes = body.customerNotes || body.topicNotes || body.notes || "";
    const birthDetails = body.birthDetails || {};

    if (!scheduledDate || !startTime) {
      throw new BadRequestError("scheduledDate and startTime are required");
    }

    if (![30, 45, 60, 90].includes(durationMinutes)) {
      throw new BadRequestError("Duration must be 30, 45, 60, or 90 minutes");
    }

    if (!["online", "offline"].includes(consultationMode)) {
      throw new BadRequestError("consultationMode must be either 'online' or 'offline'");
    }

    const astrologer = await Astrologer.findById(astrologerId);
    if (!astrologer || !astrologer.active) {
      throw new NotFoundError("Selected astrologer is currently unavailable");
    }

    const startMins = timeStringToMinutes(startTime);
    const endMins = startMins + durationMinutes;
    const endTime = minutesToTimeString(endMins);

    const startIso = `${scheduledDate}T${startTime}:00+05:30`;
    const endIso = `${scheduledDate}T${endTime}:00+05:30`;

    // Office details for offline visit
    let fullOfficeAddress = "";
    if (astrologer.officeAddress) {
      const parts = [
        astrologer.officeAddress,
        astrologer.officeCity,
        astrologer.officeState ? `${astrologer.officeState} ${astrologer.officePincode || ''}`.trim() : astrologer.officePincode
      ].filter(Boolean).join(", ");
      fullOfficeAddress = `${astrologer.officeName || astrologer.name}\n${parts}`;
    } else {
      fullOfficeAddress = "Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri, Patna, Bihar 800001";
    }

    let officeMapsUrl = astrologer.officeMapsUrl;
    if (!officeMapsUrl && fullOfficeAddress) {
      officeMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullOfficeAddress.replace(/\n/g, ', '))}`;
    }
    if (!officeMapsUrl) {
      officeMapsUrl = "https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001";
    }

    let serviceName = astrologer.consultationTitle || "Vedic Astrology Consultation";
    if (serviceId) {
      const srv = await ConsultationService.findById(serviceId);
      if (srv) serviceName = srv.name;
    }

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      // Concurrency check with table lock to prevent double booking
      const collisionRes = await client.query(
        `SELECT id, booking_number, booking_status
         FROM consultation_bookings
         WHERE astrologer_id = $1
           AND scheduled_date = $2
           AND booking_status IN ('pending_admin_approval', 'approved_pending_payment', 'pending_approval', 'pending_payment', 'confirmed', 'meeting_creation_pending', 'completed')
           AND (start_time < $4 AND end_time > $3)
         FOR UPDATE`,
        [astrologerId, scheduledDate, startTime, endTime]
      );

      if (collisionRes.rows.length > 0) {
        throw new ConflictError("This time slot has already been reserved or booked by another client. Please select another slot.");
      }

      const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
      const bookingNumber = `ASTRO-CN-${randomSuffix}`;
      const bookingId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

      const notesPayload = typeof birthDetails === "object" && Object.keys(birthDetails).length > 0
        ? `Birth Details: ${JSON.stringify(birthDetails)}\nNotes: ${customerNotes}`
        : customerNotes;

      const insertRes = await client.query(
        `INSERT INTO consultation_bookings (
          id, booking_number, customer_id, astrologer_id, service_id, service_name,
          consultation_mode, office_address, office_maps_url, scheduled_date,
          start_time, end_time, duration_minutes, start_timestamp, end_timestamp,
          fee, payment_status, booking_status, customer_notes, google_meet_status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, 'pending', 'pending_admin_approval', $17, 'pending', NOW(), NOW()
        ) RETURNING *`,
        [
          bookingId,
          bookingNumber,
          user._id || user.id,
          astrologerId,
          serviceId || null,
          serviceName,
          consultationMode,
          consultationMode === "offline" ? fullOfficeAddress : null,
          consultationMode === "offline" ? officeMapsUrl : null,
          scheduledDate,
          startTime,
          endTime,
          durationMinutes,
          startIso,
          endIso,
          0,
          notesPayload
        ]
      );

      await client.query("COMMIT");

      // Notify customer
      await InAppNotificationService.createNotification({
        userId: user._id || user.id,
        title: "Consultation Request Submitted",
        message: `Your booking request #${bookingNumber} (${consultationMode.toUpperCase()}) for ${scheduledDate} at ${startTime} has been saved with status Pending Admin Approval.`,
        type: "consultation",
        link: "/my-consultations",
        metadata: { bookingId, bookingNumber }
      }).catch(() => {});

      // Notify admin(s) in existing Consultations & Meet section
      try {
        const adminRes = await db.query(`SELECT id FROM users WHERE role = 'admin'`);
        for (const adminRow of adminRes.rows) {
          await InAppNotificationService.createNotification({
            userId: adminRow.id,
            title: "New Consultation Booking Request",
            message: `New ${consultationMode === "offline" ? "Offline (Patna Office)" : "Online (Google Meet)"} consultation #${bookingNumber} requested by ${user.name || "Customer"} for ${scheduledDate} at ${startTime}. Awaiting your approval in Consultations & Meet.`,
            type: "consultation",
            link: "/admin/consultations",
            metadata: { bookingId, bookingNumber, consultationMode }
          }).catch(() => {});
        }
      } catch (adminNotifErr) {
        console.warn("[Consultations] Failed to send admin notification:", adminNotifErr.message);
      }

      return ConsultationBooking.fromRow(insertRes.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Book consultation route handler
   */
  async bookConsultation(user, body) {
    return this.createBookingRequest(user, body);
  }

  /**
   * Customer initiates payment for an approved online booking
   */
  async initiatePaymentForBooking(bookingId, user, gateway = "easebuzz") {
    const booking = await ConsultationBooking.findById(bookingId);
    if (!booking) {
      throw new NotFoundError("Consultation booking not found");
    }

    if (user.role !== "admin" && String(booking.customerId) !== String(user._id || user.id)) {
      throw new BadRequestError("You are not authorized to pay for this booking");
    }

    if (booking.bookingStatus !== "approved_pending_payment" && booking.bookingStatus !== "pending_payment") {
      throw new BadRequestError(`Cannot initiate payment for a booking with status ${booking.bookingStatus}`);
    }

    const fee = Number(booking.fee);
    if (!fee || fee <= 0) {
      throw new BadRequestError("Consultation fee has not been set by administrator yet");
    }

    // Always use Easebuzz payment gateway
    const txnid = `EBZ_CN_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const custName = (user.name || "Customer").trim();
    const custPhone = (user.mobile || "9876543210").replace(/\D/g, "").slice(-10) || "9876543210";
    const custEmail = (user.email || "customer@example.com").trim();

    const initiateResult = await easebuzzService.initiatePayment({
      txnid,
      amount: fee,
      productinfo: `Consultation Booking #${booking.bookingNumber}`,
      firstname: custName.split(" ")[0] || "Customer",
      phone: custPhone,
      email: custEmail,
      surl: `${process.env.APP_URL || `http://localhost:${env.PORT}`}/api/payments/easebuzz/callback`,
      furl: `${process.env.APP_URL || `http://localhost:${env.PORT}`}/api/payments/easebuzz/callback`
    });

    await db.query(
      `UPDATE consultation_bookings SET payment_gateway_order_id = $1, payment_method = 'easebuzz', updated_at = NOW() WHERE id = $2`,
      [initiateResult.accessKey || txnid, booking.id]
    );

    const paymentRecordId = `pay_rec_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    await db.query(
      `INSERT INTO payments (
        id, booking_id, user_id, amount, status, provider,
        gateway_order_id, transaction_id, method, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'pending', 'easebuzz', $5, $6, 'easebuzz', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING`,
      [paymentRecordId, booking.id, booking.customerId, fee, initiateResult.accessKey || txnid, txnid]
    );

    return {
      booking: ConsultationBooking.fromRow(booking),
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      fee,
      gateway: "easebuzz",
      recordId: paymentRecordId,
      txnid,
      accessKey: initiateResult.accessKey,
      keyId: initiateResult.key || "2PBP7IABZ2",
      payUrl: initiateResult.payUrl,
      simulated: Boolean(initiateResult.simulated)
    };
  }

  // ================= ADMIN METHODS =================

  /**
   * Get all bookings for admin dashboard with filters
   */
  async getAdminBookings(filters = {}) {
    await this.releaseExpiredSlotHolds();

    const { status, mode, date, astrologerId, search, limit = 100, offset = 0 } = filters;
    let sql = `
      SELECT b.*,
             u.name as customer_name,
             u.email as customer_email,
             u.mobile as customer_mobile,
             a.name as astrologer_name
      FROM consultation_bookings b
      LEFT JOIN users u ON b.customer_id = u.id
      LEFT JOIN astrologers a ON b.astrologer_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== "all") {
      params.push(status);
      sql += ` AND b.booking_status = $${params.length}`;
    }

    if (mode && mode !== "all") {
      params.push(mode);
      sql += ` AND b.consultation_mode = $${params.length}`;
    }

    if (date) {
      params.push(date);
      sql += ` AND b.scheduled_date = $${params.length}`;
    }

    if (astrologerId) {
      params.push(astrologerId);
      sql += ` AND b.astrologer_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (b.booking_number ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR b.service_name ILIKE $${params.length})`;
    }

    sql += ` ORDER BY b.created_at DESC, b.scheduled_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));

    const res = await db.query(sql, params);
    const countRes = await db.query(`SELECT COUNT(*) FROM consultation_bookings`);

    return {
      bookings: res.rows.map(r => ({
        ...ConsultationBooking.fromRow(r),
        customerName: r.customer_name,
        customerEmail: r.customer_email,
        customerMobile: r.customer_mobile,
        astrologerName: r.astrologer_name
      })),
      total: Number(countRes.rows[0].count)
    };
  }

  /**
   * Admin accepts a consultation booking
   * Online: Admin sets consultation amount -> status becomes approved_pending_payment
   * Offline: Confirmed directly without online payment -> status becomes confirmed
   */
  async acceptBookingAdmin(bookingId, adminUser, body = {}) {
    const booking = await ConsultationBooking.findById(bookingId);
    if (!booking) {
      throw new NotFoundError("Consultation booking not found");
    }

    const adminId = adminUser ? (adminUser._id || adminUser.id || null) : null;

    if (booking.consultationMode === "online") {
      const amount = Number(body.amount);
      if (!amount || amount <= 0) {
        throw new BadRequestError("Please specify a valid consultation amount (greater than 0) when accepting an online booking");
      }

      const pendingOrderId = `EBZ_CN_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

      const res = await db.query(
        `UPDATE consultation_bookings SET
           fee = $1,
           booking_status = 'approved_pending_payment',
           payment_status = 'pending',
           payment_gateway_order_id = $2,
           payment_method = 'easebuzz',
           astrologer_notes = COALESCE($3, astrologer_notes),
           accepted_at = NOW(),
           accepted_by = $4,
           updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [amount, pendingOrderId, body.adminNotes || null, adminId, bookingId]
      );

      // Record pending payment in payments table
      const paymentRecordId = `pay_rec_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      await db.query(
        `INSERT INTO payments (
          id, booking_id, user_id, amount, status, provider,
          gateway_order_id, method, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'pending', 'easebuzz', $5, 'easebuzz', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        [paymentRecordId, bookingId, booking.customerId, amount, pendingOrderId]
      );

      const updated = res.rows[0];

      await InAppNotificationService.createNotification({
        userId: booking.customerId,
        title: "Consultation Approved — Payment Pending",
        message: `Your online consultation #${booking.bookingNumber} has been accepted! Consultation fee: ₹${amount}. Please proceed to payment in My Consultations.`,
        type: "consultation",
        link: "/my-consultations",
        metadata: { bookingId, amount }
      }).catch(() => {});

      return ConsultationBooking.fromRow(updated);
    } else {
      // Offline mode: Confirmed without online payment
      const res = await db.query(
        `UPDATE consultation_bookings SET
           booking_status = 'confirmed',
           payment_status = 'not_required',
           astrologer_notes = COALESCE($1, astrologer_notes),
           confirmed_at = NOW(),
           confirmed_by = $2,
           accepted_at = NOW(),
           accepted_by = $2,
           updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [body.adminNotes || null, adminId, bookingId]
      );

      const updated = res.rows[0];

      await InAppNotificationService.createNotification({
        userId: booking.customerId,
        title: "In-Person Consultation Confirmed!",
        message: `Your offline consultation #${booking.bookingNumber} is confirmed for ${booking.scheduledDate} at ${booking.startTime} at Patna Office. No online payment required!`,
        type: "consultation",
        link: "/my-consultations",
        metadata: { bookingId, mode: "offline" }
      }).catch(() => {});

      return ConsultationBooking.fromRow(updated);
    }
  }

  /**
   * Admin rejects a consultation booking
   * Releases slot so it becomes available again for others
   */
  async rejectBookingAdmin(bookingId, adminUser, reason) {
    if (!reason || !reason.trim()) {
      throw new BadRequestError("A rejection reason is required");
    }

    const booking = await ConsultationBooking.findById(bookingId);
    if (!booking) {
      throw new NotFoundError("Consultation booking not found");
    }

    const wasPaid = booking.paymentStatus === "paid";
    const targetStatus = wasPaid ? "refund_pending" : "rejected";
    const refundStatus = wasPaid ? "pending" : null;

    const res = await db.query(
      `UPDATE consultation_bookings SET
         booking_status = $1,
         refund_status = $2,
         rejection_reason = $3,
         cancellation_reason = $3,
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [targetStatus, refundStatus, reason.trim(), bookingId]
    );

    const updated = res.rows[0];

    // Releases slot immediately since 'rejected' is excluded from active slot bookings query
    const message = wasPaid
      ? `Your consultation request #${updated.booking_number} was rejected: "${reason.trim()}". A full refund of ₹${updated.fee} is queued. You must book another appointment.`
      : `Your consultation request #${updated.booking_number} was rejected: "${reason.trim()}". The requested time slot is unavailable and has been released. You must book another appointment.`;

    await InAppNotificationService.createNotification({
      userId: updated.customer_id,
      title: "Consultation Request Rejected",
      message,
      type: "consultation",
      link: "/my-consultations"
    }).catch(() => {});

    return ConsultationBooking.fromRow(updated);
  }

  /**
   * Admin confirms a booking
   */
  async confirmBookingAdmin(bookingId, adminUser, adminNotes) {
    return this.acceptBookingAdmin(bookingId, adminUser, { adminNotes });
  }

  /**
   * Admin cancels/rejects a booking
   */
  async cancelBookingAdmin(bookingId, adminUser, reason) {
    return this.rejectBookingAdmin(bookingId, adminUser, reason);
  }

  /**
   * Admin processes refund
   */
  async processRefundAdmin(bookingId, adminUser, reason) {
    const booking = await ConsultationBooking.findById(bookingId);
    if (!booking) throw new NotFoundError("Booking not found");

    const refundTxnId = `ref_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const refundAmount = Number(booking.amountPaid || booking.fee || 0);

    const res = await db.query(
      `UPDATE consultation_bookings SET
         booking_status = 'refunded',
         payment_status = 'refunded',
         refund_status = 'completed',
         refund_amount = $1,
         refund_reason = $2,
         refund_transaction_id = $3,
         refunded_at = NOW(),
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [refundAmount, reason || "Refund approved by admin", refundTxnId, bookingId]
    );

    const updated = res.rows[0];

    await InAppNotificationService.createNotification({
      userId: updated.customer_id,
      title: "Refund Processed",
      message: `A full refund of ₹${refundAmount} for consultation #${updated.booking_number} has been processed (Ref: ${refundTxnId}).`,
      type: "consultation",
      link: "/my-consultations"
    }).catch(() => {});

    return ConsultationBooking.fromRow(updated);
  }

  /**
   * Admin sets manual Google Meet link
   */
  async updateManualMeetLink(bookingId, meetUrl, adminNotes) {
    if (!meetUrl || !meetUrl.trim()) {
      throw new BadRequestError("Google Meet URL is required");
    }

    const res = await db.query(
      `UPDATE consultation_bookings SET
         google_meet_link = $1,
         google_meet_status = 'created',
         google_meet_error = NULL,
         booking_status = 'confirmed',
         astrologer_notes = COALESCE($2, astrologer_notes),
         updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [meetUrl.trim(), adminNotes || null, bookingId]
    );

    const updated = res.rows[0];

    await InAppNotificationService.createNotification({
      userId: updated.customer_id,
      title: "Google Meet Link Updated",
      message: `Your Google Meet link for appointment #${updated.booking_number} is ready.`,
      type: "consultation",
      link: "/my-consultations"
    }).catch(() => {});

    return ConsultationBooking.fromRow(updated);
  }

  /**
   * Admin retries Google Meet creation
   */
  async retryGoogleMeet(bookingId) {
    const booking = await ConsultationBooking.findById(bookingId);
    if (!booking) throw new NotFoundError("Booking not found");

    if (booking.consultationMode === "offline") {
      throw new ConflictError("Offline appointments do not require Google Meet");
    }

    const user = await db.query(`SELECT name, email FROM users WHERE id = $1`, [booking.customerId]);
    const astrologer = await Astrologer.findById(booking.astrologerId);

    const meetResult = await GoogleMeetService.createMeeting({
      bookingNumber: booking.bookingNumber,
      astrologerName: astrologer ? astrologer.name : "Astro Poonam Vaish Mam",
      astrologerEmail: astrologer ? astrologer.email : "poonam.vaish@astronirvan.com",
      customerName: user.rows[0]?.name || "Client",
      customerEmail: user.rows[0]?.email || "client@example.com",
      scheduledDate: booking.scheduledDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      topic: booking.serviceName || "Vedic Astrology Consultation"
    });

    if (meetResult && meetResult.meetUrl) {
      const res = await db.query(
        `UPDATE consultation_bookings SET
           google_meet_link = $1,
           google_meet_status = 'created',
           google_calendar_event_id = $2,
           google_meet_error = NULL,
           booking_status = 'confirmed',
           updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [meetResult.meetUrl, meetResult.calendarEventId || null, bookingId]
      );
      return ConsultationBooking.fromRow(res.rows[0]);
    } else {
      throw new ConflictError(meetResult?.reason || "Could not generate Google Meet. Ensure Google credentials are configured in .env");
    }
  }

  /**
   * Admin Consultation Services CRUD
   */
  async getAdminServices() {
    const res = await db.query(`SELECT * FROM consultation_services ORDER BY display_order ASC, created_at ASC`);
    return res.rows.map(row => ConsultationService.fromRow(row));
  }

  async createService(body) {
    const {
      name,
      category = "Vedic Astrology",
      description = "",
      astrologerId = "astro_poonam_vaish_mam",
      allowOnline = true,
      allowOffline = true,
      onlineFee = 899,
      offlineFee = 1199,
      allowedDurations = [15, 30, 60],
      durationPricing = {},
      displayOrder = 0
    } = body;

    if (!name || !name.trim()) throw new BadRequestError("Service name is required");

    const id = `srv_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const res = await db.query(
      `INSERT INTO consultation_services (
        id, astrologer_id, name, category, description, active,
        allow_online, allow_offline, online_fee, offline_fee,
        allowed_durations, duration_pricing, display_order, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING *`,
      [
        id,
        astrologerId,
        name.trim(),
        category.trim(),
        description.trim(),
        Boolean(allowOnline),
        Boolean(allowOffline),
        Number(onlineFee),
        Number(offlineFee),
        JSON.stringify(allowedDurations),
        JSON.stringify(durationPricing),
        Number(displayOrder)
      ]
    );

    return ConsultationService.fromRow(res.rows[0]);
  }

  async updateService(id, body) {
    const existing = await ConsultationService.findById(id);
    if (!existing) throw new NotFoundError("Service not found");

    const res = await db.query(
      `UPDATE consultation_services SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         description = COALESCE($3, description),
         active = COALESCE($4, active),
         allow_online = COALESCE($5, allow_online),
         allow_offline = COALESCE($6, allow_offline),
         online_fee = COALESCE($7, online_fee),
         offline_fee = COALESCE($8, offline_fee),
         allowed_durations = COALESCE($9, allowed_durations),
         duration_pricing = COALESCE($10, duration_pricing),
         display_order = COALESCE($11, display_order),
         updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        body.name ? body.name.trim() : null,
        body.category ? body.category.trim() : null,
        body.description !== undefined ? body.description.trim() : null,
        body.active !== undefined ? Boolean(body.active) : null,
        body.allowOnline !== undefined ? Boolean(body.allowOnline) : null,
        body.allowOffline !== undefined ? Boolean(body.allowOffline) : null,
        body.onlineFee !== undefined ? Number(body.onlineFee) : null,
        body.offlineFee !== undefined ? Number(body.offlineFee) : null,
        body.allowedDurations ? JSON.stringify(body.allowedDurations) : null,
        body.durationPricing ? JSON.stringify(body.durationPricing) : null,
        body.displayOrder !== undefined ? Number(body.displayOrder) : null,
        id
      ]
    );

    return ConsultationService.fromRow(res.rows[0]);
  }

  async deleteService(id) {
    const res = await db.query(`DELETE FROM consultation_services WHERE id = $1 RETURNING *`, [id]);
    if (res.rows.length === 0) throw new NotFoundError("Service not found");
    return true;
  }

  async updateOfficeSettings(astrologerId, body) {
    const astrologer = await Astrologer.findById(astrologerId);
    if (!astrologer) throw new NotFoundError("Astrologer not found");

    const res = await db.query(
      `UPDATE astrologers SET
         office_name = COALESCE($1, office_name),
         office_address = COALESCE($2, office_address),
         office_city = COALESCE($3, office_city),
         office_state = COALESCE($4, office_state),
         office_pincode = COALESCE($5, office_pincode),
         office_maps_url = COALESCE($6, office_maps_url),
         office_instructions = COALESCE($7, office_instructions),
         allow_online = COALESCE($8, allow_online),
         allow_offline = COALESCE($9, allow_offline),
         venue_title = COALESCE($10, venue_title),
         visiting_hours = COALESCE($11, visiting_hours),
         working_days = COALESCE($12, working_days),
         updated_at = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        body.officeName || null,
        body.officeAddress || null,
        body.officeCity || null,
        body.officeState || null,
        body.officePincode || null,
        body.officeMapsUrl || null,
        body.officeInstructions || null,
        body.allowOnline !== undefined ? Boolean(body.allowOnline) : null,
        body.allowOffline !== undefined ? Boolean(body.allowOffline) : null,
        body.venueTitle || null,
        body.visitingHours || null,
        body.workingDays || null,
        astrologerId
      ]
    );

    return Astrologer.fromRow(res.rows[0]);
  }

  /**
   * Get active astrologer profile & consultation settings
   */
  async getConsultationSettings() {
    let res = await db.query(`
      SELECT * FROM astrologers
      WHERE active = TRUE
      ORDER BY display_order ASC, created_at ASC
      LIMIT 1
    `);

    if (res.rows.length === 0) {
      const anyRes = await db.query(`SELECT * FROM astrologers ORDER BY created_at ASC LIMIT 1`);
      if (anyRes.rows.length > 0) {
        return Astrologer.fromRow(anyRes.rows[0]);
      }

      // Auto-seed default astrologer profile if table is empty
      try {
        const { ensureConsultationsSchema } = require("../../database/ensureConsultationsSchema");
        await ensureConsultationsSchema();
      } catch (seedErr) {
        console.warn("[Consultations] Auto-seed warning:", seedErr.message);
      }

      res = await db.query(`SELECT * FROM astrologers WHERE active = TRUE LIMIT 1`);
      if (res.rows.length > 0) {
        return Astrologer.fromRow(res.rows[0]);
      }
      throw new NotFoundError("Consultation settings not configured");
    }

    return Astrologer.fromRow(res.rows[0]);
  }

  /**
   * Update consultation profile & physical office settings (Admin)
   */
  async updateConsultationSettings(body = {}, astrologerId = null) {
    let targetId = astrologerId;
    if (!targetId) {
      const active = await this.getConsultationSettings().catch(() => null);
      targetId = active ? active.id : "astro_poonam_vaish_mam";
    }

    let mapsUrl = body.officeMapsUrl ? String(body.officeMapsUrl).trim() : null;
    const fullAddress = [
      body.officeAddress,
      body.officeCity,
      body.officeState,
      body.officePincode
    ].filter(Boolean).join(", ");

    if (!mapsUrl && fullAddress) {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
    }

    // Upsert query so updating never fails even if record was missing
    const res = await db.query(
      `INSERT INTO astrologers (
         id, name, photo_url, consultation_title, organization_name, bio,
         venue_title, office_name, office_address, office_city, office_state,
         office_pincode, office_maps_url, visiting_hours, working_days,
         office_instructions, allow_online, allow_offline, active, updated_at
       ) VALUES (
         $18,
         COALESCE($1, 'Astro Poonam Vaish Mam'),
         $2,
         COALESCE($3, 'Senior Vedic Astrologer & Kundali Specialist'),
         COALESCE($4, 'Astro Nirvan'),
         $5,
         COALESCE($6, 'Astro Nirvan Consultation Centre'),
         COALESCE($7, 'Astro Poonam Vaish Mam — Astro Nirvan'),
         COALESCE($8, 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri'),
         COALESCE($9, 'Patna'),
         COALESCE($10, 'Bihar'),
         COALESCE($11, '800001'),
         $12,
         COALESCE($13, '10:00 AM – 06:30 PM (IST) · Monday to Saturday'),
         COALESCE($14, 'Monday to Saturday'),
         $15,
         COALESCE($16, TRUE),
         COALESCE($17, TRUE),
         TRUE,
         NOW()
       )
       ON CONFLICT (id) DO UPDATE SET
         name = COALESCE($1, astrologers.name),
         photo_url = COALESCE($2, astrologers.photo_url),
         consultation_title = COALESCE($3, astrologers.consultation_title),
         organization_name = COALESCE($4, astrologers.organization_name),
         bio = COALESCE($5, astrologers.bio),
         venue_title = COALESCE($6, astrologers.venue_title),
         office_name = COALESCE($7, astrologers.office_name),
         office_address = COALESCE($8, astrologers.office_address),
         office_city = COALESCE($9, astrologers.office_city),
         office_state = COALESCE($10, astrologers.office_state),
         office_pincode = COALESCE($11, astrologers.office_pincode),
         office_maps_url = COALESCE($12, astrologers.office_maps_url),
         visiting_hours = COALESCE($13, astrologers.visiting_hours),
         working_days = COALESCE($14, astrologers.working_days),
         office_instructions = COALESCE($15, astrologers.office_instructions),
         allow_online = COALESCE($16, astrologers.allow_online),
         allow_offline = COALESCE($17, astrologers.allow_offline),
         active = TRUE,
         updated_at = NOW()
       RETURNING *`,
      [
        body.name || null,
        body.photoUrl || null,
        body.consultationTitle || null,
        body.organizationName || null,
        body.bio !== undefined ? body.bio : null,
        body.venueTitle || null,
        body.officeName || null,
        body.officeAddress || null,
        body.officeCity || null,
        body.officeState || null,
        body.officePincode || null,
        mapsUrl,
        body.visitingHours || null,
        body.workingDays || null,
        body.officeInstructions || null,
        body.allowOnline !== undefined ? Boolean(body.allowOnline) : null,
        body.allowOffline !== undefined ? Boolean(body.allowOffline) : null,
        targetId
      ]
    );

    return Astrologer.fromRow(res.rows[0]);
  }
}

module.exports = new ConsultationsService();
