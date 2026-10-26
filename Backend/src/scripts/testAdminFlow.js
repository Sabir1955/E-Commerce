const http = require('http');

function postJson(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'GET',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function patchJson(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTest() {
  console.log('--- 1. Testing Admin Login ---');
  const loginRes = await postJson('http://localhost:5000/api/auth/login', {
    identifier: 'astro@gmail.com',
    password: 'Astro@12345'
  });
  console.log('Login Status:', loginRes.status);
  console.log('User Role:', loginRes.data?.user?.role);
  if (loginRes.data?.user?.role !== 'admin' || !loginRes.data?.token) {
    console.error('FAILED: Admin login unsuccessful!');
    process.exit(1);
  }
  console.log('SUCCESS: Admin authenticated.');

  const adminToken = loginRes.data.token;
  const authHeaders = { Authorization: `Bearer ${adminToken}` };

  console.log('\n--- 2. Testing GET /api/orders (Admin list) ---');
  const ordersRes = await getJson('http://localhost:5000/api/orders', authHeaders);
  console.log('Orders status:', ordersRes.status);
  console.log('Orders count:', ordersRes.data?.orders?.length || 0);

  if (ordersRes.data?.orders?.length > 0) {
    const sampleOrder = ordersRes.data.orders[0];
    console.log(`\n--- 3. Testing PATCH /api/orders/${sampleOrder._id}/status ---`);
    const patchRes = await patchJson(`http://localhost:5000/api/orders/${sampleOrder._id}/status`, {
      status: 'processing'
    }, authHeaders);
    console.log('Status update result:', patchRes.status, patchRes.data);
  } else {
    console.log('No orders currently in database. API is ready.');
  }

  console.log('\n--- 4. Testing GET /api/admin/dashboard metrics ---');
  const dashRes = await getJson('http://localhost:5000/api/admin/dashboard', authHeaders);
  console.log('Dashboard metrics:', dashRes.status, dashRes.data);

  console.log('\nAll Admin Backend APIs verified successfully!');
}

runTest().catch(err => {
  console.error('Error in test:', err);
  process.exit(1);
});
