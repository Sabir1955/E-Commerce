const db = require('../database/db');

async function run() {
  const baseUrl = 'http://localhost:5000';
  console.log('--- Testing Inventory Availability Toggle End-to-End ---');

  // 1. Admin Login
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gmail.com', password: 'Admin@12345' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token || loginData.data?.token;
  if (!token) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
  }
  console.log('✓ Admin login successful');

  // Customer registration/login for cart/order testing
  const ts = Date.now();
  const custRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Inventory Test Customer',
      email: `inv_cust_${ts}@gmail.com`,
      mobile: `+9193${String(ts).slice(-8)}`,
      password: 'Password@123',
      confirmPassword: 'Password@123'
    })
  });
  const custData = await custRes.json();
  const custToken = custData.token || custData.data?.token || custData.accessToken;
  console.log('✓ Customer registered and logged in, token available:', !!custToken, custToken ? '' : JSON.stringify(custData));

  // 2. Fetch products to get a test product
  const productsRes = await fetch(`${baseUrl}/api/products?limit=10`);
  const productsData = await productsRes.json();
  const products = productsData.products || [];
  const testProduct = products.find(p => (p.stock ?? 0) > 0);
  if (!testProduct) {
    throw new Error('No product with stock > 0 found');
  }
  const prodId = testProduct.id || testProduct._id;
  console.log(`✓ Selected test product: ${testProduct.name} (ID: ${prodId}, Stock: ${testProduct.stock})`);

  // Ensure initially available
  await fetch(`${baseUrl}/api/products/${prodId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ available: true, isAvailable: true })
  });

  // TEST 1: Button "Make Unavailable"
  console.log('\n--- 1. Testing "Make Unavailable" Button Flow ---');
  const makeUnavailRes = await fetch(`${baseUrl}/api/products/${prodId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ available: false, isAvailable: false, is_available: false })
  });
  if (!makeUnavailRes.ok) {
    throw new Error(`Failed to make product unavailable: ${makeUnavailRes.status}`);
  }
  const unavailJson = await makeUnavailRes.json();
  const updatedProduct = unavailJson.data || unavailJson;
  console.log('✓ API returned 200 with available:', updatedProduct.available, 'isAvailable:', updatedProduct.isAvailable);
  if (updatedProduct.available !== false || updatedProduct.isAvailable !== false) {
    throw new Error('API did not return available=false');
  }

  // Verify in PostgreSQL database directly
  const dbCheck1 = await db.query('SELECT id, is_available, stock FROM products WHERE id = $1', [prodId]);
  console.log('✓ PostgreSQL database row:', dbCheck1.rows[0]);
  if (dbCheck1.rows[0].is_available !== false) {
    throw new Error(`PostgreSQL row is_available is not false: ${dbCheck1.rows[0].is_available}`);
  }

  // Verify status persists after simulated refresh (GET /api/products?limit=100)
  const refreshRes = await fetch(`${baseUrl}/api/products?limit=100`);
  const refreshData = await refreshRes.json();
  const refreshedItem = (refreshData.products || []).find(p => String(p.id) === String(prodId) || String(p._id) === String(prodId));
  console.log('✓ After refresh, product availability in catalog:', refreshedItem?.available, 'isAvailable:', refreshedItem?.isAvailable);
  if (refreshedItem?.available !== false || refreshedItem?.isAvailable !== false) {
    throw new Error('Product availability did not persist after refresh');
  }

  // Customer website verification (GET /api/products/:id)
  const custViewRes = await fetch(`${baseUrl}/api/products/${prodId}`);
  const custViewData = await custViewRes.json();
  const custProduct = custViewData.data || custViewData;
  console.log('✓ Customer site product detail availability:', custProduct.available, 'isAvailable:', custProduct.isAvailable);
  if (custProduct.available !== false || custProduct.isAvailable !== false) {
    throw new Error('Customer site does not reflect unavailable status');
  }

  // Check un-purchasability: Cart addition
  if (custToken) {
    const addCartRes = await fetch(`${baseUrl}/api/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ productId: prodId, quantity: 1 })
    });
    console.log(`✓ Cart add attempt on unavailable product: status ${addCartRes.status} (Expected 400)`);
    if (addCartRes.status !== 400) {
      throw new Error(`Expected 400 when adding unavailable product to cart, got ${addCartRes.status}`);
    }

    // Check un-purchasability: Order creation
    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({
        items: [{ product: prodId, quantity: 1 }],
        paymentMethod: 'online',
        shippingAddress: {
          fullName: 'Test User',
          mobile: '9876543210',
          address: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'India'
        }
      })
    });
    console.log(`✓ Order checkout attempt on unavailable product: status ${orderRes.status} (Expected 409)`);
    if (orderRes.status !== 409) {
      throw new Error(`Expected 409 when checking out unavailable product, got ${orderRes.status}`);
    }
  }

  // TEST 2: Button "Make Available"
  console.log('\n--- 2. Testing "Make Available" Button Flow ---');
  const makeAvailRes = await fetch(`${baseUrl}/api/products/${prodId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ available: true, isAvailable: true, is_available: true })
  });
  if (!makeAvailRes.ok) {
    throw new Error(`Failed to make product available: ${makeAvailRes.status}`);
  }
  const availJson = await makeAvailRes.json();
  const restoredProduct = availJson.data || availJson;
  console.log('✓ API returned 200 with available:', restoredProduct.available, 'isAvailable:', restoredProduct.isAvailable);
  if (restoredProduct.available !== true || restoredProduct.isAvailable !== true) {
    throw new Error('API did not return available=true');
  }

  // Verify in PostgreSQL database directly
  const dbCheck2 = await db.query('SELECT id, is_available, stock FROM products WHERE id = $1', [prodId]);
  console.log('✓ PostgreSQL database row:', dbCheck2.rows[0]);
  if (dbCheck2.rows[0].is_available !== true) {
    throw new Error(`PostgreSQL row is_available is not true: ${dbCheck2.rows[0].is_available}`);
  }

  // Verify status persists after refresh
  const refreshRes2 = await fetch(`${baseUrl}/api/products?limit=100`);
  const refreshData2 = await refreshRes2.json();
  const refreshedItem2 = (refreshData2.products || []).find(p => String(p.id) === String(prodId) || String(p._id) === String(prodId));
  console.log('✓ After refresh, product availability in catalog:', refreshedItem2?.available, 'isAvailable:', refreshedItem2?.isAvailable);
  if (refreshedItem2?.available !== true || refreshedItem2?.isAvailable !== true) {
    throw new Error('Product availability did not persist as true after refresh');
  }

  console.log('\n======================================================');
  console.log('🎉 ALL INVENTORY AVAILABILITY WORKFLOW TESTS PASSED!');
  console.log('======================================================\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Error during testing:', err);
  process.exit(1);
});
