require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const app = require("../app");
const { connectDatabase } = require("../config/database");
const User = require("../models/User");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Order = require("../models/Order");

async function testPhase8() {
  console.log("==========================================");
  console.log("Running Phase 8 Admin Dashboard & Operations Tests");
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

  let customerToken = "";
  let customerUser = null;
  let adminToken = "";
  let sampleProduct = null;
  let sampleCategory = null;

  try {
    // 0. Setup a customer and login as admin
    const timestamp = Date.now();
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Admin Dashboard Tester",
        email: `adm_tester_${timestamp}@example.com`,
        mobile: `+9195${String(timestamp).slice(-8)}`,
        password: "Password@123",
        confirmPassword: "Password@123"
      })
    });
    const regData = await regRes.json();
    customerToken = regData.token;
    customerUser = regData.user;

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

    sampleProduct = await Product.findOne({ active: true });
    sampleCategory = await Category.findOne({ active: true });

    // 1. GET /api/admin/dashboard and /api/admin/dashboard/summary return KPI metrics
    await check("1. GET /api/admin/dashboard & /summary return accurate KPIs (403 for non-admin)", async () => {
      // Non-admin -> 403
      const nonAdminRes = await fetch(`${baseUrl}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (nonAdminRes.status !== 403) throw new Error(`Expected 403 for customer, got ${nonAdminRes.status}`);

      // Admin -> 200
      const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200 for admin, got ${res.status}`);
      const body = await res.json();
      const data = body.data || body;
      const expectedKeys = ["products", "categories", "customers", "orders", "pendingOrders", "completedOrders", "outOfStock", "totalSales"];
      for (const k of expectedKeys) {
        if (data[k] === undefined) throw new Error(`Missing expected summary metric: ${k}`);
      }
      if (data.products <= 0 || data.categories <= 0) {
        throw new Error("Expected seeded products and categories counts > 0");
      }

      // Check /summary alias
      const summaryRes = await fetch(`${baseUrl}/api/admin/dashboard/summary`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (summaryRes.status !== 200) throw new Error(`Expected 200 for /summary, got ${summaryRes.status}`);
    });

    // 2. GET /api/admin/dashboard/sales returns aggregated financial analytics
    await check("2. GET /api/admin/dashboard/sales returns sales analytics & monthly data", async () => {
      // Non-admin -> 403
      const nonAdminRes = await fetch(`${baseUrl}/api/admin/dashboard/sales`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (nonAdminRes.status !== 403) throw new Error(`Expected 403 for customer, got ${nonAdminRes.status}`);

      // Admin -> 200
      const res = await fetch(`${baseUrl}/api/admin/dashboard/sales`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const data = body.data || body;
      if (data.totalRevenue === undefined || data.paidOrdersCount === undefined || !Array.isArray(data.salesByPaymentMethod)) {
        throw new Error(`Invalid sales analytics payload: ${JSON.stringify(data)}`);
      }
    });

    // 3. GET /api/admin/dashboard/orders returns status breakdown and recent orders
    await check("3. GET /api/admin/dashboard/orders returns status breakdown & recent list", async () => {
      const res = await fetch(`${baseUrl}/api/admin/dashboard/orders`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const data = body.data || body;
      if (!data.statusBreakdown || !data.paymentBreakdown || !Array.isArray(data.recentOrders)) {
        throw new Error(`Invalid orders analytics payload: ${JSON.stringify(data)}`);
      }
    });

    // 4. GET /api/admin/dashboard/inventory returns stock indicators and category breakdown
    await check("4. GET /api/admin/dashboard/inventory returns stock distribution", async () => {
      const res = await fetch(`${baseUrl}/api/admin/dashboard/inventory`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const data = body.data || body;
      if (!data.summary || data.summary.totalProducts === undefined || !Array.isArray(data.stockByCategory)) {
        throw new Error(`Invalid inventory analytics payload: ${JSON.stringify(data)}`);
      }
    });

    // 5. GET /api/admin/customers lists customers with search & pagination
    await check("5. GET /api/admin/customers lists customers with search and filters", async () => {
      const res = await fetch(`${baseUrl}/api/admin/customers?search=Dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const customers = body.data?.customers || body.customers;
      if (!Array.isArray(customers) || customers.length === 0) {
        throw new Error("Expected to find test customer in search results");
      }
      if (customers[0].email !== customerUser.email) {
        throw new Error(`Customer email mismatch: expected ${customerUser.email}, got ${customers[0].email}`);
      }
    });

    // 6. Security verification: Customer password hashes are omitted in API responses
    await check("6. Security: Customer passwords never exposed in API envelopes", async () => {
      const res = await fetch(`${baseUrl}/api/admin/customers`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const body = await res.json();
      const customers = body.data?.customers || body.customers;
      for (const cust of customers) {
        if (cust.password) {
          throw new Error("Security failure: Customer password hash exposed in customer listing!");
        }
      }
    });

    // 7. GET /api/admin/customers/:id returns customer details & their orders
    await check("7. GET /api/admin/customers/:id returns customer profile with orders", async () => {
      const res = await fetch(`${baseUrl}/api/admin/customers/${customerUser._id}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const data = body.data || body;
      if (!data.customer || data.customer.password !== undefined || !Array.isArray(data.orders)) {
        throw new Error(`Customer details format error: ${JSON.stringify(data)}`);
      }
    });

    // 8. PATCH /api/admin/customers/:id/status updates customer active status
    await check("8. PATCH /api/admin/customers/:id/status activates/deactivates accounts", async () => {
      // 8a. Deactivate
      const deactRes = await fetch(`${baseUrl}/api/admin/customers/${customerUser._id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ active: false })
      });
      if (deactRes.status !== 200) throw new Error(`Expected 200 deactivating, got ${deactRes.status}`);
      const deactBody = await deactRes.json();
      const deactCust = deactBody.data || deactBody;
      if (deactCust.active !== false) throw new Error("Customer active flag did not update to false");

      // 8b. Reactivate
      const reactRes = await fetch(`${baseUrl}/api/admin/customers/${customerUser._id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ active: true })
      });
      if (reactRes.status !== 200) throw new Error(`Expected 200 reactivating, got ${reactRes.status}`);
    });

    // 9. GET /api/admin/orders lists all store orders
    await check("9. GET /api/admin/orders returns paginated orders for admin", async () => {
      const res = await fetch(`${baseUrl}/api/admin/orders?page=1&limit=5`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const orders = body.data?.orders || body.orders;
      if (!Array.isArray(orders)) throw new Error("Expected orders array");
    });

    // 10. PATCH /api/admin/products/:id/return-policy updates single product policy
    await check("10. PATCH /api/admin/products/:id/return-policy sets return rules", async () => {
      const res = await fetch(`${baseUrl}/api/admin/products/${sampleProduct._id}/return-policy`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          isReturnable: true,
          returnWindowDays: 14,
          isReplaceable: true
        })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const prod = body.data?.product || body.product || body.data;
      if (prod.returnWindowDays !== 14 || !prod.isReturnable) {
        throw new Error(`Return policy mismatch: ${JSON.stringify(prod)}`);
      }
    });

    // 11. PATCH /api/admin/products/return-policy/bulk updates policy for category
    await check("11. PATCH /api/admin/products/return-policy/bulk updates category in bulk", async () => {
      const res = await fetch(`${baseUrl}/api/admin/products/return-policy/bulk`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          category: sampleCategory._id.toString(),
          isReturnable: true,
          returnWindowDays: 7
        })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (body.data?.modifiedCount === undefined && body.modifiedCount === undefined) {
        throw new Error(`Missing modifiedCount: ${JSON.stringify(body)}`);
      }
    });

    // 12. GET /api/admin/inventory lists products with stock and metadata
    await check("12. GET /api/admin/inventory lists inventory with product indicators", async () => {
      const res = await fetch(`${baseUrl}/api/admin/inventory?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const products = body.data?.products || body.products;
      if (!Array.isArray(products) || products.length === 0) {
        throw new Error("Expected non-empty products in inventory response");
      }
    });

  } finally {
    // Cleanup
    if (customerUser) {
      await User.deleteOne({ _id: customerUser._id });
    }
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
  }

  console.log("\n==========================================");
  console.log(`Phase 8 Tests Complete: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  testPhase8().catch((err) => {
    console.error("Test runner failed:", err);
    process.exit(1);
  });
}

module.exports = { testPhase8 };
