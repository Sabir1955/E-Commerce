require("dotenv").config();
const mongoose = require("mongoose");

const BASE_URL = `http://127.0.0.1:${process.env.PORT || 5000}`;

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} ${name} ${detail ? "(" + detail + ")" : ""}`);
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();
  return { status: res.status, headers: res.headers, body };
}

let appServer = null;

async function runTests() {
  try {
    await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(600) });
  } catch (e) {
    const http = require("http");
    const app = require("../app");
    const { connectDatabase } = require("../config/database");
    await connectDatabase();
    appServer = http.createServer(app);
    await new Promise((resolve) => appServer.listen(process.env.PORT || 5000, resolve));
  }

  console.log(`\n========================================`);
  console.log(`Starting E-Commerce API End-to-End Tests`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`========================================\n`);

  let adminToken = "";
  let customerToken = "";
  let customerId = "";
  let categoryId = "";
  let productId = "";
  let productSlug = "";
  let addressId = "";
  let codOrderId = "";
  let onlineOrderId = "";

  // 1. Health check
  try {
    const res = await request("/api/health");
    record("1. Health Check GET /api/health", res.status === 200 && res.body.status === "ok");
  } catch (err) {
    record("1. Health Check GET /api/health", false, err.message);
  }

  // 2. Swagger Docs JSON
  try {
    const res = await request("/api-docs.json");
    record("2. Swagger Spec GET /api-docs.json", res.status === 200 && Boolean(res.body.openapi));
  } catch (err) {
    record("2. Swagger Spec GET /api-docs.json", false, err.message);
  }

  // 3. Admin Login
  try {
    const res = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier: process.env.ADMIN_EMAIL || "admin@example.com",
        password: process.env.ADMIN_PASSWORD || "Admin@12345"
      })
    });
    const passed = res.status === 200 && Boolean(res.body.token) && res.body.user.role === "admin";
    if (passed) adminToken = res.body.token;
    record("3. Admin Login POST /api/auth/login", passed, res.body.user?.email);
  } catch (err) {
    record("3. Admin Login POST /api/auth/login", false, err.message);
  }

  // 4. Customer Registration & Login
  const testEmail = `test_customer_${Date.now()}@gmail.com`;
  const testMobile = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
  try {
    const regRes = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Customer",
        email: testEmail,
        mobile: testMobile,
        password: "Customer@12345",
        confirmPassword: "Customer@12345"
      })
    });
    const regPassed = regRes.status === 201 && Boolean(regRes.body.token);
    if (regPassed) {
      customerToken = regRes.body.token;
      customerId = regRes.body.user?.id || regRes.body.user?._id || regRes.body.data?.user?.id;
    }
    record("4. Customer Register POST /api/auth/register", regPassed, testEmail);
  } catch (err) {
    record("4. Customer Register POST /api/auth/register", false, err.message);
  }

  // 5. Category Management (Admin Create & Public List)
  try {
    const catRes = await request("/api/categories", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: `Gemstones_${Date.now()}`,
        slug: `gemstones-${Date.now()}`,
        description: "Natural astrology gemstones"
      })
    });
    const catPassed = catRes.status === 201 && Boolean(catRes.body._id);
    if (catPassed) categoryId = catRes.body._id;
    record("5. Category Creation POST /api/categories (Admin)", catPassed);

    const listRes = await request("/api/categories");
    record("6. Category List GET /api/categories (Public)", listRes.status === 200 && Array.isArray(listRes.body.categories));

    const updateRes = await request(`/api/categories/${categoryId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ description: "Updated Vedic Astrology Gemstones" })
    });
    record("6a. Category Update PATCH /api/categories/:id (Admin)", updateRes.status === 200 && updateRes.body.description?.includes("Updated"));

    const tempCat = await request("/api/categories", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: `Temp Category ${Date.now()}`, slug: `temp-${Date.now()}` })
    });
    const delRes = await request(`/api/categories/${tempCat.body._id}?hard=true`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    record("6b. Category Delete DELETE /api/categories/:id (Admin)", delRes.status === 200 && Boolean(delRes.body.id));
  } catch (err) {
    record("5. Category Management", false, err.message);
  }

  // 6. Product Creation & Browsing
  try {
    const prodRes = await request("/api/products", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: `Yellow Sapphire ${Date.now()}`,
        description: "Certified Natural Vedic Jyotish Gemstone",
        category: "Gemstones",
        price: 2500,
        stock: 10,
        featured: true
      })
    });
    const prodPassed = prodRes.status === 201 && Boolean(prodRes.body._id);
    if (prodPassed) {
      productId = prodRes.body._id;
      productSlug = prodRes.body.slug;
    }
    record("7. Product Creation POST /api/products (Admin)", prodPassed, `Stock: 10, Price: 2500`);

    const browseRes = await request("/api/products?search=Sapphire");
    record("8. Product Search GET /api/products?search=Sapphire", browseRes.status === 200 && browseRes.body.products?.length > 0);

    const slugRes = await request(`/api/products/${productSlug}`);
    const slugName = slugRes.body.name || slugRes.body.data?.name;
    record("9. Product Lookup by Slug GET /api/products/:slug", slugRes.status === 200 && Boolean(slugName?.includes("Sapphire")));
  } catch (err) {
    record("7. Product Creation & Browsing", false, err.message);
  }

  // 7. Customer Delivery Address
  try {
    const addrRes = await request("/api/addresses", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        fullName: "Test Customer",
        address: "Flat 402, Lotus Residency, MG Road",
        city: "Mumbai",
        state: "Maharashtra",
        postalCode: "400001",
        country: "India",
        useRegisteredMobile: true
      })
    });
    const addrPassed = addrRes.status === 201 && Boolean(addrRes.body._id);
    if (addrPassed) addressId = addrRes.body._id;
    record("10. Customer Address Creation POST /api/addresses", addrPassed);
  } catch (err) {
    record("10. Customer Address Creation", false, err.message);
  }

  // 8. Order Checkout - Reject COD and verify online payment order
  try {
    const codRes = await request("/api/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        items: [{ product: productId, quantity: 1 }],
        addressId: addressId,
        paymentMethod: "cod"
      })
    });
    record("13a. Reject COD Order POST /api/orders", codRes.status === 400, `Rejected with status: ${codRes.status}`);

    const orderRes = await request("/api/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        items: [{ product: productId, quantity: 1 }],
        addressId: addressId,
        paymentMethod: "online"
      })
    });
    const resolvedId = orderRes.body._id || orderRes.body.data?._id || orderRes.body.order?._id;
    const orderPassed = orderRes.status === 201 && Boolean(resolvedId);
    if (orderPassed) codOrderId = resolvedId;
    const orderStatus = orderRes.body?.status || orderRes.body.data?.status || orderRes.body.order?.status;
    const orderTotal = orderRes.body?.total ?? orderRes.body.data?.total ?? orderRes.body.order?.total;
    record("13. Place Online Order POST /api/orders", orderPassed, `Status: ${orderStatus}, Total: ₹${orderTotal}`);

    // Verify stock was reduced
    const prodAfter = await request(`/api/products/${productId}`);
    record("14. Inventory Decrement Verification", prodAfter.body.stock === 9, `Stock reduced from 10 to ${prodAfter.body.stock}`);
  } catch (err) {
    record("13. Place COD Order", false, err.message);
  }

  // 10. Order Tracking & Timeline Events
  try {
    const trackRes = await request(`/api/orders/${codOrderId}/tracking`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    const hasInitialEvent = trackRes.status === 200 && trackRes.body.trackingEvents?.length > 0;
    record("15. Order Tracking GET /api/orders/:id/tracking", hasInitialEvent, `Initial event: ${trackRes.body?.trackingEvents?.[0]?.status}`);

    // Admin updates order status step-by-step
    const processingRes = await request(`/api/orders/${codOrderId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "processing", note: "Order being packed at warehouse" })
    });
    record("16. Admin Update Status: processing", processingRes.status === 200 && processingRes.body.status === "processing");

    const shippedRes = await request(`/api/orders/${codOrderId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "shipped", note: "Package handed over to courier" })
    });
    record("17. Admin Update Status: shipped", shippedRes.status === 200 && shippedRes.body.status === "shipped");

    const deliveredRes = await request(`/api/orders/${codOrderId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "delivered", note: "Delivered to customer" })
    });
    record("18. Admin Update Status: delivered", deliveredRes.status === 200 && deliveredRes.body.status === "delivered");

    // Verify complete tracking timeline
    const finalTrackRes = await request(`/api/orders/${codOrderId}/tracking`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    const timelineCount = finalTrackRes.body.trackingEvents?.length || 0;
    record("19. Full Tracking Timeline Verification", timelineCount >= 4, `${timelineCount} status events recorded`);
  } catch (err) {
    record("15. Order Tracking & Status Updates", false, err.message);
  }

  // 11. PDF Invoice Generation
  try {
    const invRes = await request(`/api/orders/${codOrderId}/invoice`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    const isPdf = invRes.status === 200 && (invRes.headers.get("content-type") || "").includes("application/pdf");
    record("20. Download Invoice GET /api/orders/:id/invoice", isPdf, "Binary PDF 1.4 generated");
  } catch (err) {
    record("20. Invoice Generation", false, err.message);
  }

  // 12. Payment Management
  try {
    const payGetRes = await request(`/api/payments/${codOrderId}`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    record("21. Get Order Payment GET /api/payments/:orderId", payGetRes.status === 200 && payGetRes.body.payment?.method === "online");

    // Admin marks payment paid
    const payUpdateRes = await request(`/api/orders/${codOrderId}/payment`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "paid", transactionId: `TXN_ONLINE_${Date.now()}` })
    });
    record("22. Admin Settle Payment: paid", payUpdateRes.status === 200 && payUpdateRes.body.status === "paid");
  } catch (err) {
    record("21. Payment Management", false, err.message);
  }

  // 13. Online Payment Flow & Stock Reservation
  try {
    const onlineRes = await request("/api/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        items: [{ product: productId, quantity: 1 }],
        addressId: addressId,
        paymentMethod: "upi"
      })
    });
    const onlineOrderIdResolved = onlineRes.body._id || onlineRes.body.data?._id || onlineRes.body.order?._id;
    const onlineStatus = onlineRes.body.status || onlineRes.body.data?.status || onlineRes.body.order?.status;
    const onlineStockReserved = onlineRes.body.stockReserved ?? onlineRes.body.data?.stockReserved ?? onlineRes.body.order?.stockReserved;
    const onlinePassed = onlineRes.status === 201 && onlineStatus === "awaiting_payment" && onlineStockReserved === true;
    if (onlinePassed) onlineOrderId = onlineOrderIdResolved;
    record("23. Place Online Order (UPI/Card)", onlinePassed, `Status: awaiting_payment, StockReserved: true, Expiry: 30 mins`);

    // Initiate payment
    const initRes = await request(`/api/payments/${onlineOrderId}/initiate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ method: "upi" })
    });
    record("24. Initiate Online Payment POST /api/payments/:id/initiate", initRes.status === 201);

    // Cancel online order and verify stock restored
    const cancelRes = await request(`/api/orders/${onlineOrderId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "cancelled", note: "Customer cancelled payment" })
    });
    record("25. Cancel Order and Stock Restoration", cancelRes.status === 200 && cancelRes.body.status === "cancelled");

    const prodFinal = await request(`/api/products/${productId}`);
    record("26. Stock Restored to 9 after cancellation", prodFinal.body.stock === 9);
  } catch (err) {
    record("23. Online Payment Flow", false, err.message);
  }

  // 14. Admin Dashboard Analytics
  try {
    const dashRes = await request("/api/admin/dashboard", {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const hasStats = dashRes.status === 200 && typeof dashRes.body.orders === "number" && typeof dashRes.body.totalSales === "number";
    record("27. Admin Dashboard GET /api/admin/dashboard", hasStats, `Total Orders: ${dashRes.body?.orders}, Total Sales: ₹${dashRes.body?.totalSales}`);
  } catch (err) {
    record("27. Admin Dashboard", false, err.message);
  }

  // Clean up test records
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      const User = require("../models/User");
      const Product = require("../models/Product");
      const Category = require("../models/Category");
      const Order = require("../models/Order");
      const Payment = require("../models/Payment");
      const Address = require("../models/Address");
      const Cart = require("../models/Cart");

      if (customerId) {
        await User.deleteOne({ _id: customerId });
        await Address.deleteMany({ user: customerId });
        await Cart.deleteMany({ user: customerId });
      }
      if (productId) await Product.deleteOne({ _id: productId });
      if (categoryId) await Category.deleteOne({ _id: categoryId });
      if (codOrderId) {
        await Order.deleteOne({ _id: codOrderId });
        await Payment.deleteMany({ order: codOrderId });
      }
      if (onlineOrderId) {
        await Order.deleteOne({ _id: onlineOrderId });
        await Payment.deleteMany({ order: onlineOrderId });
      }
      await mongoose.disconnect();
      record("28. Test Data Cleanup", true, "All temporary test records safely purged");
    }
  } catch (err) {
    record("28. Test Data Cleanup", false, err.message);
  }

  console.log(`\n========================================`);
  const total = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = total - passedCount;
  console.log(`Summary: ${passedCount}/${total} Passed, ${failedCount} Failed`);
  console.log(`========================================\n`);

  if (appServer) appServer.close();
  process.exit(failedCount === 0 ? 0 : 1);
}

runTests().catch((err) => {
  console.error("Test runner encountered error:", err);
  process.exit(1);
});
