/**
 * End-to-End Comprehensive Verification Test for Return & Refund System
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const crypto = require("crypto");
const http = require("http");
const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { connectDatabase } = require("../config/database");
const db = require("../database/db");
const app = require("../app");
const Product = require("../models/Product");
const Order = require("../models/Order");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Return = require("../models/Return");

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`[Test Server] Running on ${baseUrl}`);
      resolve();
    });
  });
}

async function closeServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

let testIndex = 0;
let passedCount = 0;
let failedCount = 0;

async function testStep(name, fn) {
  testIndex++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${testIndex}. ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${testIndex}. ${name}: ${err.message}`);
    failedCount++;
  }
}

async function runSuite() {
  console.log("=================================================");
  console.log("Running Return & Refund Full E2E Verification Suite");
  console.log("=================================================");

  await connectDatabase();
  await startServer();

  try {
    const timestamp = Date.now();
    const customerEmail = `ret_customer_${timestamp}@gmail.com`;
    const otherCustomerEmail = `ret_other_${timestamp}@gmail.com`;
    const password = "Password@123";

    let customerToken = "";
    let customerId = "";
    let otherCustomerToken = "";
    let otherCustomerId = "";
    let adminToken = "";
    let adminUser = null;

    let testProduct1 = null;
    let testProduct2 = null;
    let initialStockProd1 = 50;

    let onlineDeliveredOrder = null;
    let codDeliveredOrder = null;
    let otherUserOrder = null;

    let returnRequestId1 = "";
    let returnRequestId2 = "";

    // 1. Auth Setup
    await testStep("Register customer, secondary customer, and generate admin token", async () => {
      // Customer 1
      const res1 = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Return Customer",
          email: customerEmail,
          mobile: `+9198${String(timestamp).slice(-8)}`,
          password,
          confirmPassword: password
        })
      });
      const d1 = await res1.json();
      if (res1.status !== 201) throw new Error(`Customer 1 register failed: ${JSON.stringify(d1)}`);
      customerToken = d1.token;
      customerId = String(d1.user?._id || d1.user?.id);

      // Other Customer
      const res2 = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Other Customer",
          email: otherCustomerEmail,
          mobile: `+9197${String(timestamp).slice(-8)}`,
          password,
          confirmPassword: password
        })
      });
      const d2 = await res2.json();
      if (res2.status !== 201) throw new Error(`Customer 2 register failed: ${JSON.stringify(d2)}`);
      otherCustomerToken = d2.token;
      otherCustomerId = String(d2.user?._id || d2.user?.id);

      // Admin user directly in DB
      adminUser = await User.create({
        name: "Store Admin Returns",
        email: `admin_returns_${timestamp}@gmail.com`,
        mobile: `+9196${String(timestamp).slice(-8)}`,
        password: "hashedpassword123",
        role: "admin",
        active: true
      });
      adminToken = jwt.sign({ userId: adminUser._id }, env.JWT_SECRET);

      if (!customerToken || !adminToken) throw new Error("Failed to authenticate test actors");
    });

    // 2. Products Setup
    await testStep("Create test products with tracked inventory", async () => {
      testProduct1 = await Product.create({
        name: `Conscious Emerald Ring ${timestamp}`,
        sku: `SKU-RING-${timestamp}`,
        price: 2500,
        stock: initialStockProd1,
        active: true,
        category: "Rings",
        description: "Genuine energized emerald ring",
        isReturnable: true,
        isReplaceable: true,
        returnWindowDays: 14
      });

      testProduct2 = await Product.create({
        name: `Energized Rudraksha Mala ${timestamp}`,
        sku: `SKU-MALA-${timestamp}`,
        price: 1200,
        stock: 30,
        active: true,
        category: "Malas",
        description: "Authentic Himalayan 5 mukhi rudraksha",
        isReturnable: true,
        isReplaceable: true,
        returnWindowDays: 14
      });

      if (!testProduct1 || !testProduct2) throw new Error("Failed to create products");
    });

    // 3. Orders Setup (Delivered Orders)
    await testStep("Create Delivered Orders for online payment, COD, and other customer", async () => {
      const prod1Id = String(testProduct1.id || testProduct1._id);
      const prod2Id = String(testProduct2.id || testProduct2._id);

      const shipAddr = {
        fullName: "Return Customer",
        mobile: "9876543210",
        address: "Ashram Road",
        city: "Haridwar",
        state: "UK",
        postalCode: "249401",
        country: "India"
      };

      // Order 1: Online paid delivered order
      onlineDeliveredOrder = await Order.create({
        orderNumber: `ORD-${timestamp}-ONL`,
        user: customerId,
        items: [
          {
            product: prod1Id,
            name: testProduct1.name,
            quantity: 2,
            price: 2500
          }
        ],
        shippingAddress: shipAddr,
        total: 5000,
        subtotal: 5000,
        status: "delivered",
        paymentStatus: "paid",
        paymentMethod: "Razorpay",
        deliveredAt: new Date()
      });

      // Record simulated payment
      await Payment.create({
        order: onlineDeliveredOrder._id,
        user: customerId,
        amount: 5000,
        provider: "razorpay",
        transactionId: `pay_test_${timestamp}`,
        status: "paid"
      });

      // Order 2: COD delivered order
      codDeliveredOrder = await Order.create({
        orderNumber: `ORD-${timestamp}-COD`,
        user: customerId,
        items: [
          {
            product: prod2Id,
            name: testProduct2.name,
            quantity: 1,
            price: 1200
          }
        ],
        shippingAddress: shipAddr,
        total: 1200,
        subtotal: 1200,
        status: "delivered",
        paymentStatus: "paid",
        paymentMethod: "COD",
        deliveredAt: new Date()
      });

      await Payment.create({
        order: codDeliveredOrder._id,
        user: customerId,
        amount: 1200,
        provider: "cod",
        transactionId: `cod_receipt_${timestamp}`,
        status: "paid"
      });

      // Order 3: Other customer's delivered order
      otherUserOrder = await Order.create({
        orderNumber: `ORD-${timestamp}-OTH`,
        user: otherCustomerId,
        items: [
          {
            product: prod1Id,
            name: testProduct1.name,
            quantity: 1,
            price: 2500
          }
        ],
        shippingAddress: shipAddr,
        total: 2500,
        subtotal: 2500,
        status: "delivered",
        paymentStatus: "paid",
        paymentMethod: "Online",
        deliveredAt: new Date()
      });

      if (!onlineDeliveredOrder || !codDeliveredOrder) throw new Error("Failed to create delivered test orders");
    });

    // 4. Evidence Image Upload Endpoint
    let uploadedImageObj = null;
    await testStep("Upload product evidence image to /api/returns/upload-evidence (PostgreSQL BYTEA)", async () => {
      const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const boundary = "---------------------------" + Date.now().toString(16);
      let body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="evidence"; filename="damaged_ring.png"\r\nContent-Type: image/png\r\n\r\n`
        ),
        pngBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ]);

      const res = await fetch(`${baseUrl}/api/returns/upload-evidence`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${customerToken}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body
      });

      const data = await res.json();
      if (res.status !== 201) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data.images) || data.images.length === 0) throw new Error("No images returned from upload");
      uploadedImageObj = data.images[0];
      if (!uploadedImageObj.url) throw new Error("Uploaded image URL missing");
    });

    // 5. Validation: Require valid evidence image in browser context
    await testStep("Require valid evidence image before submitting return request", async () => {
      const res = await fetch(`${baseUrl}/api/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          orderId: String(onlineDeliveredOrder.id || onlineDeliveredOrder._id),
          reason: "Product damaged",
          items: [{ product: String(testProduct1.id || testProduct1._id), quantity: 1 }],
          evidenceImages: []
        })
      });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const data = await res.json();
      if (!data.message.toLowerCase().includes("evidence")) throw new Error(`Unexpected error message: ${data.message}`);
    });

    // 6. Security: Prevent returning another customer's order
    await testStep("Prevent customer from returning an order owned by someone else", async () => {
      const res = await fetch(`${baseUrl}/api/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          orderId: String(otherUserOrder.id || otherUserOrder._id),
          reason: "Wrong product received",
          items: [{ product: String(testProduct1.id || testProduct1._id), quantity: 1 }],
          evidenceImages: [uploadedImageObj]
        })
      });

      if (res.status !== 403 && res.status !== 404) throw new Error(`Expected 403/404, got ${res.status}`);
    });

    // 7. Successful Return Submission
    await testStep("Submit valid return request with evidence images and items", async () => {
      const res = await fetch(`${baseUrl}/api/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          orderId: String(onlineDeliveredOrder.id || onlineDeliveredOrder._id),
          reason: "Product damaged",
          comments: "Band has hairline crack on arrival",
          type: "return",
          items: [{ product: String(testProduct1.id || testProduct1._id), quantity: 1 }],
          evidenceImages: [uploadedImageObj]
        })
      });

      const data = await res.json();
      if (res.status !== 201) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      returnRequestId1 = String(data.return?._id || data.return?.id || data._id || data.id);
      const retStatus = data.return?.status || data.status;
      const refundAmt = Number(data.return?.refundAmount || data.refundAmount);

      if (!returnRequestId1 || returnRequestId1 === "undefined") throw new Error("Missing return ID in response");
      if (retStatus !== "Requested") throw new Error(`Expected status Requested, got ${retStatus}`);
      if (refundAmt !== 2500) {
        throw new Error(`Expected refundAmount 2500, got ${refundAmt}`);
      }
    });

    // 8. Prevent duplicate return request for the same delivered order
    await testStep("Prevent duplicate return request on the same order item", async () => {
      const res = await fetch(`${baseUrl}/api/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          orderId: String(onlineDeliveredOrder.id || onlineDeliveredOrder._id),
          reason: "Trying duplicate return",
          items: [{ product: String(testProduct1.id || testProduct1._id), quantity: 1 }],
          evidenceImages: [uploadedImageObj]
        })
      });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const data = await res.json();
      if (!data.message.toLowerCase().includes("active") && !data.message.toLowerCase().includes("already")) {
        throw new Error(`Unexpected msg: ${data.message}`);
      }
    });

    // 9. Customer Fetches own return requests
    await testStep("Customer fetches return status via /api/returns/my-requests", async () => {
      const res = await fetch(`${baseUrl}/api/returns/my-requests`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!Array.isArray(data.returns) || data.returns.length === 0) throw new Error("No customer returns returned");
      const found = data.returns.find((r) => String(r.id || r._id) === returnRequestId1);
      if (!found) throw new Error("Submitted return request not found in customer list");
      if (found.status !== "Requested") throw new Error(`Expected Requested, got ${found.status}`);
    });

    // 10. Admin Views & Filters Queue
    await testStep("Admin lists return requests with status filter", async () => {
      const res = await fetch(`${baseUrl}/api/admin/returns?status=Requested`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (!Array.isArray(data.returns)) throw new Error("Expected array of returns");
      const found = data.returns.find((r) => String(r._id || r.id) === returnRequestId1);
      if (!found) throw new Error("Return request not found in admin queue");
    });

    // 11. Submit a second return on COD order to test rejection workflow
    await testStep("Submit a second return on COD order for rejection testing", async () => {
      const res = await fetch(`${baseUrl}/api/returns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          orderId: String(codDeliveredOrder.id || codDeliveredOrder._id),
          reason: "Other",
          comments: "Ordered wrong astrological size",
          items: [{ product: String(testProduct2.id || testProduct2._id), quantity: 1 }],
          evidenceImages: [uploadedImageObj]
        })
      });

      const data = await res.json();
      if (res.status !== 201) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      returnRequestId2 = String(data.return?._id || data.return?.id || data._id || data.id);
    });

    // 12. Rejection without mandatory message is rejected with 400
    await testStep("Admin rejection without explanation message returns 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/admin/returns/${returnRequestId2}/reject`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ adminMessage: "" })
      });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    // 13. Rejection with message succeeds
    await testStep("Admin rejects request with mandatory message (Requested -> Rejected)", async () => {
      const rejectionMsg = "Policy violation: Items modified after receipt cannot be returned.";
      const res = await fetch(`${baseUrl}/api/admin/returns/${returnRequestId2}/reject`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ adminMessage: rejectionMsg })
      });

      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      if (data.return?.status !== "Rejected") throw new Error(`Expected Rejected, got ${data.return?.status}`);
      if (data.return?.rejectionReason !== rejectionMsg) throw new Error(`Rejection reason mismatch: ${data.return?.rejectionReason}`);
    });

    // 14. Cannot process refund on Rejected return
    await testStep("Prevent processing refund on Rejected return request", async () => {
      const res = await fetch(`${baseUrl}/api/admin/returns/${returnRequestId2}/process-refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ refundAmount: 1200 })
      });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const data = await res.json();
      if (!data.message.toLowerCase().includes("rejected")) throw new Error(`Unexpected error message: ${data.message}`);
    });

    // 15. Admin Accepts Return 1 (Requested -> Accepted)
    await testStep("Admin accepts eligible return with calculated refund ceiling (Requested -> Accepted)", async () => {
      const res = await fetch(`${baseUrl}/api/admin/returns/${returnRequestId1}/accept`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          refundAmount: 2500,
          adminMessage: "Return approved. Product package verified."
        })
      });

      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      if (data.return?.status !== "Accepted") throw new Error(`Expected Accepted, got ${data.return?.status}`);
      if (Number(data.return?.refundAmount) !== 2500) throw new Error(`Refund amount mismatch: ${data.return?.refundAmount}`);
    });

    // 16. Stock is NOT prematurely reduced or altered on return submission/acceptance
    await testStep("Verify inventory is NOT altered upon return submission or acceptance", async () => {
      const prod = await Product.findById(testProduct1.id || testProduct1._id);
      if (Number(prod.stock) !== initialStockProd1) {
        throw new Error(`Stock changed unexpectedly! Expected ${initialStockProd1}, got ${prod.stock}`);
      }
    });

    // 17. Admin Processes Online Refund via Gateway
    await testStep("Admin dispatches refund through payment gateway (Accepted -> Processed)", async () => {
      const res = await fetch(`${baseUrl}/api/admin/returns/${returnRequestId1}/process-refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ refundAmount: 2500 })
      });

      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      if (!data.success) throw new Error(`Refund failed: ${data.error}`);
      if (data.status !== "Processed") throw new Error(`Expected Processed, got ${data.status}`);
      if (!data.refundReference) throw new Error("Missing refund reference");

      // Verify transaction recorded in PostgreSQL return_refund_transactions
      const txRows = await db.query("SELECT * FROM return_refund_transactions WHERE return_id = $1", [returnRequestId1]);
      if (txRows.rows.length === 0) throw new Error("No refund transaction record created in PostgreSQL");
    });

    // 18. Idempotency: Prevent duplicate refund disbursement
    await testStep("Idempotency prevents duplicate refund execution on already Processed return", async () => {
      const res = await fetch(`${baseUrl}/api/admin/returns/${returnRequestId1}/process-refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ refundAmount: 2500 })
      });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const data = await res.json();
      if (!data.message.toLowerCase().includes("already")) throw new Error(`Unexpected msg: ${data.message}`);
    });

    // 19. Inventory Restocking post physical inspection
    await testStep("Restock returned product units into inventory post inspection", async () => {
      const res = await fetch(`${baseUrl}/api/admin/returns/${returnRequestId1}/restock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        }
      });

      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      if (!data.success) throw new Error("Restock call failed");

      // Verify stock in PostgreSQL increased by 1 (the returned quantity)
      const prod = await Product.findById(testProduct1.id || testProduct1._id);
      const expectedStock = initialStockProd1 + 1;
      if (Number(prod.stock) !== expectedStock) {
        throw new Error(`Expected stock ${expectedStock}, got ${prod.stock}`);
      }
    });

    // 20. Prevent duplicate inventory restocking
    await testStep("Prevent duplicate restocking on the same return request", async () => {
      const res = await fetch(`${baseUrl}/api/admin/returns/${returnRequestId1}/restock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        }
      });

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const data = await res.json();
      if (!data.message.toLowerCase().includes("already")) throw new Error(`Unexpected msg: ${data.message}`);
    });

    // 21. Admin sends direct message to customer
    await testStep("Admin sends message to customer visible in customer panel", async () => {
      const res = await fetch(`${baseUrl}/api/admin/returns/${returnRequestId1}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ message: "Thank you for shopping with Astro Nirvan. Your refund is settled." })
      });

      const data = await res.json();
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(data)}`);
      if (!data.success) throw new Error("Message send failed");

      // Verify customer sees it
      const custRes = await fetch(`${baseUrl}/api/returns/${returnRequestId1}`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      const custData = await custRes.json();
      if (!custData.adminMessage.includes("Thank you")) {
        throw new Error(`Customer cannot see admin message: ${custData.adminMessage}`);
      }
    });
  } catch (globalErr) {
    console.error("[Global Suite Error]:", globalErr);
  } finally {
    await closeServer();
    console.log("=================================================");
    console.log(`Return & Refund E2E: ${passedCount} passed, ${failedCount} failed`);
    console.log("=================================================");
    if (failedCount > 0) process.exit(1);
    else process.exit(0);
  }
}

runSuite();
