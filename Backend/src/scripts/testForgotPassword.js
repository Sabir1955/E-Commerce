require("dotenv").config();
const mongoose = require("mongoose");
const app = require("../app");
const User = require("../models/User");
const OtpCode = require("../models/OtpCode");
const crypto = require("crypto");

const { connectDatabase, disconnectDatabase } = require("../config/database");

let passedCount = 0;
let failedCount = 0;

function pass(title) {
  passedCount++;
  console.log(`  ✓ [PASS] ${title}`);
}

function fail(title, error) {
  failedCount++;
  console.error(`  ✗ [FAIL] ${title}:`, error);
}

async function run() {
  console.log("\n==========================================");
  console.log("Testing Forgot Password & Reset Password API Flow");
  console.log("==========================================\n");

  await connectDatabase();

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testEmail = `forgot_test_${Date.now()}@gmail.com`;
  const testMobile = "98" + Math.floor(10000000 + Math.random() * 90000000);
  const initialPassword = "Initial@Pass123";
  const newPassword = "Updated@Pass456";
  let testOtpCode = "";

  try {

    // Step 0: Register a test customer
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Forgot Test User",
        email: testEmail,
        mobile: testMobile,
        password: initialPassword,
        confirmPassword: initialPassword
      })
    });
    const regData = await regRes.json();
    if (regRes.status !== 201) {
      throw new Error(`Registration failed: ${regRes.status} ${JSON.stringify(regData)}`);
    }
    pass("0. Register temporary user for forgot password testing");

    // Test 1: Request OTP for non-existent email -> Generic 200 (Anti-enumeration SEC-011)
    const nonExistRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "non_existent_user_9999@example.com" })
    });
    const nonExistData = await nonExistRes.json();
    if (nonExistRes.status === 200 && nonExistData.message && nonExistData.message.includes("If an active account exists")) {
      pass("1. POST /api/auth/forgot-password returns generic 200 to prevent account enumeration (SEC-011)");
    } else {
      fail("1. Expected generic 200 for unknown account to prevent enumeration", `Got ${nonExistRes.status}`);
    }

    // Test 2: Request OTP without identifier -> 400
    const emptyRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (emptyRes.status === 400) {
      pass("2. POST /api/auth/forgot-password returns 400 when identifier is missing");
    } else {
      fail("2. Expected 400 when identifier missing", `Got ${emptyRes.status}`);
    }

    // Test 3: Request OTP for valid user -> 200 & devOtp must NOT be present in API response
    const otpRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testEmail })
    });
    const otpData = await otpRes.json();
    if (otpRes.status === 200 && (otpData.channel === "email" || otpData.destination) && otpData.devOtp === undefined) {
      pass("3. POST /api/auth/forgot-password generates OTP securely (OTP not leaked in API response)");
      // For verification tests in local test script, set a known test OTP hash directly in DB
      testOtpCode = "123456";
      await OtpCode.updateOne(
        { identifier: testEmail, purpose: "forgot_password" },
        { codeHash: crypto.createHash("sha256").update(testOtpCode).digest("hex") }
      );
    } else {
      fail("3. POST /api/auth/forgot-password failed or leaked OTP in API response", JSON.stringify(otpData));
    }

    // Test 4: Reset password with wrong OTP -> 400
    const wrongOtpRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: testEmail,
        otp: "000000",
        password: newPassword,
        confirmPassword: newPassword
      })
    });
    if (wrongOtpRes.status === 400) {
      pass("4. POST /api/auth/reset-password rejects incorrect OTP (400)");
    } else {
      fail("4. Expected 400 for incorrect OTP", `Got ${wrongOtpRes.status}`);
    }

    // Test 5: Reset password with mismatched passwords -> 400
    const mismatchRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: testEmail,
        otp: testOtpCode,
        password: newPassword,
        confirmPassword: "DifferentPassword123"
      })
    });
    if (mismatchRes.status === 400) {
      pass("5. POST /api/auth/reset-password rejects mismatched password & confirmPassword (400)");
    } else {
      fail("5. Expected 400 for mismatched passwords", `Got ${mismatchRes.status}`);
    }

    // Test 6: Reset password with correct OTP & matching passwords -> 200
    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: testEmail,
        otp: testOtpCode,
        password: newPassword,
        confirmPassword: newPassword
      })
    });
    const resetData = await resetRes.json();
    if (resetRes.status === 200 && resetData.success) {
      pass("6. POST /api/auth/reset-password resets password successfully (200)");
    } else {
      fail("6. Reset password failed", JSON.stringify(resetData));
    }

    // Test 7: Login with old password -> 401 Unauthorized
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testEmail, password: initialPassword })
    });
    if (oldLoginRes.status === 401) {
      pass("7. Login with OLD password is now rejected (401 Unauthorized)");
    } else {
      fail("7. Expected 401 with old password", `Got ${oldLoginRes.status}`);
    }

    // Test 8: Login with new password -> 200 Success & token
    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testEmail, password: newPassword })
    });
    const newLoginData = await newLoginRes.json();
    if (newLoginRes.status === 200 && (newLoginData.token || newLoginData.data?.token)) {
      pass("8. Login with NEW password succeeds (200 OK with valid JWT token)");
    } else {
      fail("8. Login with new password failed", JSON.stringify(newLoginData));
    }

    // Test 9: Also test alias routes (/forgot-password/request-otp and /forgot-password/verify-otp)
    const aliasReqRes = await fetch(`${baseUrl}/api/auth/forgot-password/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testEmail })
    });
    const aliasReqData = await aliasReqRes.json();
    if (aliasReqRes.status === 200 && aliasReqData.devOtp === undefined) {
      const aliasTestOtp = "654321";
      await OtpCode.updateOne(
        { identifier: testEmail, purpose: "forgot_password" },
        { codeHash: crypto.createHash("sha256").update(aliasTestOtp).digest("hex") }
      );
      const aliasVerifyRes = await fetch(`${baseUrl}/api/auth/forgot-password/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: testEmail,
          otp: aliasTestOtp,
          password: "FinalPassword@789",
          confirmPassword: "FinalPassword@789"
        })
      });
      if (aliasVerifyRes.status === 200) {
        pass("9. Alias endpoints /request-otp and /verify-otp work identically (200)");
      } else {
        fail("9. /verify-otp failed", `Got ${aliasVerifyRes.status}`);
      }
    } else {
      fail("9. /request-otp alias failed or returned devOtp", `Got ${aliasReqRes.status}`);
    }

  } finally {
    // Cleanup test user & OTP records
    await User.deleteOne({ email: testEmail }).catch(() => {});
    await OtpCode.deleteMany({ identifier: testEmail }).catch(() => {});
    server.close();
    await disconnectDatabase();
    console.log("\n==========================================");
    console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
    console.log("==========================================\n");
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

run().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
