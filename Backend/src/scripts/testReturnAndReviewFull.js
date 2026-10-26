require("dotenv").config();
const http = require("http");
const jwt = require("jsonwebtoken");
const app = require("../app");
const { connectDatabase } = require("../config/database");
const { env } = require("../config/env");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Return = require("../models/Return");
const Review = require("../models/Review");

async function run() {
  console.log("\n=================================================");
  console.log("Running Return & Review Full Verification Suite");
  console.log("=================================================\n");

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
  let customerToken = "";
  let customerId = "";
  let adminToken = "";
  let testProduct = null;
  let testOrder1 = null;
  let testOrder2 = null;
  let testReturn1 = null;

  try {
    // 1. Setup Customer & Admin
    await check("1. Register customer and generate admin token", async () => {
      const custRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Return Test Customer",
          email: `ret_cust_${timestamp}@gmail.com`,
          mobile: `+9198${String(timestamp).slice(-8)}`,
          password: "Password@123",
          confirmPassword: "Password@123"
        })
      });
      const custData = await custRes.json();
      if (custRes.status !== 201) throw new Error(`Customer register failed: ${JSON.stringify(custData)}`);
      customerToken = custData.token;
      customerId = custData.user._id || custData.user.id;

      const adminUser = await User.create({
        name: "Admin Returns",
        email: `admin_ret_${timestamp}@gmail.com`,
        mobile: `+9197${String(timestamp).slice(-8)}`,
        password: "hashedpassword123",
        role: "admin",
        active: true
      });
      adminToken = jwt.sign({ userId: adminUser._id }, env.JWT_SECRET);
      if (!adminToken) throw new Error("Admin token generation failed");
    });

    // 2. Create sample product
    await check("2. Create sample product for return and review testing", async () => {
      testProduct = await Product.create({
        name: `Sacred Gemstone ${timestamp}`,
        price: 2499,
        stock: 50,
        category: "Gemstones",
        sku: `GEM-${timestamp}`,
        description: "Tested gemstone for returns and reviews",
        isReturnable: true,
        isReplaceable: true,
        returnWindowDays: 14,
        active: true
      });
      if (!testProduct._id && !testProduct.id) throw new Error("Product creation failed");
    });

    // 3. Create delivered test orders in PostgreSQL
    await check("3. Create Delivered Orders for Customer (with 24-hex and #orderNumber)", async () => {
      const prodId = String(testProduct._id || testProduct.id);
      const ordNum1 = `ORD-${timestamp}`;
      const ordNum2 = `#ORD-${timestamp + 1}`;

      const shipAddr = {
        fullName: "Return Customer",
        mobile: "9876543210",
        address: "Ashram Road",
        city: "Haridwar",
        state: "UK",
        postalCode: "249401",
        country: "India"
      };

      testOrder1 = await Order.create({
        user: customerId,
        orderNumber: ordNum1,
        items: [
          {
            product: prodId,
            name: testProduct.name,
            price: testProduct.price,
            quantity: 2
          }
        ],
        subtotal: testProduct.price * 2,
        total: testProduct.price * 2,
        shippingAddress: shipAddr,
        status: "delivered",
        deliveredAt: new Date(),
        paymentStatus: "paid",
        paymentMethod: "Online"
      });

      testOrder2 = await Order.create({
        user: customerId,
        orderNumber: ordNum2,
        items: [
          {
            product: prodId,
            name: testProduct.name,
            price: testProduct.price,
            quantity: 1
          }
        ],
        subtotal: testProduct.price,
        total: testProduct.price,
        shippingAddress: shipAddr,
        status: "delivered",
        deliveredAt: new Date().toISOString(),
        paymentStatus: "paid",
        paymentMethod: "Online"
      });
      if (!testOrder1 || !testOrder2) throw new Error("Failed to create orders");
    });

    // 4. Submit return request using 24-hex orderId
    await check("4. Submit Return Request with 24-hex orderId", async () => {
      const prodId = String(testProduct._id || testProduct.id);
      const orderId = String(testOrder1._id || testOrder1.id);
      const res = await fetch(`${baseUrl}/api/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          orderId,
          type: "return",
          reason: "Item slightly different shade than expected",
          items: [{ product: prodId, quantity: 1 }]
        })
      });
      const data = await res.json();
      if (res.status !== 201) throw new Error(`Status ${res.status} - ${JSON.stringify(data)}`);
      testReturn1 = data;
      if (Number(testReturn1.refundAmount) !== Number(testProduct.price)) {
        throw new Error(`Expected refundAmount ${testProduct.price}, got ${testReturn1.refundAmount}`);
      }
    });

    // 5. Submit replacement request using orderNumber with '#'
    await check("5. Submit Replacement Request with #orderNumber", async () => {
      const prodId = String(testProduct._id || testProduct.id);
      const res = await fetch(`${baseUrl}/api/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          orderId: testOrder2.orderNumber,
          type: "replacement",
          reason: "Requested size exchange for ring",
          items: [{ product: prodId, quantity: 1 }]
        })
      });
      const data = await res.json();
      if (res.status !== 201) throw new Error(`Status ${res.status} - ${JSON.stringify(data)}`);
      if (data.type !== "replacement") throw new Error(`Expected type replacement, got ${data.type}`);
      if (Number(data.refundAmount) !== 0) throw new Error(`Expected 0 refund for replacement, got ${data.refundAmount}`);
    });

    // 6. Prevent duplicate return on active order
    await check("6. Prevent Duplicate Active Return on Same Order", async () => {
      const orderId = String(testOrder1._id || testOrder1.id);
      const res = await fetch(`${baseUrl}/api/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          orderId,
          type: "return",
          reason: "Trying to submit duplicate return"
        })
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    // 7. Customer fetches returns via /mine
    await check("7. GET /api/returns/mine returns customer return records", async () => {
      const res = await fetch(`${baseUrl}/api/returns/mine`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!Array.isArray(data.returns) || data.returns.length < 2) {
        throw new Error(`Expected at least 2 returns, got ${data.returns?.length}`);
      }
    });

    // 8. Admin fetches all returns
    await check("8. Admin GET /api/returns lists returns", async () => {
      const res = await fetch(`${baseUrl}/api/returns`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!Array.isArray(data.returns)) throw new Error("Returns not array");
    });

    // 9. Admin updates return status to approved
    await check("9. Admin PATCH /api/returns/:id updates status to approved", async () => {
      const retId = String(testReturn1._id || testReturn1.id);
      const res = await fetch(`${baseUrl}/api/returns/${retId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          status: "approved",
          adminNote: "Return inspected and approved"
        })
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status} - ${JSON.stringify(data)}`);
      if (data.status !== "approved" && data.status !== "Accepted") throw new Error(`Expected approved or Accepted, got ${data.status}`);
    });

    // 10. Customer view tracking
    await check("10. Customer GET /api/returns/:id/tracking", async () => {
      const retId = String(testReturn1._id || testReturn1.id);
      const res = await fetch(`${baseUrl}/api/returns/${retId}/tracking`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (data.status !== "approved" && data.status !== "Accepted") throw new Error(`Expected status approved or Accepted, got ${data.status}`);
      if (!Array.isArray(data.trackingEvents) || data.trackingEvents.length < 2) {
        throw new Error("Tracking events missing");
      }
    });

    // 11. Submit Review using orderNumber with #
    await check("11. Submit Review on delivered order using orderNumber with #", async () => {
      const prodId = String(testProduct._id || testProduct.id);
      const res = await fetch(`${baseUrl}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          product: prodId,
          orderId: testOrder2.orderNumber,
          rating: 5,
          comment: "Authentic gemstone, high vibration and beautifully energized!"
        })
      });
      const data = await res.json();
      if (res.status !== 201) throw new Error(`Status ${res.status} - ${JSON.stringify(data)}`);
      if (data.rating !== 5) throw new Error(`Expected rating 5, got ${data.rating}`);
      if (!data.verifiedPurchase) throw new Error("Expected verifiedPurchase true");
    });

    // 12. Public product reviews check
    await check("12. Public GET /api/reviews/product/:id returns approved review", async () => {
      const prodId = String(testProduct._id || testProduct.id);
      const res = await fetch(`${baseUrl}/api/reviews/product/${prodId}`);
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!Array.isArray(data.reviews) || data.reviews.length === 0) {
        throw new Error("No reviews returned for product");
      }
    });

  } finally {
    server.close();
  }

  console.log("\n=================================================");
  console.log(`Returns & Reviews E2E: ${passed} passed, ${failed} failed`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
