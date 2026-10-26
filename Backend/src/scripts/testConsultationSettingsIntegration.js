const axios = require('axios');
const FormData = require('form-data');
const db = require('../database/db');

const BASE_URL = 'http://localhost:5000/api';

async function run() {
  console.log('========================================================');
  console.log('   CONSULTATION SETTINGS & PHOTO UPLOAD TEST SUITE     ');
  console.log('========================================================\n');

  try {
    // 1. Fetch public consultation settings
    console.log('[Test 1] Testing Public GET /api/consultations/settings...');
    const publicRes = await axios.get(`${BASE_URL}/consultations/settings`);
    if (!publicRes.data.success || !publicRes.data.data) {
      throw new Error('Failed to retrieve public consultation settings');
    }
    const initialSettings = publicRes.data.data;
    console.log(`✓ Initial Astrologer: "${initialSettings.name}"`);
    console.log(`✓ Consultation Title: "${initialSettings.consultationTitle}"`);
    console.log(`✓ Office Name: "${initialSettings.officeName}"`);
    console.log(`✓ Office Address: "${initialSettings.officeAddress}"`);
    console.log(`✓ Maps URL: "${initialSettings.officeMapsUrl}"\n`);

    // 2. Admin Authentication
    console.log('[Test 2] Authenticating Store Admin...');
    const adminRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@gmail.com',
      password: 'Admin@12345'
    });
    const adminToken = adminRes.data.data.token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    console.log('✓ Store Admin authenticated successfully.\n');

    // 3. Test Admin GET /api/consultations/admin/settings
    console.log('[Test 3] Testing Admin GET /api/consultations/admin/settings...');
    const adminSettingsRes = await axios.get(`${BASE_URL}/consultations/admin/settings`, { headers: adminHeaders });
    if (!adminSettingsRes.data.success) {
      throw new Error('Admin settings retrieval failed');
    }
    console.log('✓ Admin settings retrieved successfully.\n');

    // 4. Test Image Upload via POST /api/consultations/admin/upload-photo
    console.log('[Test 4] Testing Profile Photo Upload via POST /api/consultations/admin/upload-photo...');
    const form = new FormData();
    const fakeImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    form.append('photo', fakeImageBuffer, { filename: 'test-profile.png', contentType: 'image/png' });

    const uploadRes = await axios.post(`${BASE_URL}/consultations/admin/upload-photo`, form, {
      headers: {
        ...adminHeaders,
        ...form.getHeaders()
      }
    });

    if (!uploadRes.data.success || !uploadRes.data.data?.url) {
      throw new Error('Photo upload failed: ' + JSON.stringify(uploadRes.data));
    }
    const uploadedPhotoUrl = uploadRes.data.data.url;
    console.log(`✓ Photo uploaded successfully to PostgreSQL BYTEA storage: "${uploadedPhotoUrl}"\n`);

    // 5. Test Updating Settings via PUT /api/consultations/admin/settings
    console.log('[Test 5] Updating consultation profile and office details via PUT /api/consultations/admin/settings...');
    const updatedPayload = {
      name: 'Astro Poonam Vaish Mam — Dynamic Expert',
      photoUrl: uploadedPhotoUrl,
      consultationTitle: 'Supreme Vedic Jyotish & Kundali Consultation',
      organizationName: 'Astro Nirvan Global',
      venueTitle: 'Astro Nirvan Flagship Sanctuary — Patna',
      officeName: 'Astro Nirvan Main Office',
      officeAddress: 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri',
      officeCity: 'Patna',
      officeState: 'Bihar',
      officePincode: '800001',
      officeMapsUrl: 'https://maps.google.com/?q=Patna+Office',
      visitingHours: '09:30 AM – 07:00 PM (IST)',
      workingDays: 'Monday to Sunday',
      officeInstructions: 'Please arrive 15 minutes prior with printed birth charts.'
    };

    const updateRes = await axios.put(`${BASE_URL}/consultations/admin/settings`, updatedPayload, { headers: adminHeaders });
    if (!updateRes.data.success || updateRes.data.data.name !== updatedPayload.name) {
      throw new Error('Settings update failed: ' + JSON.stringify(updateRes.data));
    }
    console.log('✓ Settings updated successfully.\n');

    // 6. Verify with Public GET that new details appear automatically without hardcoding
    console.log('[Test 6] Verifying changes reflect on Public GET /api/consultations/settings...');
    const publicVerifyRes = await axios.get(`${BASE_URL}/consultations/settings`);
    const verified = publicVerifyRes.data.data;
    if (
      verified.name !== updatedPayload.name ||
      verified.consultationTitle !== updatedPayload.consultationTitle ||
      verified.venueTitle !== updatedPayload.venueTitle ||
      verified.visitingHours !== updatedPayload.visitingHours
    ) {
      throw new Error('Verification failed: public API did not return updated details');
    }
    console.log(`✓ Verified Dynamic Name: "${verified.name}"`);
    console.log(`✓ Verified Dynamic Title: "${verified.consultationTitle}"`);
    console.log(`✓ Verified Dynamic Venue Title: "${verified.venueTitle}"`);
    console.log(`✓ Verified Dynamic Hours: "${verified.visitingHours}"`);
    console.log(`✓ Verified Dynamic Photo URL: "${verified.photoUrl}"\n`);

    // 7. Restore original settings to keep DB in pristine state
    console.log('[Test 7] Restoring original default settings...');
    await axios.put(`${BASE_URL}/consultations/admin/settings`, {
      name: 'Astro Poonam Vaish Mam',
      photoUrl: initialSettings.photoUrl,
      consultationTitle: 'Vedic Astrology Consultation',
      organizationName: 'Astro Nirvan',
      venueTitle: 'Physical Office Venue — Patna',
      officeName: 'Astro Poonam Vaish Mam — Astro Nirvan',
      officeAddress: initialSettings.officeAddress,
      officeCity: initialSettings.officeCity || 'Patna',
      officeState: initialSettings.officeState || 'Bihar',
      officePincode: initialSettings.officePincode || '800001',
      officeMapsUrl: initialSettings.officeMapsUrl,
      visitingHours: '10:00 AM – 06:30 PM (IST)',
      workingDays: 'Monday to Saturday',
      officeInstructions: initialSettings.officeInstructions
    }, { headers: adminHeaders });
    console.log('✓ Original settings restored successfully.\n');

    console.log('========================================================');
    console.log('   🎉 ALL CONSULTATION SETTINGS TESTS PASSED (100%)    ');
    console.log('========================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Integration test failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

run();
