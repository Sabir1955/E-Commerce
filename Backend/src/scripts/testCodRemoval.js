require("dotenv").config();
const http = require("http");
const app = require("../app");
const { connectDatabase, disconnectDatabase } = require("../config/database");
const Order = require("../models/Order");
const User = require("../models/User");
const Product = require("../models/Product");

async function testCodRemoval() {
  console.log("===============================================================");
  console.log("Running COD Removal & Online Payment Verification Test Suite");
  console.log("===============================================================\n");

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

  try {
    // Setup test customer user
    let testUser = await User.findOne({ email: "cod_test_customer@example.com" });
    if (!testUser) {
      testUser = await User.create({
        name: "Test Devotee",
        email: "cod_test_customer@example.com",
        password: "Password123!",
        role: "customer",
        mobile: "+919876543210"
      });
    }

    const jwt = require("jsonwebtoken");
    const { env } = require("../config/env");
    const token = jwt.sign(
      { userId: String(testUser._id), role: testUser.role, email: testUser.email },
      env.JWT_SECRET || process.env.JWT_SECRET || "default_jwt_secret_dev_key",
      { expiresIn: "1h" }
    );
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };

    // Find or create test product
    let product = await Product.findOne({ active: true });
    if (!product) {
      product = await Product.create({
        name: "Test Consecrated Yantra",
        price: 1100,
        stock: 50,
        active: true,
        category: "Sacred Yantras"
      });
    }

    const validAddress = {
      fullName: "Test Customer",
      mobile: "+919876543210",
      address: "108 Vedic Enclave",
      city: "Varanasi",
      state: "Uttar Pradesh",
      postalCode: "221001",
      country: "India"
    };

    // 1. Direct Payment API rejects paymentMethod: "cod"
    await check("1. POST /api/payments/create-order with paymentMethod='cod' returns 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: product._id, quantity: 1 }],
          paymentMethod: "cod"
        })
      });
      if (res.status !== 400) {
        throw new Error(`Expected status 400, got ${res.status}`);
      }
      const data = await res.json();
      if (!data.message || !data.message.toLowerCase().includes("cash on delivery")) {
        throw new Error(`Expected rejection message for Cash on Delivery, got: ${data.message}`);
      }
    });

    // 2. Direct Payment API rejects gateway: "cod"
    await check("2. POST /api/payments/create-order with gateway='cod' returns 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: product._id, quantity: 1 }],
          gateway: "cod"
        })
      });
      if (res.status !== 400) {
        throw new Error(`Expected status 400, got ${res.status}`);
      }
    });

    // 3. Authenticated Order Placement API rejects paymentMethod: "cod"
    await check("3. POST /api/orders with paymentMethod='cod' returns 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          items: [{ product: product._id, quantity: 1 }],
          shippingAddress: validAddress,
          paymentMethod: "cod"
        })
      });
      if (res.status !== 400) {
        throw new Error(`Expected status 400, got ${res.status}`);
      }
      const data = await res.json();
      if (!data.message || !data.message.toLowerCase().includes("cash on delivery")) {
        throw new Error(`Expected error message to mention Cash on Delivery, got: ${data.message}`);
      }
    });

    // 4. Authenticated Order Placement API rejects paymentMethod: "cash_on_delivery"
    await check("4. POST /api/orders with paymentMethod='cash_on_delivery' returns 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          items: [{ product: product._id, quantity: 1 }],
          shippingAddress: validAddress,
          paymentMethod: "cash_on_delivery"
        })
      });
      if (res.status !== 400) {
        throw new Error(`Expected status 400, got ${res.status}`);
      }
    });

    // 5. Successful Order Placement using online payment method
    let onlineOrderId = null;
    await check("5. POST /api/orders with paymentMethod='online' succeeds with awaiting_payment status", async () => {
      const res = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          items: [{ product: product._id, quantity: 1 }],
          shippingAddress: validAddress,
          paymentMethod: "online"
        })
      });
      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Expected status 201, got ${res.status}: ${text}`);
      }
      const data = await res.json();
      const order = data.order || data.data?.order || data.data;
      if (!order || !order._id) throw new Error("Order was not returned in response");
      if (order.status !== "awaiting_payment") {
        throw new Error(`Expected order status 'awaiting_payment', got '${order.status}'`);
      }
      if (order.paymentStatus !== "pending") {
        throw new Error(`Expected paymentStatus 'pending', got '${order.paymentStatus}'`);
      }
      onlineOrderId = order._id;
    });

    // 6. Online Payment initiation rejects COD method
    if (onlineOrderId) {
      await check("6. POST /api/payments/:orderId/initiate with method='cod' returns 400 Bad Request", async () => {
        const res = await fetch(`${baseUrl}/api/payments/${onlineOrderId}/initiate`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ method: "cod" })
        });
        if (res.status !== 400) {
          throw new Error(`Expected 400, got ${res.status}`);
        }
      });

      await check("7. POST /api/payments/:orderId/razorpay with method='cod' returns 400 Bad Request", async () => {
        const res = await fetch(`${baseUrl}/api/payments/${onlineOrderId}/razorpay`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ method: "cod" })
        });
        if (res.status !== 400) {
          throw new Error(`Expected 400, got ${res.status}`);
        }
      });
    }

    // 8. Historical Order Preservation: Verify historical COD order remains intact and accessible
    await check("8. Historical order with paymentMethod='COD' preserves data and generates invoice", async () => {
      // Find or insert a mock historical COD order
      let historicalOrder = await Order.findOne({ paymentMethod: { $in: ["cod", "COD"] } });
      if (!historicalOrder) {
        historicalOrder = await Order.create({
          user: testUser._id,
          orderNumber: `ORD-HISTORICAL-${Date.now()}`,
          items: [{ product: product._id, name: product.name, price: product.price, quantity: 1 }],
          subtotal: product.price,
          total: product.price,
          shippingAddress: validAddress,
          status: "delivered",
          paymentStatus: "paid",
          paymentMethod: "COD"
        });
      }

      const getRes = await fetch(`${baseUrl}/api/orders/${historicalOrder._id}`, {
        headers: authHeaders
      });
      if (getRes.status !== 200) {
        throw new Error(`Expected 200 for historical order, got ${getRes.status}`);
      }
      const data = await getRes.json();
      const order = data.order || data.data?.order || data.data;
      if (!order || !["cod", "COD"].includes(order.paymentMethod)) {
        throw new Error(`Expected historical paymentMethod to remain COD/cod, got: ${order?.paymentMethod}`);
      }

      // Check invoice endpoint
      const invRes = await fetch(`${baseUrl}/api/orders/${historicalOrder._id}/invoice`, {
        headers: authHeaders
      });
      if (invRes.status !== 200) {
        throw new Error(`Expected 200 for invoice, got ${invRes.status}`);
      }
      const contentType = invRes.headers.get("content-type") || "";
      if (!contentType.includes("application/pdf")) {
        throw new Error(`Expected PDF invoice, got: ${contentType}`);
      }
    });

    console.log(`\n===============================================================`);
    console.log(`COD Removal Tests Completed: ${passed} passed, ${failed} failed`);
    console.log(`===============================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

testCodRemoval().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
