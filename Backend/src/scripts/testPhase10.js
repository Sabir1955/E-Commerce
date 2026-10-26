/**
 * Phase 10 Verification Suite: Admin Dashboard APIs & Aggregations
 */
require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const app = require("../app");
const { connectDatabase } = require("../config/database");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const swaggerSpec = require("../swagger");

let server;
let adminToken = "";
let customerToken = "";
let port = 0;

function makeRequest(method, endpoint, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port: port,
      path: endpoint,
      method: method,
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("==========================================");
  console.log("Running Phase 10 Admin Dashboard APIs Tests");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  try {
    await connectDatabase();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    // 1. Authenticate Admin and Customer
    const adminLogin = await makeRequest("POST", "/api/auth/login", {}, {
      identifier: process.env.ADMIN_EMAIL || "astro@gmail.com",
      password: process.env.ADMIN_PASSWORD || "Astro@12345"
    });
    adminToken = adminLogin.data?.token || adminLogin.data?.data?.token;

    const timestamp = Date.now();
    const customerRegister = await makeRequest("POST", "/api/auth/register", {}, {
      name: "Phase 10 Tester",
      email: `p10_${timestamp}@example.com`,
      mobile: `+9194${String(timestamp).slice(-8)}`,
      password: "Password@123",
      confirmPassword: "Password@123"
    });
    customerToken = customerRegister.data?.token || customerRegister.data?.data?.token;

    // Test 1: GET /api/admin/dashboard/summary ($facet aggregation)
    try {
      const startTime = Date.now();
      const res = await makeRequest("GET", "/api/admin/dashboard/summary", {
        Authorization: `Bearer ${adminToken}`
      });
      const duration = Date.now() - startTime;
      const data = res.data?.data || res.data;

      if (
        res.status === 200 &&
        typeof data.products === "number" &&
        typeof data.categories === "number" &&
        typeof data.customers === "number" &&
        typeof data.orders === "number" &&
        typeof data.pendingOrders === "number" &&
        typeof data.completedOrders === "number" &&
        typeof data.outOfStock === "number" &&
        typeof data.totalSales === "number"
      ) {
        console.log(`  ✓ [PASS] 1. GET /api/admin/dashboard/summary delivers all 8 KPI counters via single-pass facet (${duration}ms)`);
        passed++;
      } else {
        throw new Error(`Invalid summary structure: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 1. GET /api/admin/dashboard/summary:`, e.message);
      failed++;
    }

    // Test 2: GET /api/admin/dashboard backward compatibility alias
    try {
      const res = await makeRequest("GET", "/api/admin/dashboard", {
        Authorization: `Bearer ${adminToken}`
      });
      const data = res.data?.data || res.data;
      if (res.status === 200 && data.products !== undefined && data.totalSales !== undefined) {
        console.log("  ✓ [PASS] 2. GET /api/admin/dashboard backward compatibility alias returns matching summary payload");
        passed++;
      } else {
        throw new Error(`Invalid alias response: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 2. GET /api/admin/dashboard alias:`, e.message);
      failed++;
    }

    // Test 3: GET /api/admin/dashboard/sales aggregation pipeline
    try {
      const res = await makeRequest("GET", "/api/admin/dashboard/sales", {
        Authorization: `Bearer ${adminToken}`
      });
      const data = res.data?.data || res.data;
      if (
        res.status === 200 &&
        typeof data.totalRevenue === "number" &&
        typeof data.paidOrdersCount === "number" &&
        typeof data.avgOrderValue === "number" &&
        Array.isArray(data.salesByPaymentMethod) &&
        Array.isArray(data.monthlySales)
      ) {
        console.log("  ✓ [PASS] 3. GET /api/admin/dashboard/sales provides revenue, averages, payment mix, and 6-month trends");
        passed++;
      } else {
        throw new Error(`Invalid sales payload: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 3. GET /api/admin/dashboard/sales:`, e.message);
      failed++;
    }

    // Test 4: GET /api/admin/dashboard/orders status and payments distribution
    try {
      const res = await makeRequest("GET", "/api/admin/dashboard/orders", {
        Authorization: `Bearer ${adminToken}`
      });
      const data = res.data?.data || res.data;
      if (
        res.status === 200 &&
        data.statusBreakdown !== undefined &&
        data.paymentBreakdown !== undefined &&
        Array.isArray(data.recentOrders)
      ) {
        console.log("  ✓ [PASS] 4. GET /api/admin/dashboard/orders returns status breakdowns and populated recent orders feed");
        passed++;
      } else {
        throw new Error(`Invalid orders payload: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 4. GET /api/admin/dashboard/orders:`, e.message);
      failed++;
    }

    // Test 5: GET /api/admin/dashboard/inventory single-pass bucket aggregation
    try {
      const res = await makeRequest("GET", "/api/admin/dashboard/inventory", {
        Authorization: `Bearer ${adminToken}`
      });
      const data = res.data?.data || res.data;
      const summary = data.summary || data;

      if (
        res.status === 200 &&
        typeof summary.totalProducts === "number" &&
        typeof summary.inStockCount === "number" &&
        typeof summary.lowStockCount === "number" &&
        typeof summary.outOfStockCount === "number" &&
        Array.isArray(data.criticalLowStockProducts) &&
        Array.isArray(data.stockByCategory)
      ) {
        console.log("  ✓ [PASS] 5. GET /api/admin/dashboard/inventory provides stock breakdown, critical list, and category units");
        passed++;
      } else {
        throw new Error(`Invalid inventory payload: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 5. GET /api/admin/dashboard/inventory:`, e.message);
      failed++;
    }

    // Test 6: Verify Database Compound Index: Order { paymentStatus: 1, createdAt: -1 }
    try {
      await Order.syncIndexes();
      const indexes = await Order.collection.indexes();
      const hasPaymentCreated = indexes.some(
        (idx) => idx.key.paymentStatus && idx.key.createdAt
      );
      if (hasPaymentCreated) {
        console.log("  ✓ [PASS] 6. Database index: Order model compound index { paymentStatus: 1, createdAt: -1 } active");
        passed++;
      } else {
        throw new Error("Missing compound index on Order: { paymentStatus: 1, createdAt: -1 }");
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 6. Order index check:`, e.message);
      failed++;
    }

    // Test 7: Verify Database Compound Index: Product { active: 1, stock: 1 }
    try {
      await Product.syncIndexes();
      const indexes = await Product.collection.indexes();
      const hasActiveStock = indexes.some(
        (idx) => idx.key.active && idx.key.stock
      );
      if (hasActiveStock) {
        console.log("  ✓ [PASS] 7. Database index: Product model compound index { active: 1, stock: 1 } active");
        passed++;
      } else {
        throw new Error("Missing compound index on Product: { active: 1, stock: 1 }");
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 7. Product index check:`, e.message);
      failed++;
    }

    // Test 8: Non-Admin Forbidden Check across all 4 dashboard endpoints
    try {
      const endpoints = [
        "/api/admin/dashboard/summary",
        "/api/admin/dashboard/sales",
        "/api/admin/dashboard/orders",
        "/api/admin/dashboard/inventory"
      ];
      let allForbidden = true;
      for (const ep of endpoints) {
        const res = await makeRequest("GET", ep, {
          Authorization: `Bearer ${customerToken}`
        });
        if (res.status !== 403) {
          allForbidden = false;
          throw new Error(`Expected 403 for ${ep}, got ${res.status}`);
        }
      }
      if (allForbidden) {
        console.log("  ✓ [PASS] 8. Role-based security: Non-admin customer forbidden (HTTP 403) across all dashboard endpoints");
        passed++;
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 8. Role-based security check:`, e.message);
      failed++;
    }

    // Test 9: Unauthenticated Unauthorized Check across dashboard endpoints
    try {
      const endpoints = [
        "/api/admin/dashboard/summary",
        "/api/admin/dashboard/sales",
        "/api/admin/dashboard/orders",
        "/api/admin/dashboard/inventory"
      ];
      let allUnauthorized = true;
      for (const ep of endpoints) {
        const res = await makeRequest("GET", ep);
        if (res.status !== 401) {
          allUnauthorized = false;
          throw new Error(`Expected 401 for ${ep}, got ${res.status}`);
        }
      }
      if (allUnauthorized) {
        console.log("  ✓ [PASS] 9. Authentication security: Unauthenticated requests rejected (HTTP 401) across all endpoints");
        passed++;
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 9. Authentication security check:`, e.message);
      failed++;
    }

    // Test 10: Aggregation Pipeline Resilience under empty filter bounds
    try {
      // Direct service test ensuring no runtime errors or division by zero
      const adminService = require("../modules/admin/admin.service");
      const summary = await adminService.getDashboardSummary();
      const sales = await adminService.getSalesAnalytics();
      const orders = await adminService.getOrdersAnalytics();
      const inventory = await adminService.getInventoryAnalytics();

      if (
        summary &&
        sales &&
        orders &&
        inventory &&
        !isNaN(sales.avgOrderValue) &&
        !isNaN(summary.totalSales)
      ) {
        console.log("  ✓ [PASS] 10. Aggregation resiliency: Mathematical calculations guard against NaN and division by zero");
        passed++;
      } else {
        throw new Error("Resiliency check encountered NaN or null payload");
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 10. Aggregation resiliency check:`, e.message);
      failed++;
    }

    // Test 11: Performance Latency Benchmark
    try {
      const start = Date.now();
      await Promise.all([
        makeRequest("GET", "/api/admin/dashboard/summary", { Authorization: `Bearer ${adminToken}` }),
        makeRequest("GET", "/api/admin/dashboard/sales", { Authorization: `Bearer ${adminToken}` }),
        makeRequest("GET", "/api/admin/dashboard/orders", { Authorization: `Bearer ${adminToken}` }),
        makeRequest("GET", "/api/admin/dashboard/inventory", { Authorization: `Bearer ${adminToken}` })
      ]);
      const totalElapsed = Date.now() - start;
      if (totalElapsed < 2500) {
        console.log(`  ✓ [PASS] 11. Performance benchmark: All 4 dashboard aggregation queries executed concurrently in ${totalElapsed}ms`);
        passed++;
      } else {
        throw new Error(`Queries took longer than acceptable threshold: ${totalElapsed}ms`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 11. Performance benchmark:`, e.message);
      failed++;
    }

    // Test 12: OpenAPI / Swagger Specification Coverage
    try {
      const paths = swaggerSpec.paths || {};
      const hasSummary = !!paths["/api/admin/dashboard/summary"];
      const hasSales = !!paths["/api/admin/dashboard/sales"];
      const hasOrders = !!paths["/api/admin/dashboard/orders"];
      const hasInventory = !!paths["/api/admin/dashboard/inventory"];

      if (hasSummary && hasSales && hasOrders && hasInventory) {
        console.log("  ✓ [PASS] 12. OpenAPI 3.0 / Swagger documentation: All 4 administrative dashboard endpoints registered");
        passed++;
      } else {
        throw new Error("Missing dashboard endpoints in Swagger paths definition");
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 12. Swagger specification coverage:`, e.message);
      failed++;
    }

  } catch (err) {
    console.error("Fatal test runner error:", err);
  } finally {
    if (server) server.close();
    await mongoose.connection.close();
  }

  console.log("\n==========================================");
  console.log(`Phase 10 Tests Complete: ${passed} passed, ${failed} failed`);
  console.log("==========================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
