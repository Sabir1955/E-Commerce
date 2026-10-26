require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const app = require("../app");
const { connectDatabase } = require("../config/database");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Payment = require("../models/Payment");

async function testPhase7() {
  console.log("==========================================");
  console.log("Running Phase 7 Order Management & Inventory Tests");
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

  let customer1Token = "";
  let customer1User = null;
  let customer2Token = "";
  let customer2User = null;
  let adminToken = "";
  let sampleProduct = null;
  let testOrder = null;

  try {
    // 0. Setup test users and seed order
    const timestamp = Date.now();
    const c1Res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Order Customer 1",
        email: `ord_cust1_${timestamp}@example.com`,
        mobile: `+9193${String(timestamp).slice(-8)}`,
        password: "Password@123",
        confirmPassword: "Password@123"
      })
    });
    const c1Data = await c1Res.json();
    customer1Token = c1Data.token;
    customer1User = c1Data.user;

    const c2Res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Order Customer 2",
        email: `ord_cust2_${timestamp}@example.com`,
        mobile: `+9194${String(timestamp).slice(-8)}`,
        password: "Password@123",
        confirmPassword: "Password@123"
      })
    });
    const c2Data = await c2Res.json();
    customer2Token = c2Data.token;
    customer2User = c2Data.user;

    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "astro@gmail.com",
        password: "Astro@12345"
      })
    });
    const adminData = await adminLoginRes.json();
    adminToken = adminData.token;

    sampleProduct = await Product.findOne({ active: true, stock: { $gte: 20 } });
    if (!sampleProduct) {
      throw new Error("Active product with stock >= 20 required for Phase 7 tests");
    }

    // Create a placed order for customer 1
    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customer1Token}`
      },
      body: JSON.stringify({
        items: [{ product: sampleProduct._id.toString(), quantity: 2 }],
        shippingAddress: {
          fullName: "Order Customer 1",
          mobile: "+919876543210",
          address: "77 Spiritual Lane",
          city: "Rishikesh",
          state: "Uttarakhand",
          postalCode: "249201",
          country: "India"
        },
        paymentMethod: "cod"
      })
    });
    const orderBody = await orderRes.json();
    testOrder = orderBody.data?.order || orderBody.order || orderBody.data;

    // 1. GET /api/orders/mine returns paginated customer order history
    await check("1. GET /api/orders/mine returns customer orders history", async () => {
      // Unauthenticated -> 401
      const unauthRes = await fetch(`${baseUrl}/api/orders/mine`);
      if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);

      // Authenticated -> 200
      const res = await fetch(`${baseUrl}/api/orders/mine?status=placed`, {
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const orders = body.data?.orders || body.orders;
      if (!Array.isArray(orders) || orders.length === 0) {
        throw new Error("Expected at least 1 order for customer 1");
      }
      if (orders[0].user !== customer1User._id && orders[0].user?._id !== customer1User._id) {
        throw new Error("Returned order does not match customer 1 user ID");
      }
    });

    // 2. GET /api/orders/:id allows owner and admin, blocks others (404)
    await check("2. GET /api/orders/:id privacy: owner & admin allowed, other customer gets 404", async () => {
      // Owner -> 200
      const ownerRes = await fetch(`${baseUrl}/api/orders/${testOrder._id}`, {
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
      if (ownerRes.status !== 200) throw new Error(`Owner expected 200, got ${ownerRes.status}`);

      // Other customer -> 404
      const otherRes = await fetch(`${baseUrl}/api/orders/${testOrder._id}`, {
        headers: { Authorization: `Bearer ${customer2Token}` }
      });
      if (otherRes.status !== 404) throw new Error(`Other customer expected 404, got ${otherRes.status}`);

      // Admin -> 200
      const adminRes = await fetch(`${baseUrl}/api/orders/${testOrder._id}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (adminRes.status !== 200) throw new Error(`Admin expected 200, got ${adminRes.status}`);
    });

    // 3. GET /api/orders/:id/tracking returns order tracking timeline
    await check("3. GET /api/orders/:id/tracking returns events timeline", async () => {
      const res = await fetch(`${baseUrl}/api/orders/${testOrder._id}/tracking`, {
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const tracking = body.data || body;
      if (!tracking.status || !Array.isArray(tracking.trackingEvents)) {
        throw new Error(`Invalid tracking structure: ${JSON.stringify(tracking)}`);
      }
      if (tracking.status !== "placed") {
        throw new Error(`Expected status placed, got ${tracking.status}`);
      }
    });

    // 4. GET /api/orders/:id/invoice returns PDF document
    await check("4. GET /api/orders/:id/invoice returns PDF invoice file", async () => {
      const res = await fetch(`${baseUrl}/api/orders/${testOrder._id}/invoice`, {
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/pdf")) {
        throw new Error(`Expected application/pdf, got ${contentType}`);
      }
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 50) {
        throw new Error(`PDF invoice appears empty (size: ${buffer.byteLength})`);
      }
    });

    // 5. POST /api/orders/:id/reorder loads past items into active cart
    await check("5. POST /api/orders/:id/reorder populates cart with order items", async () => {
      const res = await fetch(`${baseUrl}/api/orders/${testOrder._id}/reorder`, {
        method: "POST",
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

      const cartRes = await fetch(`${baseUrl}/api/cart`, {
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
      const cartBody = await cartRes.json();
      const cart = cartBody.data?.cart || cartBody.data;
      if (cart.items.length !== 1 || cart.totalQuantity !== 2) {
        throw new Error(`Cart reorder mismatch: ${JSON.stringify(cart)}`);
      }

      // Clear cart after check
      await fetch(`${baseUrl}/api/cart`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
    });

    // 6. POST /api/orders/:id/cancel cancels order and restores product stock
    await check("6. POST /api/orders/:id/cancel cancels order & restores stock", async () => {
      const productBefore = await Product.findById(sampleProduct._id);
      const stockBefore = productBefore.stock;

      const res = await fetch(`${baseUrl}/api/orders/${testOrder._id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({ reason: "Duplicate order placed by mistake" })
      });
      if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Expected 200, got ${res.status}: ${text}`);
      }

      // Check stock restored (+2)
      const productAfter = await Product.findById(sampleProduct._id);
      if (productAfter.stock !== stockBefore + 2) {
        throw new Error(`Stock was not restored! Before=${stockBefore}, After=${productAfter.stock}`);
      }

      // Check order status
      const updatedOrder = await Order.findById(testOrder._id);
      if (updatedOrder.status !== "cancelled") {
        throw new Error(`Expected status cancelled, got ${updatedOrder.status}`);
      }
      const lastEvent = updatedOrder.trackingEvents.slice(-1)[0];
      if (lastEvent.status !== "cancelled" || !lastEvent.description.includes("Duplicate order")) {
        throw new Error(`Tracking event missing: ${JSON.stringify(lastEvent)}`);
      }
    });

    // 7. POST /api/orders/:id/cancel on already cancelled order returns 409
    await check("7. POST /api/orders/:id/cancel on already cancelled order rejects with 409", async () => {
      const res = await fetch(`${baseUrl}/api/orders/${testOrder._id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({ reason: "Cancel again" })
      });
      if (res.status !== 409) throw new Error(`Expected 409 Conflict, got ${res.status}`);
    });

    // 8. GET /api/orders (admin) lists orders with search & status filters, blocks non-admin (403)
    await check("8. GET /api/orders (admin) lists orders with search/filter, non-admin gets 403", async () => {
      // Non-admin -> 403
      const nonAdminRes = await fetch(`${baseUrl}/api/orders`, {
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
      if (nonAdminRes.status !== 403) throw new Error(`Expected 403 for non-admin, got ${nonAdminRes.status}`);

      // Admin -> 200
      const adminRes = await fetch(`${baseUrl}/api/orders?search=Rishikesh&status=cancelled`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (adminRes.status !== 200) throw new Error(`Expected 200 for admin, got ${adminRes.status}`);
      const body = await adminRes.json();
      const orders = body.data?.orders || body.orders;
      if (!Array.isArray(orders) || orders.length === 0) {
        throw new Error("Expected to find cancelled Rishikesh order");
      }
    });

    // 9. PATCH /api/orders/:id/status updates status lifecycle, rejects invalid transitions
    await check("9. PATCH /api/orders/:id/status updates lifecycle & enforces business rules", async () => {
      // Create a new order to test progressive status transitions
      const freshOrderRes = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({
          items: [{ product: sampleProduct._id.toString(), quantity: 1 }],
          shippingAddress: {
            fullName: "Order Tester",
            mobile: "+919876543210",
            address: "108 Ganga Marg",
            city: "Varanasi",
            state: "Uttar Pradesh",
            postalCode: "221001",
            country: "India"
          },
          paymentMethod: "cod"
        })
      });
      const freshOrderBody = await freshOrderRes.json();
      const order = freshOrderBody.data?.order || freshOrderBody.order || freshOrderBody.data;

      // 9a. Non-admin gets 403
      const nonAdminRes = await fetch(`${baseUrl}/api/orders/${order._id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer1Token}`
        },
        body: JSON.stringify({ status: "processing" })
      });
      if (nonAdminRes.status !== 403) throw new Error(`Expected 403 for customer, got ${nonAdminRes.status}`);

      // 9b. Admin advances: placed -> processing -> shipped
      const pRes = await fetch(`${baseUrl}/api/orders/${order._id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: "processing", note: "Packaging astrologer-blessed items" })
      });
      if (pRes.status !== 200) throw new Error(`Expected 200 for processing, got ${pRes.status}`);

      const sRes = await fetch(`${baseUrl}/api/orders/${order._id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: "shipped", note: "Dispatched with BlueDart" })
      });
      if (sRes.status !== 200) throw new Error(`Expected 200 for shipped, got ${sRes.status}`);

      // 9c. Shipped order cannot be cancelled (returns 409)
      const cancelShippedRes = await fetch(`${baseUrl}/api/orders/${order._id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: "cancelled" })
      });
      if (cancelShippedRes.status !== 409) {
        throw new Error(`Expected 409 cancelling shipped order, got ${cancelShippedRes.status}`);
      }

      // Cleanup
      await Order.deleteOne({ _id: order._id });
    });

    // 10. PATCH /api/orders/:id/payment updates payment status
    await check("10. PATCH /api/orders/:id/payment updates payment status", async () => {
      const res = await fetch(`${baseUrl}/api/orders/${testOrder._id}/payment`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: "refunded", transactionId: "rfnd_manual_99" })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const payment = body.data?.payment || body.data;
      if (payment.status !== "refunded") {
        throw new Error(`Expected status refunded, got ${payment.status}`);
      }
    });

    // 11. GET /api/inventory lists products with stock, filters by lowStock / outOfStock
    await check("11. GET /api/inventory lists inventory with filters, non-admin gets 403", async () => {
      // Non-admin -> 403
      const nonAdminRes = await fetch(`${baseUrl}/api/inventory`, {
        headers: { Authorization: `Bearer ${customer1Token}` }
      });
      if (nonAdminRes.status !== 403) throw new Error(`Expected 403, got ${nonAdminRes.status}`);

      // Admin -> 200
      const adminRes = await fetch(`${baseUrl}/api/inventory?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (adminRes.status !== 200) throw new Error(`Expected 200, got ${adminRes.status}`);
      const body = await adminRes.json();
      const products = body.data?.products || body.products;
      if (!Array.isArray(products) || products.length === 0) {
        throw new Error("Expected products array from inventory endpoint");
      }
      if (products[0].stock === undefined) {
        throw new Error("Product in inventory missing stock field");
      }
    });

    // 12. PATCH /api/inventory/:id and POST /api/inventory/:id/adjust manage stock safely
    await check("12. Inventory stock update & adjust operations prevent negative inventory", async () => {
      const initialStock = sampleProduct.stock;

      // 12a. Set exact stock to 35
      const patchRes = await fetch(`${baseUrl}/api/inventory/${sampleProduct._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ quantity: 35 })
      });
      if (patchRes.status !== 200) throw new Error(`Expected 200 for stock update, got ${patchRes.status}`);
      const patchBody = await patchRes.json();
      if ((patchBody.data?.stock || patchBody.stock) !== 35) {
        throw new Error("Stock did not update to 35");
      }

      // 12b. Adjust stock by +5 -> 40
      const addRes = await fetch(`${baseUrl}/api/inventory/${sampleProduct._id}/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ amount: 5 })
      });
      if (addRes.status !== 200) throw new Error(`Expected 200 for stock adjust, got ${addRes.status}`);
      const addBody = await addRes.json();
      if ((addBody.data?.stock || addBody.stock) !== 40) {
        throw new Error("Stock did not adjust to 40");
      }

      // 12c. Adjust stock by -100 (which would make stock negative) -> rejects with 400
      const badReduceRes = await fetch(`${baseUrl}/api/inventory/${sampleProduct._id}/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ amount: -100 })
      });
      if (badReduceRes.status !== 400) {
        throw new Error(`Expected 400 for negative stock adjust, got ${badReduceRes.status}`);
      }

      // Restore stock to initial
      await Product.findByIdAndUpdate(sampleProduct._id, { stock: initialStock });
    });

  } finally {
    // Cleanup
    if (customer1User) {
      await User.deleteOne({ _id: customer1User._id });
      await Cart.deleteOne({ user: customer1User._id });
      await Order.deleteMany({ user: customer1User._id });
    }
    if (customer2User) {
      await User.deleteOne({ _id: customer2User._id });
      await Order.deleteMany({ user: customer2User._id });
    }
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
  }

  console.log("\n==========================================");
  console.log(`Phase 7 Tests Complete: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  testPhase7().catch((err) => {
    console.error("Test runner failed:", err);
    process.exit(1);
  });
}

module.exports = { testPhase7 };
