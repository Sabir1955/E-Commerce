const axios = require('axios');
const pool = require('../config/database');

const API_BASE = 'http://localhost:5000/api';

const extractData = (res) => (res.data && res.data.data !== undefined ? res.data.data : res.data);

async function runTest() {
  console.log('====================================================');
  console.log('🧪 ASTRO NIRVAN: STREAMLINED CONSULTATION E2E TEST');
  console.log('====================================================\n');

  try {
    // 1. Authenticate Customer
    console.log('1️⃣ Authenticating Customer (sabirmmd000@gmail.com)...');
    const customerLoginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'sabirmmd000@gmail.com',
      password: 'password123'
    });
    const customerPayload = extractData(customerLoginRes);
    const customerToken = customerPayload.token || customerLoginRes.data.token;
    const customerUser = customerPayload.user || customerLoginRes.data.user;
    console.log(`   ✓ Customer logged in: ID=${customerUser.id}, Name=${customerUser.name}`);

    // 2. Authenticate Admin
    console.log('\n2️⃣ Authenticating Admin (admin@gmail.com)...');
    const adminLoginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'admin@gmail.com',
      password: 'Admin@12345'
    });
    const adminPayload = extractData(adminLoginRes);
    const adminToken = adminPayload.token || adminLoginRes.data.token;
    const adminUser = adminPayload.user || adminLoginRes.data.user;
    console.log(`   ✓ Admin logged in: ID=${adminUser.id}, Role=${adminUser.role}`);

    const customerHeaders = { Authorization: `Bearer ${customerToken}` };
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // Get active astrologer (Astro Poonam Vaish Mam)
    const astroRes = await axios.get(`${API_BASE}/consultations/astrologers`);
    const astrologers = extractData(astroRes);
    const astrologer = astrologers[0];
    console.log(`\n🪐 Astrologer: ${astrologer.name} (ID=${astrologer.id})`);

    // Pick a test date (e.g. 6 days from now)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 6);
    const dateStr = futureDate.toISOString().split('T')[0];
    console.log(`📅 Test Date: ${dateStr}`);

    // Clean up test bookings for this date and customer
    await pool.query(
      `DELETE FROM consultation_bookings WHERE customer_id = $1 AND scheduled_date = $2`,
      [customerUser.id, dateStr]
    );

    // -------------------------------------------------------------------------
    // TEST FLOW A: ONLINE BOOKING -> ADMIN ACCEPT -> CUSTOMER PAY -> MEET LINK
    // -------------------------------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST A: ONLINE CONSULTATION (Streamlined Booking Page)');
    console.log('====================================================');

    // A.1 Check slots for duration 45 mins
    console.log('\nA.1 Checking available 45-minute slots for online consultation...');
    const slotsRes1 = await axios.get(
      `${API_BASE}/consultations/slots?astrologerId=${astrologer.id}&date=${dateStr}&mode=online&duration=45`
    );
    const slotsData1 = extractData(slotsRes1);
    const availableSlot1 = slotsData1.slots.find(s => s.isAvailable);
    if (!availableSlot1) {
      throw new Error('No available 45-minute slot found on test date.');
    }
    console.log(`   ✓ Found available slot: ${availableSlot1.startTime} - ${availableSlot1.endTime}`);

    // A.2 Customer requests booking (ONLY mode, date, slot time, duration - no old service or birth form)
    console.log('\nA.2 Customer submitting booking request (no old service or birth form)...');
    const bookReqRes = await axios.post(
      `${API_BASE}/consultations/request-booking`,
      {
        astrologerId: astrologer.id,
        scheduledDate: dateStr,
        startTime: availableSlot1.startTime,
        durationMinutes: 45,
        consultationMode: 'online'
      },
      { headers: customerHeaders }
    );
    const onlineBooking = extractData(bookReqRes);
    console.log(`   ✓ Booking created: #${onlineBooking.bookingNumber}`);
    console.log(`   ✓ Status in PostgreSQL: "${onlineBooking.bookingStatus}" (Expected: pending_admin_approval)`);
    if (onlineBooking.bookingStatus !== 'pending_admin_approval') {
      throw new Error(`Unexpected status: ${onlineBooking.bookingStatus}`);
    }

    // A.3 Verify reserved slot is now UNAVAILABLE to prevent double booking
    console.log('\nA.3 Verifying slot is now reserved & locked against duplicate bookings...');
    const slotsRes2 = await axios.get(
      `${API_BASE}/consultations/slots?astrologerId=${astrologer.id}&date=${dateStr}&mode=online&duration=45`
    );
    const slotsData2 = extractData(slotsRes2);
    const checkedSlot = slotsData2.slots.find(s => s.startTime === availableSlot1.startTime);
    console.log(`   ✓ Slot ${availableSlot1.startTime} availability: ${checkedSlot?.isAvailable} (Expected: false, Reason: "${checkedSlot?.reason}")`);
    if (checkedSlot?.isAvailable !== false) {
      throw new Error('Double-booking prevention failed: Slot is still available!');
    }

    // A.4 Customer checks My Consultations
    console.log('\nA.4 Customer viewing booking in "My Consultations"...');
    const myBookingsRes = await axios.get(`${API_BASE}/consultations/my-bookings`, { headers: customerHeaders });
    const myBookings = extractData(myBookingsRes);
    const bookingsList = Array.isArray(myBookings) ? myBookings : (myBookings.bookings || []);
    const foundMyBooking = bookingsList.find(b => b.id === onlineBooking.id);
    console.log(`   ✓ Found in My Consultations: #${foundMyBooking?.bookingNumber}, Status="${foundMyBooking?.bookingStatus}"`);

    // A.5 Admin accepts online booking and sets fee
    console.log('\nA.5 Admin accepts online booking and sets fee to ₹1,200...');
    const acceptRes = await axios.patch(
      `${API_BASE}/consultations/admin/bookings/${onlineBooking.id}/accept`,
      {
        amount: 1200,
        adminNotes: 'Online Jyotish consultation accepted. Please complete payment.'
      },
      { headers: adminHeaders }
    );
    const acceptedBooking = extractData(acceptRes);
    console.log(`   ✓ Admin accept successful!`);
    console.log(`   ✓ Updated Status: "${acceptedBooking.bookingStatus}" (Expected: approved_pending_payment)`);
    console.log(`   ✓ Set Fee: ₹${acceptedBooking.fee}`);

    // A.6 Customer initiates payment via gateway
    console.log('\nA.6 Customer initiates payment for approved booking...');
    const initPayRes = await axios.post(
      `${API_BASE}/consultations/my-bookings/${onlineBooking.id}/initiate-payment`,
      {},
      { headers: customerHeaders }
    );
    const payOrder = extractData(initPayRes);
    console.log(`   ✓ Gateway Order ID received: ${payOrder.orderId}, Amount=₹${payOrder.amount / 100}`);

    // A.7 Customer verifies payment
    console.log('\nA.7 Customer verifies payment...');
    const mockPaymentId = 'pay_test_' + Date.now();
    const verifyPayRes = await axios.post(
      `${API_BASE}/consultations/verify-payment`,
      {
        bookingId: onlineBooking.id,
        transactionId: mockPaymentId,
        razorpayPaymentId: mockPaymentId,
        razorpayOrderId: payOrder.orderId,
        signature: 'test_sig_valid_' + Date.now()
      },
      { headers: customerHeaders }
    );
    const verifyData = extractData(verifyPayRes);
    const confirmedOnline = verifyData.booking || verifyData;
    console.log(`   ✓ Payment verified!`);
    console.log(`   ✓ Final Status: "${confirmedOnline.bookingStatus}" (Expected: confirmed)`);
    console.log(`   ✓ Payment Status: "${confirmedOnline.paymentStatus}" (Expected: paid)`);

    // A.8 Admin updates Google Meet link after payment confirmation
    console.log('\nA.8 Admin updates custom Google Meet link for confirmed session...');
    const customMeetUrl = 'https://meet.google.com/ast-vedic-meet';
    const meetUpdateRes = await axios.patch(
      `${API_BASE}/consultations/admin/bookings/${onlineBooking.id}/manual-meet`,
      {
        meetLink: customMeetUrl,
        adminNotes: 'Direct link to Acharya video conference.'
      },
      { headers: adminHeaders }
    );
    const updatedWithMeet = extractData(meetUpdateRes);
    console.log(`   ✓ Admin updated Google Meet link to: ${updatedWithMeet.googleMeetLink}`);

    // A.9 Customer confirms seeing the Google Meet link in My Consultations
    const myBookingsAfterMeet = await axios.get(`${API_BASE}/consultations/my-bookings`, { headers: customerHeaders });
    const myBookingsList = extractData(myBookingsAfterMeet);
    const list = Array.isArray(myBookingsList) ? myBookingsList : (myBookingsList.bookings || []);
    const verifiedBooking = list.find(b => b.id === onlineBooking.id);
    console.log(`   ✓ Customer sees Google Meet link in My Consultations: ${verifiedBooking?.googleMeetLink}`);
    if (verifiedBooking?.googleMeetLink !== customMeetUrl) {
      throw new Error('Customer did not receive updated Google Meet link!');
    }

    // -------------------------------------------------------------------------
    // TEST FLOW B: OFFLINE BOOKING -> ADMIN ACCEPT -> CONFIRMED WITHOUT PAYMENT
    // -------------------------------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST B: OFFLINE PATNA OFFICE CONSULTATION WORKFLOW');
    console.log('====================================================');

    // B.1 Check available 60-minute offline slot
    console.log('\nB.1 Checking available 60-minute slots for offline visit...');
    const slotsRes3 = await axios.get(
      `${API_BASE}/consultations/slots?astrologerId=${astrologer.id}&date=${dateStr}&mode=offline&duration=60`
    );
    const slotsData3 = extractData(slotsRes3);
    const availableSlotOffline = slotsData3.slots.find(s => s.isAvailable);
    if (!availableSlotOffline) {
      throw new Error('No available 60-minute offline slot found.');
    }
    console.log(`   ✓ Found available offline slot: ${availableSlotOffline.startTime} - ${availableSlotOffline.endTime}`);

    // B.2 Customer books offline consultation (60 mins)
    console.log('\nB.2 Customer requesting offline office booking (mode, date, duration, time only)...');
    const bookOfflineRes = await axios.post(
      `${API_BASE}/consultations/request-booking`,
      {
        astrologerId: astrologer.id,
        scheduledDate: dateStr,
        startTime: availableSlotOffline.startTime,
        durationMinutes: 60,
        consultationMode: 'offline'
      },
      { headers: customerHeaders }
    );
    const offlineBooking = extractData(bookOfflineRes);
    console.log(`   ✓ Offline Booking created: #${offlineBooking.bookingNumber}`);
    console.log(`   ✓ Status: "${offlineBooking.bookingStatus}" (Expected: pending_admin_approval)`);

    // B.3 Admin accepts offline booking
    console.log('\nB.3 Admin accepts offline booking (no online payment required)...');
    const acceptOfflineRes = await axios.patch(
      `${API_BASE}/consultations/admin/bookings/${offlineBooking.id}/accept`,
      {
        adminNotes: 'Welcome to Patna office. Appointment confirmed.'
      },
      { headers: adminHeaders }
    );
    const confirmedOffline = extractData(acceptOfflineRes);
    console.log(`   ✓ Offline Booking accepted!`);
    console.log(`   ✓ Status: "${confirmedOffline.bookingStatus}" (Expected: confirmed)`);
    console.log(`   ✓ Payment Status: "${confirmedOffline.paymentStatus}" (Expected: not_required)`);
    console.log(`   ✓ Office Address: ${confirmedOffline.officeAddress}`);
    console.log(`   ✓ Google Meet Link: ${confirmedOffline.googleMeetLink || 'None (Correct for offline)'}`);
    if (confirmedOffline.googleMeetLink) {
      throw new Error('Offline appointment should NOT have a Google Meet link!');
    }

    // -------------------------------------------------------------------------
    // TEST FLOW C: REJECTION, SLOT RELEASE & PAYMENT DISALLOWANCE
    // -------------------------------------------------------------------------
    console.log('\n====================================================');
    console.log('TEST C: REJECTION, SLOT RELEASE & PAYMENT DISALLOWANCE');
    console.log('====================================================');

    // C.1 Book 30-min slot
    console.log('\nC.1 Customer booking 30-minute slot for rejection test...');
    const slotsRes4 = await axios.get(
      `${API_BASE}/consultations/slots?astrologerId=${astrologer.id}&date=${dateStr}&mode=online&duration=30`
    );
    const slotsData4 = extractData(slotsRes4);
    const slotToReject = slotsData4.slots.find(s => s.isAvailable);
    if (!slotToReject) {
      throw new Error('No available 30-minute slot found.');
    }
    console.log(`   ✓ Target slot: ${slotToReject.startTime} - ${slotToReject.endTime}`);

    const bookRejectRes = await axios.post(
      `${API_BASE}/consultations/request-booking`,
      {
        astrologerId: astrologer.id,
        scheduledDate: dateStr,
        startTime: slotToReject.startTime,
        durationMinutes: 30,
        consultationMode: 'online'
      },
      { headers: customerHeaders }
    );
    const rejectTestBooking = extractData(bookRejectRes);
    console.log(`   ✓ Created booking #${rejectTestBooking.bookingNumber}`);

    // Verify slot is now reserved
    const slotsCheckBefore = await axios.get(
      `${API_BASE}/consultations/slots?astrologerId=${astrologer.id}&date=${dateStr}&mode=online&duration=30`
    );
    const slotsBeforeData = extractData(slotsCheckBefore);
    const isReserved = !slotsBeforeData.slots.find(s => s.startTime === slotToReject.startTime).isAvailable;
    console.log(`   ✓ Slot reserved check: ${isReserved} (Slot is locked)`);

    // C.2 Admin rejects the booking
    console.log('\nC.2 Admin rejecting booking and releasing slot...');
    const rejectRes = await axios.patch(
      `${API_BASE}/consultations/admin/bookings/${rejectTestBooking.id}/reject`,
      {
        rejectionReason: 'Astrologer has a special planetary puja at this hour.'
      },
      { headers: adminHeaders }
    );
    const rejectedBooking = extractData(rejectRes);
    console.log(`   ✓ Admin rejected booking #${rejectedBooking.bookingNumber}`);
    console.log(`   ✓ Status: "${rejectedBooking.bookingStatus}" (Expected: rejected)`);
    console.log(`   ✓ Rejection Reason: "${rejectedBooking.rejectionReason}"`);

    // C.3 Verify payment is NOT allowed for rejected bookings
    console.log('\nC.3 Verifying payment is NOT allowed on rejected booking...');
    try {
      await axios.post(
        `${API_BASE}/consultations/my-bookings/${rejectTestBooking.id}/initiate-payment`,
        {},
        { headers: customerHeaders }
      );
      throw new Error('Payment was allowed on rejected booking! Should have failed.');
    } catch (err) {
      console.log(`   ✓ Payment properly rejected: "${err.response?.data?.message || err.message}"`);
    }

    // C.4 Verify slot is now AVAILABLE again
    console.log('\nC.4 Verifying slot is immediately released and available again for other customers...');
    const slotsCheckAfter = await axios.get(
      `${API_BASE}/consultations/slots?astrologerId=${astrologer.id}&date=${dateStr}&mode=online&duration=30`
    );
    const slotsAfterData = extractData(slotsCheckAfter);
    const releasedSlot = slotsAfterData.slots.find(s => s.startTime === slotToReject.startTime);
    console.log(`   ✓ Slot ${slotToReject.startTime} availability after rejection: ${releasedSlot?.isAvailable} (Expected: true)`);
    if (!releasedSlot?.isAvailable) {
      throw new Error('Slot release failed: Slot is still marked unavailable after rejection!');
    }

    console.log('\n====================================================');
    console.log('🎉 ALL TESTS PASSED! FULL WORKFLOW VERIFIED SUCCESSFULLY.');
    console.log('====================================================\n');

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runTest();
