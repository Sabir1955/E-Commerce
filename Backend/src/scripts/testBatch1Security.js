const assert = require("assert");
const authService = require("../modules/auth/auth.service");
const paymentsService = require("../modules/payments/payments.service");
const ordersService = require("../modules/orders/orders.service");
const ordersController = require("../modules/orders/orders.controller");
const { env } = require("../config/env");

async function runRegressionTests() {
  console.log("==================================================");
  console.log("RUNNING BATCH 1 REGRESSION TESTS (P0 SECURITY)");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return (async () => {
      try {
        await fn();
        console.log(`✓ [PASS] ${name}`);
        passed++;
      } catch (err) {
        console.error(`✗ [FAIL] ${name}:`, err.message);
        failed++;
      }
    })();
  }

  // 1. Payment Signature Verification
  await test("Payment: Reject verifyDirectPayment when signature is missing", async () => {
    let threw = false;
    try {
      await paymentsService.verifyDirectPayment({
        recordId: "dummy-record",
        orderId: "order_123",
        paymentId: "pay_123"
        // signature omitted
      });
    } catch (err) {
      threw = err.message.includes("signature are required");
    }
    assert.strictEqual(threw, true, "Expected missing signature to throw BadRequestError");
  });

  await test("Payment: verifySignature correctly validates valid vs invalid signatures", async () => {
    const { verifySignature } = require("../config/razorpay");
    const validTestSig = verifySignature("order_123", "pay_123", "test_sig_abc");
    const invalidSig = verifySignature("order_123", "pay_123", "bad_signature");
    assert.strictEqual(validTestSig, true, "test_sig_ should be accepted in sandbox mode");
    assert.strictEqual(invalidSig, false, "Arbitrary invalid signature must be rejected");
  });

  // 2. Auth Email Validation
  await test("Auth: Reject registration for non-Gmail addresses", async () => {
    let threw = false;
    try {
      await authService.register({
        name: "Test User",
        email: "user@yahoo.com",
        mobile: "9876543210",
        password: "ValidPassword@123",
        confirmPassword: "ValidPassword@123"
      });
    } catch (err) {
      threw = err.message.includes("Only Gmail addresses");
    }
    assert.strictEqual(threw, true, "Expected non-Gmail registration rejection");
  });

  await test("Auth: Login accepts configured ADMIN_EMAIL even if not Gmail", async () => {
    const adminEmail = env.ADMIN_EMAIL || "admin@example.com";
    // Check that login validation does not throw "Only Gmail addresses" for adminEmail
    let rejectedWithGmailError = false;
    try {
      await authService.login({
        identifier: adminEmail,
        password: "WrongPasswordForValidationCheck"
      });
    } catch (err) {
      if (err.message && err.message.includes("Only Gmail addresses")) {
        rejectedWithGmailError = true;
      }
    }
    assert.strictEqual(rejectedWithGmailError, false, "Admin email must not be rejected with Only Gmail error");
  });

  // 3. Order Tracking Authorization & Masking
  await test("Orders Controller: trackByUser throws ForbiddenError on cross-user access", async () => {
    let threwForbidden = false;
    const mockReq = {
      user: { _id: "507f1f77bcf86cd799439011", role: "customer" },
      params: { userId: "507f1f77bcf86cd799439022" } // different user
    };
    const mockRes = {};

    try {
      await ordersController.trackByUser(mockReq, mockRes);
    } catch (err) {
      threwForbidden = err.name === "ForbiddenError" || err.statusCode === 403;
    }
    assert.strictEqual(threwForbidden, true, "Expected ForbiddenError on cross-user track attempt");
  });

  console.log("\n==================================================");
  console.log(`BATCH 1 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
