require("dotenv").config();
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../app");
const { connectDatabase } = require("../config/database");
const { env } = require("../config/env");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Review = require("../models/Review");

async function testReviewE2E() {
  console.log("=================================================");
  console.log("Running Rating & Review End-to-End Tests (MongoDB)");
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
  let adminId = "";
  let testProduct = null;
  let deliveredOrder = null;
  let undeliveredOrder = null;
  let createdReviewId = "";

  try {
    // 1. Setup Customer & Admin
    await check("1. Register customer and generate admin token", async () => {
      const custRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Vedic Reviewer",
          email: `reviewer_${timestamp}@gmail.com`,
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
        name: "Admin Reviewer",
        email: `admin_rev_${timestamp}@gmail.com`,
        mobile: `+9197${String(timestamp).slice(-8)}`,
        password: "hashedpassword123",
        role: "admin",
        active: true
      });
      adminId = String(adminUser._id);
      adminToken = jwt.sign({ userId: adminUser._id }, env.JWT_SECRET);
      if (!adminToken) throw new Error("Admin token generation failed");
    });

    // 2. Create sample product
    await check("2. Create sample product for review testing", async () => {
      testProduct = await Product.create({
        name: `Consecrated Rudraksha Mala ${timestamp}`,
        description: "Pure authentic 108 bead consecrated Rudraksha mala energized with Vedic mantras.",
        sku: `SKU-MAL-${timestamp}`,
        price: 2100,
        stock: 50,
        category: "rudraksha",
        active: true,
        rating: 0,
        reviewCount: 0
      });
      if (!testProduct) throw new Error("Product creation failed");
    });

    // 3. Create Orders (one delivered, one processing)
    await check("3. Create delivered and processing orders in MongoDB", async () => {
      deliveredOrder = await Order.create({
        user: customerId,
        orderNumber: `ORD-DEL-${timestamp}`,
        items: [{
          product: testProduct._id,
          name: testProduct.name,
          quantity: 1,
          price: testProduct.price
        }],
        subtotal: testProduct.price,
        total: testProduct.price,
        shippingAddress: {
          fullName: "Vedic Reviewer",
          mobile: "9876543210",
          address: "Temple Road",
          city: "Varanasi",
          state: "UP",
          postalCode: "221001",
          country: "India"
        },
        status: "delivered",
        deliveredAt: new Date()
      });

      undeliveredOrder = await Order.create({
        user: customerId,
        orderNumber: `ORD-PROC-${timestamp}`,
        items: [{
          product: testProduct._id,
          name: testProduct.name,
          quantity: 1,
          price: testProduct.price
        }],
        subtotal: testProduct.price,
        total: testProduct.price,
        shippingAddress: {
          fullName: "Vedic Reviewer",
          mobile: "9876543210",
          address: "Temple Road",
          city: "Varanasi",
          state: "UP",
          postalCode: "221001",
          country: "India"
        },
        status: "processing"
      });
    });

    // 4. Test rejecting review on non-delivered order
    await check("4. Reject review on non-delivered order", async () => {
      const res = await fetch(`${baseUrl}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          product: String(testProduct._id),
          orderId: String(undeliveredOrder._id),
          rating: 5,
          comment: "Tried reviewing before delivery"
        })
      });
      if (res.status !== 400) {
        throw new Error(`Expected 400 Bad Request, got ${res.status}`);
      }
    });

    // 5. Submit valid review on delivered order
    await check("5. Submit valid 1-5 star review on delivered purchase", async () => {
      const res = await fetch(`${baseUrl}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          product: String(testProduct._id),
          orderId: String(deliveredOrder._id),
          rating: 5,
          comment: "Authentic energy and divine vibrations. Exceptional craftsmanship!"
        })
      });
      if (res.status !== 201) {
        const body = await res.json();
        throw new Error(`Expected 201 Created, got ${res.status}: ${JSON.stringify(body)}`);
      }
      const data = await res.json();
      createdReviewId = data._id;
      if (!createdReviewId) throw new Error("Missing review ID");
      if (data.rating !== 5) throw new Error(`Expected rating 5, got ${data.rating}`);
      if (!data.verifiedPurchase) throw new Error("Expected verifiedPurchase: true");
    });

    // 6. Prevent duplicate reviews
    await check("6. Prevent duplicate reviews for same product by same user", async () => {
      const res = await fetch(`${baseUrl}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          product: String(testProduct._id),
          orderId: String(deliveredOrder._id),
          rating: 4,
          comment: "Duplicate review attempt"
        })
      });
      if (res.status !== 409) {
        throw new Error(`Expected 409 Conflict for duplicate review, got ${res.status}`);
      }
    });

    // 7. GET /api/reviews/mine returns user's review with populated data
    await check("7. GET /api/reviews/mine returns user's reviews from MongoDB", async () => {
      const res = await fetch(`${baseUrl}/api/reviews/mine`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.reviews) || data.reviews.length === 0) {
        throw new Error("Expected reviews array containing user review");
      }
      const found = data.reviews.find(r => r._id === createdReviewId);
      if (!found) throw new Error("Created review not found in /mine");
      if (typeof found.product !== "object" || !found.product.name) {
        throw new Error("Product was not populated in /mine review");
      }
    });

    // 8. Product Reviews API reflects newly submitted review
    await check("8. GET /api/reviews/product/:id returns approved review", async () => {
      const res = await fetch(`${baseUrl}/api/reviews/product/${testProduct._id}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const data = await res.json();
      const found = (data.reviews || []).find(r => r._id === createdReviewId);
      if (!found) throw new Error("Approved review not found in product reviews list");
    });

    // 9. Admin Moderation API
    await check("9. Admin GET /api/reviews/moderation displays reviews with stats", async () => {
      const res = await fetch(`${baseUrl}/api/reviews/moderation?status=all`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.reviews)) throw new Error("Expected reviews array in moderation response");
      if (!data.stats || data.stats.total < 1) throw new Error("Expected stats with total >= 1");
      const found = data.reviews.find(r => r._id === createdReviewId);
      if (!found) throw new Error("Created review not found in admin moderation queue");
      if (typeof found.user !== "object" || !found.user.name) {
        throw new Error("Customer user details not populated in admin moderation");
      }
    });

    // 10. Admin Moderation Status Update
    await check("10. Admin PATCH /api/reviews/:id/moderate updates status and updates store visibility", async () => {
      // Reject review
      const rejectRes = await fetch(`${baseUrl}/api/reviews/${createdReviewId}/moderate`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: "rejected" })
      });
      if (rejectRes.status !== 200) throw new Error(`Expected 200, got ${rejectRes.status}`);
      const rejectedData = await rejectRes.json();
      if (rejectedData.status !== "rejected") throw new Error(`Expected status rejected, got ${rejectedData.status}`);

      // Verify rejected review is hidden from customer product details
      const listAfterReject = await fetch(`${baseUrl}/api/reviews/product/${testProduct._id}`);
      const listData = await listAfterReject.json();
      const stillVisible = (listData.reviews || []).some(r => r._id === createdReviewId);
      if (stillVisible) throw new Error("Rejected review should NOT be visible to customers");

      // Approve review again
      const approveRes = await fetch(`${baseUrl}/api/reviews/${createdReviewId}/moderate`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: "approved" })
      });
      if (approveRes.status !== 200) throw new Error(`Expected 200, got ${approveRes.status}`);

      // Verify visible again
      const listAfterApprove = await fetch(`${baseUrl}/api/reviews/product/${testProduct._id}`);
      const approveData = await listAfterApprove.json();
      const visibleAgain = (approveData.reviews || []).some(r => r._id === createdReviewId);
      if (!visibleAgain) throw new Error("Approved review should be visible to customers");
    });

    // 11. Admin Delete Review
    await check("11. Admin DELETE /api/reviews/:id permanently removes review", async () => {
      const delRes = await fetch(`${baseUrl}/api/reviews/${createdReviewId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (delRes.status !== 200) throw new Error(`Expected 200, got ${delRes.status}`);

      const inDb = await Review.findById(createdReviewId);
      if (inDb) throw new Error("Review still exists in database after delete");
    });

  } finally {
    if (customerId) await User.deleteOne({ _id: customerId }).catch(() => {});
    if (adminId) await User.deleteOne({ _id: adminId }).catch(() => {});
    if (testProduct) await Product.deleteOne({ _id: testProduct._id }).catch(() => {});
    if (deliveredOrder) await Order.deleteOne({ _id: deliveredOrder._id }).catch(() => {});
    if (undeliveredOrder) await Order.deleteOne({ _id: undeliveredOrder._id }).catch(() => {});
    if (createdReviewId) await Review.deleteOne({ _id: createdReviewId }).catch(() => {});
    server.close();
    await mongoose.disconnect();
  }

  console.log(`\n=================================================`);
  console.log(`Rating & Review E2E Tests: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) process.exit(1);
}

testReviewE2E().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
