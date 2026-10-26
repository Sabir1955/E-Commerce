// Comprehensive API Test Suite for E-Commerce Platform
require('dotenv').config();

const BASE_URL = process.env.TEST_API_URL || `http://127.0.0.1:${process.env.PORT || 5000}`;

async function run() {
  console.log(`\n========================================`);
  console.log(`Starting API Test Suite on ${BASE_URL}`);
  console.log(`========================================\n`);

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      const start = Date.now();
      await fn();
      const duration = Date.now() - start;
      console.log(`  ✓ [PASS] (${duration}ms) ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  let adminToken = '';
  let customerToken = '';
  let customerUser = null;
  let testCategoryId = '';
  let testProductId = '';
  let testOrderId = '';
  let testPickupId = '';
  let testReturnId = '';

  // 1. Health
  await test('1. GET /api/health', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(`Invalid status: ${JSON.stringify(data)}`);
  });

  // 2. Admin Login
  await test('2. POST /api/auth/login (Admin)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: process.env.ADMIN_EMAIL || 'astro@gmail.com',
        password: process.env.ADMIN_PASSWORD || 'Astro@12345'
      })
    });
    if (res.status !== 200) throw new Error(`Status ${res.status} - ${await res.text()}`);
    const data = await res.json();
    if (!data.token || data.user.role !== 'admin') throw new Error('Token or admin role missing');
    adminToken = data.token;
  });

  // 3. Admin Auth Me
  await test('3. GET /api/auth/me (Admin Profile)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.user.email) throw new Error('Admin email missing');
  });

  // 4. Customer Register
  const testEmail = `user_${Date.now()}@gmail.com`;
  const testMobile = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
  await test('4. POST /api/auth/register (New Customer)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Automated Tester',
        email: testEmail,
        mobile: testMobile,
        password: 'Password@123',
        confirmPassword: 'Password@123'
      })
    });
    if (res.status !== 201) throw new Error(`Status ${res.status} - ${await res.text()}`);
    const data = await res.json();
    if (!data.token || !data.user) throw new Error('Registration token or user missing');
    customerToken = data.token;
    customerUser = data.user;
  });

  // 5. Customer Login
  await test('5. POST /api/auth/login (Customer)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testEmail, password: 'Password@123' })
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.token) throw new Error('Customer login token missing');
  });

  // 6. Categories List
  await test('6. GET /api/categories', async () => {
    const res = await fetch(`${BASE_URL}/api/categories`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.categories)) throw new Error('Categories is not an array');
  });

  // 7. Admin Create Category
  const catSlug = `gemstones-${Date.now().toString(36)}`;
  await test('7. POST /api/categories (Admin)', async () => {
    const res = await fetch(`${BASE_URL}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: `Gemstones Test ${Date.now()}`,
        slug: catSlug,
        description: 'Astrology gemstones category'
      })
    });
    if (res.status !== 201) throw new Error(`Status ${res.status} - ${await res.text()}`);
    const data = await res.json();
    testCategoryId = data._id;
  });

  // 8. Admin Create Product
  const sku = `RUBY-${Date.now().toString(36).toUpperCase()}`;
  await test('8. POST /api/products (Admin Create Product)', async () => {
    const res = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Certified Ruby Gemstone',
        description: 'Authentic astrological natural ruby gemstone',
        price: 2500,
        category: 'Gemstones Test',
        sku,
        stock: 25,
        images: ['https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f'],
        isReturnable: true,
        returnWindowDays: 7,
        isReplaceable: true
      })
    });
    if (res.status !== 201) throw new Error(`Status ${res.status} - ${await res.text()}`);
    const data = await res.json();
    testProductId = data.product?._id || data.data?._id || data._id;
  });

  // 9. List Products
  await test('9. GET /api/products', async () => {
    const res = await fetch(`${BASE_URL}/api/products`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.products) || data.products.length === 0) {
      throw new Error('Products array empty or invalid');
    }
  });

  // 10. Get Single Product
  await test(`10. GET /api/products/${testProductId}`, async () => {
    const res = await fetch(`${BASE_URL}/api/products/${testProductId}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    const prod = data.data?.product || data.data || data.product || data;
    if (prod.name !== 'Certified Ruby Gemstone') throw new Error('Product name mismatch');
  });

  // 11. Adjust Product Inventory
  await test(`11. POST /api/products/${testProductId}/inventory/adjust`, async () => {
    const res = await fetch(`${BASE_URL}/api/products/${testProductId}/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ amount: 5 })
    });
    if (res.status !== 200) throw new Error(`Status ${res.status} - ${await res.text()}`);
    const data = await res.json();
    const stockVal = data.data?.stock !== undefined ? data.data.stock : (data.stock !== undefined ? data.stock : (data.product?.stock));
    if (stockVal !== 30) throw new Error(`Expected stock 30, got ${stockVal}`);
  });

  // 12. Create Order
  await test('12. POST /api/orders (Customer Place Order)', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        items: [
          {
            product: testProductId,
            quantity: 2
          }
        ],
        shippingAddress: {
          fullName: 'Automated Tester',
          mobile: testMobile,
          address: '123 MG Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
          country: 'India'
        },
        paymentMethod: 'card'
      })
    });
    if (res.status !== 201) throw new Error(`Status ${res.status} - ${await res.text()}`);
    const data = await res.json();
    testOrderId = data.order?._id || data.data?.order?._id || data.data?._id || data._id;
  });

  // 13. Customer Order History
  await test('13. GET /api/orders/mine (Customer History)', async () => {
    const res = await fetch(`${BASE_URL}/api/orders/mine`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    const orders = data.orders || data.data?.orders || (Array.isArray(data.data) ? data.data : []);
    if (!Array.isArray(orders) || orders.length === 0) {
      throw new Error('Customer orders missing');
    }
  });

  // 14. Single Order & Tracking
  await test(`14. GET /api/orders/${testOrderId}/tracking`, async () => {
    const res = await fetch(`${BASE_URL}/api/orders/${testOrderId}/tracking`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    const trackingObj = data.data || data;
    if (!trackingObj.status && !trackingObj.orderStatus) throw new Error('Order tracking status missing');
  });

  // 15. Admin List Orders
  await test('15. GET /api/orders (Admin Orders)', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    const orders = data.orders || data.data?.orders || (Array.isArray(data.data) ? data.data : []);
    if (!Array.isArray(orders)) throw new Error('Admin orders is not an array');
  });

  // 16. Admin Update Order Status
  await test(`16. PATCH /api/orders/${testOrderId}/status (Admin Update Status)`, async () => {
    const res = await fetch(`${BASE_URL}/api/orders/${testOrderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'delivered' })
    });
    if (res.status !== 200) throw new Error(`Status ${res.status} - ${await res.text()}`);
  });

  // 17. Admin Dashboard Stats
  await test('17. GET /api/admin/dashboard', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.totalSales === undefined || data.orders === undefined) {
      throw new Error('Dashboard stats missing fields');
    }
  });

  // 18. Admin Customers List
  await test('18. GET /api/admin/customers', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/customers`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.customers)) throw new Error('Customers is not an array');
  });

  // 19. Shipping Settings
  await test('19. GET /api/shipping-settings', async () => {
    const res = await fetch(`${BASE_URL}/api/shipping-settings`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.shipping) throw new Error('Shipping object missing');
  });

  // 20. Pickup Locations (Admin)
  await test('20. GET /api/pickup-locations & POST', async () => {
    // List
    const listRes = await fetch(`${BASE_URL}/api/pickup-locations`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (listRes.status !== 200) throw new Error(`List Status ${listRes.status}`);

    // Create
    const createRes = await fetch(`${BASE_URL}/api/pickup-locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Main Astrology Warehouse',
        contactName: 'Warehouse Manager',
        phone: '+919876543210',
        address: 'Plot 42, Sector 18',
        city: 'Gurugram',
        state: 'Haryana',
        postalCode: '122015',
        isDefault: true
      })
    });
    if (createRes.status !== 201) throw new Error(`Create Status ${createRes.status} - ${await createRes.text()}`);
    const loc = await createRes.json();
    testPickupId = loc._id;
  });

  // 21. Returns Request (Customer)
  await test('21. POST /api/returns (Customer Return Request)', async () => {
    const res = await fetch(`${BASE_URL}/api/returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        orderId: testOrderId,
        type: 'return',
        reason: 'Item not needed anymore',
        items: [
          {
            product: testProductId,
            quantity: 1
          }
        ]
      })
    });
    if (res.status !== 201) throw new Error(`Status ${res.status} - ${await res.text()}`);
    const data = await res.json();
    testReturnId = data.returnRequest?._id || data.data?._id || data._id;
  });

  // 22. Customer Returns List
  await test('22. GET /api/returns/mine', async () => {
    const res = await fetch(`${BASE_URL}/api/returns/mine`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.returns) || data.returns.length === 0) {
      throw new Error('Customer return record not found');
    }
  });

  // 23. Admin Returns List
  await test('23. GET /api/returns (Admin)', async () => {
    const res = await fetch(`${BASE_URL}/api/returns`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.returns)) throw new Error('Admin returns is not an array');
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed | ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('Fatal error in test suite:', e);
  process.exit(1);
});
