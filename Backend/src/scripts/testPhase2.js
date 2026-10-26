require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../app");
const { connectDatabase } = require("../config/database");
const { env } = require("../config/env");
const User = require("../models/User");
const OtpCode = require("../models/OtpCode");

async function testPhase2() {
  console.log("==========================================");
  console.log("Running Phase 2 Authentication & Authorization Tests");
  console.log("==========================================\n");

  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  const timestamp = Date.now();
  const testEmail = `test_${timestamp}@example.com`;
  const testMobile = `+9198${String(timestamp).slice(-8)}`;
  const testPassword = "Password@123";
  const newPassword = "NewPassword@456";

  let customerToken = "";
  let customerId = "";
  let adminToken = "";

  try {
    // 1. Validation Failures on Register
    await check("1. Register rejects mismatched passwords (400)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: testEmail,
          mobile: testMobile,
          password: testPassword,
          confirmPassword: "WrongPassword"
        })
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await check("2. Register rejects invalid Indian mobile number (400)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: testEmail,
          mobile: "12345",
          password: testPassword,
          confirmPassword: testPassword
        })
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    // 2. Successful Registration
    await check("3. Register new customer successfully (201)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Customer",
          email: testEmail,
          mobile: testMobile,
          password: testPassword,
          confirmPassword: testPassword
        })
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status} - ${await res.text()}`);
      const body = await res.json();
      if (!body.token) throw new Error("Missing token in registration response");
      if (body.user.role !== "customer") throw new Error("New user should have role 'customer'");
      if (!body.user.referralCode) throw new Error("Missing referralCode for new user");
      customerToken = body.token;
      customerId = body.user._id || body.user.id;

      // Verify token payload includes role and email
      const decoded = jwt.decode(customerToken);
      if (decoded.role !== "customer") throw new Error(`Token claim role expected 'customer', got ${decoded.role}`);
      if (decoded.email !== testEmail) throw new Error(`Token claim email expected ${testEmail}, got ${decoded.email}`);
    });

    // 3. Duplicate Registration Rejection
    await check("4. Register rejects duplicate email (409 Conflict)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Duplicate User",
          email: testEmail,
          mobile: `+9197${String(Date.now()).slice(-8)}`,
          password: testPassword,
          confirmPassword: testPassword
        })
      });
      if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
    });

    await check("5. Register rejects duplicate mobile (409 Conflict)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Duplicate User",
          email: `different_${Date.now()}@example.com`,
          mobile: testMobile,
          password: testPassword,
          confirmPassword: testPassword
        })
      });
      if (res.status !== 409) throw new Error(`Expected 409, got ${res.status}`);
    });

    // 4. Login Tests
    await check("6. Login with email identifier succeeds (200)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: testEmail,
          password: testPassword
        })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body.token) throw new Error("Missing token in login response");
    });

    await check("7. Login with mobile identifier succeeds (200)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: testMobile,
          password: testPassword
        })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body.token) throw new Error("Missing token in login response");
    });

    await check("8. Login rejects incorrect password (401)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: testEmail,
          password: "WrongPassword@999"
        })
      });
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    // 5. User Profile and Preferences
    await check("9. GET /api/auth/me returns profile without password", async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const user = body.user || body.data?.user || body;
      if (user.password !== undefined) throw new Error("Password field must NOT be returned in profile");
      if (user.email !== testEmail) throw new Error(`Expected email ${testEmail}, got ${user.email}`);
    });

    await check("10. PATCH /api/auth/me updates customer name", async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({ name: "Updated Customer Name" })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const user = body.user || body.data?.user || body;
      if (user.name !== "Updated Customer Name") throw new Error("Customer name was not updated");
    });

    await check("11. PATCH /api/auth/me/preferences updates notification settings", async () => {
      const res = await fetch(`${baseUrl}/api/auth/me/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({ orderEmail: false, marketingSms: true })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const prefs = body.notificationPreferences || body.data?.notificationPreferences;
      if (!prefs || prefs.marketingSms !== true) throw new Error("Preferences update failed");
    });

    // 6. Password Change
    await check("12. POST /api/auth/change-password changes customer password", async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          currentPassword: testPassword,
          newPassword: newPassword,
          confirmPassword: newPassword
        })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status} - ${await res.text()}`);
    });

    await check("13. Login with newly changed password succeeds (200)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: testEmail,
          password: newPassword
        })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      customerToken = body.token;
    });

    // 7. Token Refresh
    await check("14. POST /api/auth/refresh-token yields a fresh token", async () => {
      const res = await fetch(`${baseUrl}/api/auth/refresh-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body.token) throw new Error("Missing token in refresh response");
    });

    // 8. Forgot Password Flow
    await check("15. POST /api/auth/forgot-password requests OTP", async () => {
      const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: testEmail })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body.channel) throw new Error("Missing channel in OTP response");
    });

    // 9. Authorization & Role Checks
    await check("16. Customer blocked from admin route (403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
    });

    // 10. Admin Login & Authorization
    const adminEmail = process.env.ADMIN_EMAIL || "astro@gmail.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "Astro@12345";
    await check("17. Admin Login succeeds and has admin role", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: adminEmail, password: adminPassword })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body.token || body.user.role !== "admin") throw new Error("Admin login failed or role != admin");
      adminToken = body.token;
    });

    await check("18. Admin allowed to access admin routes (200)", async () => {
      const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    });

  } finally {
    // Cleanup test user and OTP codes
    if (customerId) {
      await User.deleteOne({ _id: customerId }).catch(() => {});
      await OtpCode.deleteMany({ identifier: testEmail }).catch(() => {});
    }
    server.close();
    await mongoose.disconnect();
  }

  console.log(`\n==========================================`);
  console.log(`Phase 2 Tests Completed: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  if (failed > 0) process.exit(1);
}

testPhase2().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
