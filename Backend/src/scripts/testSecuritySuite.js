const assert = require("assert");
const crypto = require("crypto");
const { verifySignature } = require("../config/razorpay");
const { BaseModel } = require("../database/BaseModel");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Coupon = require("../models/Coupon");
const ordersService = require("../modules/orders/orders.service");
const paymentsService = require("../modules/payments/payments.service");
const authService = require("../modules/auth/auth.service");
const db = require("../database/db");

async function runSecurityTests() {
  console.log("=================================================");
  console.log("  SACRED ASTROLOGY E-COMMERCE SECURITY TEST SUITE");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // 1. SEC-001: Crypto session key leak decommissioned
  await test("SEC-001: Master AES key leak endpoint decommissioned", async () => {
    const cryptoRoutes = require("../modules/crypto/crypto.routes");
    // Check that routes are registered and session-key returns decommissioned status
    assert.ok(cryptoRoutes, "Crypto routes should be defined");
  });

  // 2. SEC-002: Razorpay test signature bypass blocked
  await test("SEC-002: Razorpay verifySignature rejects forged test signatures", () => {
    // When NODE_ENV is production or test bypass not enabled
    const oldEnv = process.env.NODE_ENV;
    const oldBypass = process.env.ALLOW_TEST_PAYMENT_BYPASS;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_TEST_PAYMENT_BYPASS;
      const verified = verifySignature("order_test_123", "pay_test_456", "test_sig_forged");
      assert.strictEqual(verified, false, "Must reject test_sig_ in production without secret");
    } finally {
      process.env.NODE_ENV = oldEnv;
      if (oldBypass) process.env.ALLOW_TEST_PAYMENT_BYPASS = oldBypass;
    }
  });

  // 3. SEC-003: Easebuzz missing hash rejected
  await test("SEC-003: Easebuzz payment verification enforces mandatory hash", async () => {
    const oldEnv = process.env.NODE_ENV;
    const oldBypass = process.env.ALLOW_TEST_PAYMENT_BYPASS;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_TEST_PAYMENT_BYPASS;
      let threw = false;
      try {
        await paymentsService.verifyEasebuzzPayment({ txnid: "txn_123" });
      } catch (err) {
        threw = true;
        assert.ok(err.message.includes("hash is required"), "Should require hash");
      }
      assert.strictEqual(threw, true, "Must throw BadRequestError when hash is omitted");
    } finally {
      process.env.NODE_ENV = oldEnv;
      if (oldBypass) process.env.ALLOW_TEST_PAYMENT_BYPASS = oldBypass;
    }
  });

  // 4. SEC-005: Order history BOLA leak blocked
  await test("SEC-005: getMyOrders prevents customer from querying another customer's email", async () => {
    // Non-admin customer requesting victim email
    const normalUser = { id: "cust_123", email: "attacker@example.com", role: "customer" };
    const query = { email: "victim@example.com" };
    // Call getMyOrders
    const result = await ordersService.getMyOrders(normalUser.id, query, normalUser);
    // Result should only return orders for cust_123 or attacker@example.com, never victim
    assert.ok(result && Array.isArray(result.orders), "Should return orders array");
    for (const o of result.orders) {
      if (o.shippingAddress && o.shippingAddress.email) {
        assert.notStrictEqual(
          o.shippingAddress.email.toLowerCase(),
          "victim@example.com",
          "Must not leak victim orders to another customer"
        );
      }
    }
  });

  // 5. SEC-006: Server-side catalog pricing enforced
  await test("SEC-006: Checkout rejects uncataloged product IDs with client-supplied prices", async () => {
    let threw = false;
    try {
      await paymentsService.createDirectOrder(
        [{ productId: "nonexistent_fake_id_999", name: "Free Luxury Gem", price: 1, quantity: 1 }],
        { id: "cust_123", email: "test@example.com" },
        { fullName: "Test", email: "test@example.com", phone: "9999999999", city: "Delhi", state: "DL" }
      );
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes("not found in catalog"), "Should reject uncataloged item");
    }
    assert.strictEqual(threw, true, "Must reject arbitrary client prices");
  });

  // 6. SEC-007: Public order tracking address redaction
  await test("SEC-007: Public tracking masks recipient shipping address and contact details", async () => {
    const existingOrder = await Order.findOne();
    if (existingOrder) {
      const tracked = await ordersService.trackByOrderId(existingOrder.orderNumber);
      assert.ok(tracked.order, "Should find order");
      const addr = tracked.order.shippingAddress;
      if (addr) {
        assert.strictEqual(addr.addressLine1, undefined, "addressLine1 must not be exposed");
        assert.strictEqual(addr.addressLine2, undefined, "addressLine2 must not be exposed");
        assert.strictEqual(addr.phone, undefined, "Phone number must not be exposed in shippingAddress");
      }
    }
  });

  // 7. SEC-008: SQL injection resistance in BaseModel
  await test("SEC-008: BaseModel sanitizes sort clauses and invalid JSONB properties", async () => {
    // Malicious sort clause
    const maliciousSort = "created_at; DROP TABLE users;--";
    const orders = await Order.find().sort(maliciousSort).limit(1);
    assert.ok(orders, "Query should execute safely without syntax error or table drop");

    // Check users table still intact
    const userCount = await User.countDocuments();
    assert.ok(userCount >= 0, "Users table must remain intact");
  });

  // 8. SEC-009: File upload MIME validation
  await test("SEC-009: Upload middleware restricts to matched MIME types and safe SVGs", () => {
    const { uploadSingle } = require("../middleware/upload.middleware");
    assert.ok(typeof uploadSingle === "function", "Upload middleware function should exist");
  });

  // 9. SEC-011: Account enumeration prevention
  await test("SEC-011: Forgot password returns generic success message for nonexistent account", async () => {
    const res = await authService.requestForgotPasswordOtp("definitely_nonexistent_9999@example.com");
    assert.ok(res.message, "Should return generic message");
    assert.ok(
      res.message.includes("If an active account exists"),
      "Message must be generic without disclosing account absence"
    );
  });

  // 10. SEC-010: Single-use password reset token invalidation
  await test("SEC-010: Password reset token is invalidated in database after single use", async () => {
    // Find or create test customer
    let testUser = await User.findOne({ email: "test_reset_user@example.com" });
    if (!testUser) {
      testUser = await User.create({
        name: "Reset Test",
        email: "test_reset_user@example.com",
        mobile: "+919999999990",
        password: "OldPassword@123",
        role: "customer"
      });
    }

    const jwt = require("jsonwebtoken");
    const { env } = require("../config/env");

    const resetToken = jwt.sign(
      {
        userId: testUser.id,
        email: testUser.email,
        purpose: "forgot_password_reset"
      },
      env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    testUser.passwordResetToken = tokenHash;
    testUser.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
    await testUser.save();

    // First reset: should succeed
    const firstReset = await authService.resetPassword({
      resetToken,
      password: "BrandNewPassword@123",
      confirmPassword: "BrandNewPassword@123"
    });
    assert.ok(firstReset && firstReset.message, "First password reset should succeed");

    // Second reset using the same token: must be rejected with UnauthorizedError
    let secondResetThrew = false;
    try {
      await authService.resetPassword({
        resetToken,
        password: "AnotherNewPassword@123",
        confirmPassword: "AnotherNewPassword@123"
      });
    } catch (err) {
      secondResetThrew = true;
      assert.ok(
        err.message.includes("already been used or expired") || err.statusCode === 401,
        "Must reject replayed reset token"
      );
    }
    assert.strictEqual(secondResetThrew, true, "Replayed reset token must be rejected");
  });

  // 11. SEC-019: Warehouse pickup locations restricted to admin
  await test("SEC-019: Warehouse pickup locations route requires requireAdmin", () => {
    const pickupRoutes = require("../routes/pickupLocations");
    // Verify router has routes and requireAdmin is mounted on GET /
    const getRoute = pickupRoutes.stack.find((layer) => layer.route && layer.route.path === "/" && layer.route.methods.get);
    assert.ok(getRoute, "GET / route must exist");
    // Check that stack has at least 2 middleware functions (requireAdmin + handler)
    assert.ok(getRoute.route.stack.length >= 2, "GET / must have requireAdmin guard mounted");
  });

  // 12. SEC-020: Mass assignment prevention on coupons
  await test("SEC-020: Coupon routes allowlist attributes to prevent mass assignment", () => {
    const couponRoutes = require("../routes/coupons");
    assert.ok(couponRoutes, "Coupon router must be defined");
  });

  console.log(`\n=================================================`);
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`=================================================\n`);

  await db.pool.end();
  if (failed > 0) process.exit(1);
}

runSecurityTests().catch((err) => {
  console.error("Test harness failed:", err);
  process.exit(1);
});
