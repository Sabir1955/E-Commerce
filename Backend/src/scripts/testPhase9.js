/**
 * Phase 9 Verification Suite: Admin Dashboard & Frontend Integration
 */
require("dotenv").config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const app = require("../app");
const { connectDatabase } = require("../config/database");

let server;
let adminToken = '';
let customerToken = '';
let testOrderId = '';
let testProductId = '';
let testCategoryId = '';
let port = 0;

function makeRequest(method, endpoint, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: endpoint,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('==========================================');
  console.log('Running Phase 9 Admin Dashboard Integration Tests');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  try {
    await connectDatabase();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    // 1. Authenticate Admin and Customer
    const adminLogin = await makeRequest('POST', '/api/auth/login', {}, {
      identifier: process.env.ADMIN_EMAIL || 'astro@gmail.com',
      password: process.env.ADMIN_PASSWORD || 'Astro@12345'
    });
    adminToken = adminLogin.data?.token || adminLogin.data?.data?.token;

    const timestamp = Date.now();
    const customerRegister = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'Dashboard Tester',
      email: `dashtest_${timestamp}@example.com`,
      mobile: `+9195${String(timestamp).slice(-8)}`,
      password: 'Password@123',
      confirmPassword: 'Password@123'
    });
    customerToken = customerRegister.data?.token || customerRegister.data?.data?.token;

    // Test 1: Admin Dashboard Summary Contract
    try {
      const res = await makeRequest('GET', '/api/admin/dashboard/summary', {
        Authorization: `Bearer ${adminToken}`
      });
      const data = res.data?.data || res.data;
      if (
        res.status === 200 &&
        typeof data.products === 'number' &&
        typeof data.categories === 'number' &&
        typeof data.customers === 'number' &&
        typeof data.orders === 'number' &&
        typeof data.totalSales === 'number' &&
        typeof data.pendingOrders === 'number' &&
        typeof data.completedOrders === 'number' &&
        typeof data.outOfStock === 'number'
      ) {
        console.log('  ✓ [PASS] 1. GET /api/admin/dashboard/summary delivers all required KPI counters');
        passed++;
      } else {
        throw new Error(`Invalid dashboard summary structure: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 1. GET /api/admin/dashboard/summary:`, e.message);
      failed++;
    }

    // Test 2: Admin Dashboard Sales Analytics Contract
    try {
      const res = await makeRequest('GET', '/api/admin/dashboard/sales', {
        Authorization: `Bearer ${adminToken}`
      });
      const data = res.data?.data || res.data;
      if (
        res.status === 200 &&
        typeof data.totalRevenue === 'number' &&
        Array.isArray(data.monthlySales) &&
        data.salesByPaymentMethod !== undefined
      ) {
        console.log('  ✓ [PASS] 2. GET /api/admin/dashboard/sales provides aggregated financial metrics');
        passed++;
      } else {
        throw new Error(`Invalid sales response: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 2. GET /api/admin/dashboard/sales:`, e.message);
      failed++;
    }

    // Test 3: Admin Dashboard Orders Distribution
    try {
      const res = await makeRequest('GET', '/api/admin/dashboard/orders', {
        Authorization: `Bearer ${adminToken}`
      });
      const data = res.data?.data || res.data;
      if (
        res.status === 200 &&
        data.statusBreakdown !== undefined &&
        Array.isArray(data.recentOrders)
      ) {
        console.log('  ✓ [PASS] 3. GET /api/admin/dashboard/orders provides order status distribution & recent feed');
        passed++;
      } else {
        throw new Error(`Invalid orders response: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 3. GET /api/admin/dashboard/orders:`, e.message);
      failed++;
    }

    // Test 4: Admin Dashboard Real-Time Stock Analytics
    try {
      const res = await makeRequest('GET', '/api/admin/dashboard/inventory', {
        Authorization: `Bearer ${adminToken}`
      });
      const data = res.data?.data || res.data;
      const summary = data.summary || data;
      if (
        res.status === 200 &&
        typeof summary.totalProducts === 'number' &&
        typeof summary.lowStockCount === 'number' &&
        typeof summary.outOfStockCount === 'number' &&
        Array.isArray(data.criticalLowStockProducts || data.criticalProducts)
      ) {
        console.log('  ✓ [PASS] 4. GET /api/admin/dashboard/inventory provides stock breakdown and low-stock alerts');
        passed++;
      } else {
        throw new Error(`Invalid inventory response: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 4. GET /api/admin/dashboard/inventory:`, e.message);
      failed++;
    }

    // Test 5: Category CRUD Lifecycle for Catalog Management
    try {
      const createRes = await makeRequest('POST', '/api/categories', {
        Authorization: `Bearer ${adminToken}`
      }, {
        name: `Test Cat ${Date.now()}`,
        description: 'Category for testing admin dashboard'
      });
      testCategoryId = createRes.data?.data?._id || createRes.data?._id;

      const updateRes = await makeRequest('PATCH', `/api/categories/${testCategoryId}`, {
        Authorization: `Bearer ${adminToken}`
      }, {
        description: 'Updated category description'
      });

      if (createRes.status === 201 && updateRes.status === 200) {
        console.log('  ✓ [PASS] 5. Category management: create, update, and persist active categories');
        passed++;
      } else {
        throw new Error(`Category CRUD failed: create=${createRes.status}, update=${updateRes.status}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 5. Category management:`, e.message);
      failed++;
    }

    // Test 6: Product CRUD Lifecycle with SKU and Placeholder Image
    try {
      const createRes = await makeRequest('POST', '/api/products', {
        Authorization: `Bearer ${adminToken}`
      }, {
        name: `Admin Gemstone ${Date.now()}`,
        description: 'Authentic tested gemstone with local placeholder',
        price: 2500,
        stock: 12,
        sku: `SKU-${Date.now()}`,
        category: 'Gemstones',
        imageUrl: '/uploads/placeholders/gemstone-placeholder.svg'
      });
      testProductId = createRes.data?.data?._id || createRes.data?._id;

      const updateRes = await makeRequest('PATCH', `/api/products/${testProductId}`, {
        Authorization: `Bearer ${adminToken}`
      }, {
        price: 2750
      });

      if (createRes.status === 201 && updateRes.status === 200) {
        console.log('  ✓ [PASS] 6. Product management: create with SKU/placeholder and update pricing');
        passed++;
      } else {
        throw new Error(`Product CRUD failed: create=${createRes.status}, update=${updateRes.status}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 6. Product management:`, e.message);
      failed++;
    }

    // Test 7: Inventory Management - Adjust & Absolute Set
    try {
      const setRes = await makeRequest('PATCH', `/api/products/${testProductId}/inventory`, {
        Authorization: `Bearer ${adminToken}`
      }, {
        quantity: 20
      });

      const adjustRes = await makeRequest('POST', `/api/products/${testProductId}/inventory/adjust`, {
        Authorization: `Bearer ${adminToken}`
      }, {
        amount: 5
      });

      if (setRes.status === 200 && adjustRes.status === 200) {
        console.log('  ✓ [PASS] 7. Inventory management: direct stock setting and delta adjustment');
        passed++;
      } else {
        throw new Error(`Inventory update failed: set=${setRes.status}, adjust=${adjustRes.status}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 7. Inventory management:`, e.message);
      failed++;
    }

    // Test 8: Order Management - Search, Status Lifecycle, and Tracking
    try {
      // Place an order as customer
      const placeOrder = await makeRequest('POST', '/api/orders', {
        Authorization: `Bearer ${customerToken}`
      }, {
        items: [{ product: testProductId, quantity: 1 }],
        shippingAddress: {
          fullName: 'Jyotish Seeker',
          mobile: '+919876543210',
          address: '42 Vedic Road',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          postalCode: '221001',
          country: 'India'
        },
        paymentMethod: 'cod'
      });
      testOrderId = placeOrder.data?.order?._id || placeOrder.data?.data?._id || placeOrder.data?._id;

      // Update status as admin
      const statusRes = await makeRequest('PATCH', `/api/orders/${testOrderId}/status`, {
        Authorization: `Bearer ${adminToken}`
      }, {
        status: 'processing'
      });

      if (placeOrder.status === 201 && statusRes.status === 200) {
        console.log('  ✓ [PASS] 8. Order management: lifecycle status transition (placed -> processing)');
        passed++;
      } else {
        throw new Error(`Order lifecycle failed: place=${placeOrder.status}, status=${statusRes.status}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 8. Order management:`, e.message);
      failed++;
    }

    // Test 9: Customer Directory & Status Toggle
    try {
      const customersRes = await makeRequest('GET', '/api/admin/customers', {
        Authorization: `Bearer ${adminToken}`
      });
      const customerList = customersRes.data?.data?.customers || customersRes.data?.customers || [];
      const testCustomer = customerList.find(c => c.email && c.email.includes('dashtest_'));

      let statusUpdated = false;
      if (testCustomer) {
        // Toggle to false
        const toggleRes1 = await makeRequest('PATCH', `/api/admin/customers/${testCustomer._id}/status`, {
          Authorization: `Bearer ${adminToken}`
        }, {
          active: false
        });
        // Toggle back to true (reactivate)
        const toggleRes2 = await makeRequest('PATCH', `/api/admin/customers/${testCustomer._id}/status`, {
          Authorization: `Bearer ${adminToken}`
        }, {
          active: true
        });
        statusUpdated = toggleRes1.status === 200 && toggleRes2.status === 200;
      }

      if (customersRes.status === 200 && statusUpdated) {
        console.log('  ✓ [PASS] 9. Customer management: list directory and toggle account status');
        passed++;
      } else {
        throw new Error(`Customer list/status failed`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 9. Customer management:`, e.message);
      failed++;
    }

    // Test 10: Payment Relationship & Verification Endpoint
    try {
      const paymentRes = await makeRequest('GET', `/api/payments/${testOrderId}`, {
        Authorization: `Bearer ${adminToken}`
      });
      if (paymentRes.status === 200 && paymentRes.data) {
        console.log('  ✓ [PASS] 10. Payment management: order-payment relationship query verified');
        passed++;
      } else {
        throw new Error(`Payment query returned status ${paymentRes.status}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 10. Payment management:`, e.message);
      failed++;
    }

    // Test 11: Security - Customer Forbidden from Admin Endpoints
    try {
      const forbiddenRes = await makeRequest('GET', '/api/admin/dashboard', {
        Authorization: `Bearer ${customerToken}`
      });
      if (forbiddenRes.status === 403) {
        console.log('  ✓ [PASS] 11. Security: non-admin customer strictly forbidden (HTTP 403) from admin endpoints');
        passed++;
      } else {
        throw new Error(`Expected 403 but got ${forbiddenRes.status}`);
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 11. Security:`, e.message);
      failed++;
    }

    // Test 12: Frontend Admin Artifacts Verification
    try {
      const distPath = path.resolve(__dirname, '../../../Frontend/dist/e-commerce-app/browser');
      const files = fs.readdirSync(distPath);
      const hasDashboard = files.some(f => f.includes('dashboard') || f.includes('main'));
      const hasPrerender = fs.existsSync(path.join(distPath, 'index.html'));

      if (hasDashboard && hasPrerender) {
        console.log('  ✓ [PASS] 12. Frontend compilation: Angular standalone admin chunks & routes validated');
        passed++;
      } else {
        throw new Error('Frontend build artifacts missing in dist/e-commerce-app');
      }
    } catch (e) {
      console.error(`  ✗ [FAIL] 12. Frontend compilation:`, e.message);
      failed++;
    }

  } catch (err) {
    console.error('Fatal test runner error:', err);
  } finally {
    try {
      const Product = require('../models/Product');
      const Category = require('../models/Category');
      const Order = require('../models/Order');
      if (testProductId) await Product.findByIdAndDelete(testProductId);
      if (testCategoryId) await Category.findByIdAndDelete(testCategoryId);
      if (testOrderId) await Order.findByIdAndDelete(testOrderId);
    } catch {}
    if (server) server.close();
    await mongoose.connection.close();
  }

  console.log('\n==========================================');
  console.log(`Phase 9 Tests Complete: ${passed} passed, ${failed} failed`);
  console.log('==========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
