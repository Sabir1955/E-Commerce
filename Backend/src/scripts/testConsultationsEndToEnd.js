const axios = require('axios');
const db = require('../database/db');
const crypto = require('crypto');
const { env } = require('../config/env');

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('   ASTRO NIRVAN CONSULTATIONS END-TO-END TEST SUITE  ');
  console.log('====================================================\n');

  try {
    // -----------------------------------------------------------------
    // 1. Authenticate Customer & Admin
    // -----------------------------------------------------------------
    console.log('[Test 1] Authenticating Test Customer & Admin...');

    // Customer login
    let customerToken = '';
    try {
      const custRes = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'ramesh@vedicstore.com',
        password: 'Devotee@12345'
      });
      customerToken = custRes.data.data.token;
    } catch {
      // Fallback: login or register mobile
      const custRes = await axios.post(`${BASE_URL}/auth/login`, {
        mobile: '9876543211',
        password: 'Devotee@12345'
      });
      customerToken = custRes.data.data.token;
    }
    console.log('✓ Customer logged in successfully.');

    // Admin login
    const adminRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'Admin@12345'
    });
    const adminToken = adminRes.data.data.token;
    console.log('✓ Admin logged in successfully.\n');

    const customerHeaders = { Authorization: `Bearer ${customerToken}` };
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // -----------------------------------------------------------------
    // 2. Astrologer Directory (Only Astro Poonam Vaish Mam)
    // -----------------------------------------------------------------
    console.log('[Test 2] Verifying Astrologers Directory...');
    const astrosRes = await axios.get(`${BASE_URL}/consultations/astrologers`);
    const astrologers = astrosRes.data.data;

    console.log(`- Total active astrologers returned: ${astrologers.length}`);
    if (astrologers.length !== 1 || !astrologers[0].name.includes('Poonam Vaish')) {
      throw new Error(`Expected only 1 active astrologer (Astro Poonam Vaish Mam), got: ${JSON.stringify(astrologers.map(a => a.name))}`);
    }
    const poonam = astrologers[0];
    console.log(`✓ Active Astrologer Verified: "${poonam.name}" (ID: ${poonam.id})`);
    console.log(`  Experience: ${poonam.experienceYears} Years | Rating: ${poonam.rating}`);
    console.log(`  Office: ${poonam.officeName || 'Patna Office'}`);
    console.log(`  Office Address: ${poonam.officeAddress}`);
    console.log(`  Google Maps: ${poonam.officeMapsUrl}\n`);

    // -----------------------------------------------------------------
    // 3. Active Consultation Services & Pricing
    // -----------------------------------------------------------------
    console.log('[Test 3] Verifying Active Consultation Services...');
    const servicesRes = await axios.get(`${BASE_URL}/consultations/services?astrologerId=${poonam.id}`);
    const services = servicesRes.data.data;
    console.log(`- Retrieved ${services.length} active consultation services.`);
    services.forEach(s => {
      console.log(`  * ${s.name} | Online: ₹${s.onlineFee} | Offline: ₹${s.offlineFee}`);
    });
    if (services.length === 0) {
      throw new Error('No active consultation services found!');
    }
    const testService = services[0];
    console.log(`✓ Selected Test Service: "${testService.name}"\n`);

    // -----------------------------------------------------------------
    // 4. Checking Auspicious Time Slots (Online vs Offline)
    // -----------------------------------------------------------------
    console.log('[Test 4] Querying Auspicious Slots for Tomorrow...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const onlineSlotsRes = await axios.get(`${BASE_URL}/consultations/astrologers/${poonam.id}/slots?date=${dateStr}&duration=30&mode=online`);
    const onlineSlots = onlineSlotsRes.data.data.slots;
    console.log(`- Online slots returned: ${onlineSlots.length}`);
    const availOnlineSlots = onlineSlots.filter(s => s.isAvailable);
    console.log(`- Available online slots: ${availOnlineSlots.length}`);
    if (availOnlineSlots.length === 0) {
      throw new Error('No available online slots found for tomorrow!');
    }
    const testOnlineSlot = availOnlineSlots[0];
    console.log(`✓ Selected Online Slot: ${testOnlineSlot.startTime} - ${testOnlineSlot.endTime}\n`);

    // -----------------------------------------------------------------
    // 5. Online Booking: Slot Hold & Payment Gating
    // -----------------------------------------------------------------
    console.log('[Test 5] Reserving Slot for Online Consultation (Google Meet)...');
    const reserveOnlineRes = await axios.post(
      `${BASE_URL}/consultations/reserve-slot`,
      {
        astrologerId: poonam.id,
        serviceId: testService.id,
        scheduledDate: dateStr,
        startTime: testOnlineSlot.startTime,
        durationMinutes: 30,
        consultationMode: 'online',
        customerNotes: 'Online Jyotish Kundali Reading and Career Questions'
      },
      { headers: customerHeaders }
    );

    const onlineReservation = reserveOnlineRes.data.data;
    console.log(`✓ Slot reserved successfully! Booking #${onlineReservation.bookingNumber}`);
    console.log(`  Hold Expires At: ${onlineReservation.holdExpiresAt}`);
    console.log(`  Razorpay Order ID: ${onlineReservation.razorpayOrder.id}`);
    console.log(`  Amount: ₹${onlineReservation.razorpayOrder.amount / 100}`);

    // Verify slot is now locked/unavailable for other users
    const slotCheck = await axios.get(`${BASE_URL}/consultations/astrologers/${poonam.id}/slots?date=${dateStr}&duration=30&mode=online`);
    const reCheckedSlot = slotCheck.data.data.slots.find(s => s.startTime === testOnlineSlot.startTime);
    if (reCheckedSlot.isAvailable) {
      throw new Error('Expected slot to be held and unavailable, but it was marked available!');
    }
    console.log(`✓ Concurrency verified: Slot ${testOnlineSlot.startTime} is locked (${reCheckedSlot.reason})\n`);

    // -----------------------------------------------------------------
    // 6. Online Booking: Verify Payment & Allocate Slot
    // -----------------------------------------------------------------
    console.log('[Test 6] Verifying Online Payment & Confirming Appointment...');
    const fakePaymentId = `pay_test_${Date.now()}`;
    const keySecret = env.RAZORPAY_KEY_SECRET || "dummy_secret";
    const signature = crypto
      .createHmac("sha256", keySecret)
      .update(`${onlineReservation.razorpayOrder.id}|${fakePaymentId}`)
      .digest("hex");

    const verifyOnlineRes = await axios.post(
      `${BASE_URL}/consultations/verify-payment`,
      {
        bookingId: onlineReservation.bookingId,
        razorpayOrderId: onlineReservation.razorpayOrder.id,
        transactionId: fakePaymentId,
        signature: signature
      },
      { headers: customerHeaders }
    );

    const confirmedOnline = verifyOnlineRes.data.data.booking;
    console.log(`✓ Online Booking Confirmed!`);
    console.log(`  Booking ID: ${confirmedOnline.id}`);
    console.log(`  Booking Status: ${confirmedOnline.bookingStatus}`);
    console.log(`  Payment Status: ${confirmedOnline.paymentStatus}`);
    console.log(`  Google Meet Link: ${confirmedOnline.googleMeetLink || 'Pending OAuth generation'}`);
    console.log(`  Google Meet Status: ${confirmedOnline.googleMeetStatus}\n`);

    if (confirmedOnline.paymentStatus !== 'paid') {
      throw new Error('Expected paymentStatus to be paid!');
    }

    // -----------------------------------------------------------------
    // 7. Offline Booking: Physical Office Visit (Patna)
    // -----------------------------------------------------------------
    console.log('[Test 7] Reserving Slot for Offline Physical Visit (Patna Office)...');
    const offlineSlotsRes = await axios.get(`${BASE_URL}/consultations/astrologers/${poonam.id}/slots?date=${dateStr}&duration=30&mode=offline`);
    const availOfflineSlots = offlineSlotsRes.data.data.slots.filter(s => s.isAvailable);
    if (availOfflineSlots.length === 0) {
      throw new Error('No available offline slots found for tomorrow!');
    }
    const testOfflineSlot = availOfflineSlots[0];

    const reserveOfflineRes = await axios.post(
      `${BASE_URL}/consultations/reserve-slot`,
      {
        astrologerId: poonam.id,
        serviceId: testService.id,
        scheduledDate: dateStr,
        startTime: testOfflineSlot.startTime,
        durationMinutes: 30,
        consultationMode: 'offline',
        customerNotes: 'Visiting Patna office for in-person Kundali matching'
      },
      { headers: customerHeaders }
    );

    const offlineReservation = reserveOfflineRes.data.data;
    console.log(`✓ Offline Slot Reserved! Booking #${offlineReservation.bookingNumber}`);
    console.log(`  Office Address: ${offlineReservation.officeAddress}`);
    console.log(`  Google Maps: ${offlineReservation.officeMapsUrl}`);
    console.log(`  Amount: ₹${offlineReservation.razorpayOrder.amount / 100}`);

    // Verify payment for offline booking
    const fakeOfflinePayId = `pay_offline_${Date.now()}`;
    const offlineSig = crypto
      .createHmac("sha256", keySecret)
      .update(`${offlineReservation.razorpayOrder.id}|${fakeOfflinePayId}`)
      .digest("hex");

    const verifyOfflineRes = await axios.post(
      `${BASE_URL}/consultations/verify-payment`,
      {
        bookingId: offlineReservation.bookingId,
        razorpayOrderId: offlineReservation.razorpayOrder.id,
        transactionId: fakeOfflinePayId,
        signature: offlineSig
      },
      { headers: customerHeaders }
    );

    const confirmedOffline = verifyOfflineRes.data.data.booking;
    console.log(`✓ Offline Physical Visit Confirmed!`);
    console.log(`  Booking ID: ${confirmedOffline.id}`);
    console.log(`  Booking Status: ${confirmedOffline.bookingStatus}`);
    console.log(`  Consultation Mode: ${confirmedOffline.consultationMode}`);
    console.log(`  Google Meet Link: ${confirmedOffline.googleMeetLink} (Must be null)`);
    console.log(`  Google Meet Status: ${confirmedOffline.googleMeetStatus} (Must be not_applicable)\n`);

    if (confirmedOffline.googleMeetLink) {
      throw new Error('Offline appointment must NEVER have a Google Meet link!');
    }
    if (confirmedOffline.consultationMode !== 'offline') {
      throw new Error('Expected consultationMode to be offline!');
    }

    // -----------------------------------------------------------------
    // 8. Slot Hold Release on Customer Dismiss / Cancel
    // -----------------------------------------------------------------
    console.log('[Test 8] Testing Immediate Hold Release on Cancel/Dismiss...');
    const slot3Res = await axios.get(`${BASE_URL}/consultations/astrologers/${poonam.id}/slots?date=${dateStr}&duration=30&mode=online`);
    const avail3 = slot3Res.data.data.slots.filter(s => s.isAvailable);
    const testSlot3 = avail3[0];

    // Reserve slot
    const res3 = await axios.post(
      `${BASE_URL}/consultations/reserve-slot`,
      {
        astrologerId: poonam.id,
        scheduledDate: dateStr,
        startTime: testSlot3.startTime,
        durationMinutes: 30,
        consultationMode: 'online'
      },
      { headers: customerHeaders }
    );
    const booking3Id = res3.data.data.bookingId;
    console.log(`  Held slot ${testSlot3.startTime} (Booking #${res3.data.data.bookingNumber})`);

    // Immediately cancel hold
    const cancelHoldRes = await axios.post(
      `${BASE_URL}/consultations/cancel-hold`,
      { bookingId: booking3Id, reason: 'Customer closed modal' },
      { headers: customerHeaders }
    );
    console.log(`  Released hold: ${cancelHoldRes.data.data.released}`);

    // Verify slot is now available again immediately
    const checkAfterCancel = await axios.get(`${BASE_URL}/consultations/astrologers/${poonam.id}/slots?date=${dateStr}&duration=30&mode=online`);
    const freedSlot = checkAfterCancel.data.data.slots.find(s => s.startTime === testSlot3.startTime);
    if (!freedSlot.isAvailable) {
      throw new Error('Expected cancelled slot hold to be released and available immediately!');
    }
    console.log(`✓ Slot ${testSlot3.startTime} is now available again immediately!\n`);

    // -----------------------------------------------------------------
    // 9. Customer "My Consultations" Dashboard
    // -----------------------------------------------------------------
    console.log('[Test 9] Fetching Customer "My Consultations"...');
    const myBookingsRes = await axios.get(`${BASE_URL}/consultations/my-bookings`, { headers: customerHeaders });
    const myBookings = myBookingsRes.data.data;
    console.log(`- Total customer bookings: ${myBookings.length}`);
    const foundOnline = myBookings.find(b => b.id === confirmedOnline.id);
    const foundOffline = myBookings.find(b => b.id === confirmedOffline.id);

    if (!foundOnline || !foundOffline) {
      throw new Error('Customer bookings not found in my-bookings list!');
    }
    console.log(`✓ Found online booking #${foundOnline.bookingNumber} (${foundOnline.bookingStatus})`);
    console.log(`✓ Found offline booking #${foundOffline.bookingNumber} (${foundOffline.bookingStatus})\n`);

    // -----------------------------------------------------------------
    // 10. Admin Endpoints: Bookings, Services, Office Settings, Refunds
    // -----------------------------------------------------------------
    console.log('[Test 10] Testing Admin Controls...');

    // Admin Bookings
    const adminBookingsRes = await axios.get(`${BASE_URL}/consultations/admin/bookings`, { headers: adminHeaders });
    console.log(`✓ Admin retrieved ${adminBookingsRes.data.data.bookings.length} bookings.`);

    // Admin Office Settings Update
    const officeUpdateRes = await axios.patch(
      `${BASE_URL}/consultations/admin/astrologers/${poonam.id}/office`,
      {
        officeName: 'Astro Poonam Vaish Mam — Astro Nirvan',
        officeAddress: 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri, Patna, Bihar 800001.',
        officeCity: 'Patna',
        officeState: 'Bihar',
        officePincode: '800001',
        officeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001',
        allowOnline: true,
        allowOffline: true
      },
      { headers: adminHeaders }
    );
    console.log(`✓ Admin updated Patna office settings: ${officeUpdateRes.data.data.officeName}`);

    // Admin Process Refund for test booking
    const refundRes = await axios.post(
      `${BASE_URL}/consultations/admin/bookings/${confirmedOnline.id}/refund`,
      { reason: 'Customer test cancellation' },
      { headers: adminHeaders }
    );
    console.log(`✓ Admin processed refund for booking #${confirmedOnline.bookingNumber}: Status = ${refundRes.data.data.refundStatus}\n`);

    console.log('====================================================');
    console.log('   ALL CONSULTATIONS INTEGRATION TESTS PASSED 100%! ');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Test failed with error:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

runTests();
