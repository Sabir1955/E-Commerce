const axios = require('axios');

async function testLiveWorkflow() {
  const baseURL = 'http://localhost:5000/api';
  console.log('--- STARTING LIVE END-TO-END WORKFLOW VERIFICATION ---');

  // 1. Admin Login
  console.log('1. Admin logging in...');
  const adminLoginRes = await axios.post(`${baseURL}/auth/login`, {
    identifier: 'admin@example.com',
    password: 'Admin@12345'
  });
  const adminToken = adminLoginRes.data.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  console.log('   Admin logged in successfully:', adminLoginRes.data.user.name);

  // 2. Fetch Initial Admin Dashboard
  console.log('2. Fetching initial Admin Dashboard metrics...');
  const initialDashRes = await axios.get(`${baseURL}/admin/dashboard`, { headers: adminHeaders });
  const initialStats = initialDashRes.data.data;
  console.log('   Initial awaitingConfirmationOrders:', initialStats.awaitingConfirmationOrders);
  console.log('   Initial actualSalesRevenue: ₹' + initialStats.actualSalesRevenue);

  // 3. Customer Login
  console.log('3. Customer logging in...');
  const custLoginRes = await axios.post(`${baseURL}/auth/login`, {
    identifier: '9876543211',
    password: 'Devotee@12345'
  });
  const custToken = custLoginRes.data.token;
  const custHeaders = { Authorization: `Bearer ${custToken}` };
  console.log('   Customer logged in:', custLoginRes.data.user.name);

  // 4. Fetch Products to get a valid product
  const productsRes = await axios.get(`${baseURL}/products?limit=5`);
  const products = productsRes.data.data.products || productsRes.data.data;
  const testProduct = products[0];
  console.log('   Using Product:', testProduct.name, 'Price: ₹' + testProduct.price, 'ID:', testProduct._id);

  // 5. Verify COD order request is rejected
  console.log('5. Verifying Cash on Delivery (COD) order is rejected...');
  try {
    await axios.post(`${baseURL}/orders`, { ...orderPayload, paymentMethod: 'cod' }, { headers: custHeaders });
    throw new Error('Expected COD order request to be rejected with 400 Bad Request!');
  } catch (err) {
    if (err.response?.status === 400) {
      console.log('   ✓ COD order request successfully rejected (400 Bad Request)');
    } else {
      throw err;
    }
  }

  // 5b. Customer places an Online order
  console.log('5b. Customer placing Online Payment order...');
  orderPayload.paymentMethod = 'online';
  const createOrderRes = await axios.post(`${baseURL}/orders`, orderPayload, { headers: custHeaders });
  const createdOrder = createOrderRes.data.data;
  console.log('   Online order created successfully!');
  console.log('   Order ID:', createdOrder._id);
  console.log('   Order Number:', createdOrder.orderNumber);
  console.log('   Initial Status:', createdOrder.status || createdOrder.orderStatus);
  console.log('   Payment Status:', createdOrder.paymentStatus);
  console.log('   Total Amount: ₹' + createdOrder.total);

  // Assert online initial conditions
  const initialStatus = createdOrder.status || createdOrder.orderStatus;
  if (initialStatus !== 'awaiting_payment' && initialStatus !== 'placed') throw new Error(`Unexpected orderStatus ${initialStatus}`);
  if (createdOrder.paymentStatus !== 'pending') throw new Error(`Expected paymentStatus 'pending', got ${createdOrder.paymentStatus}`);

  // 6. Verify Admin Dashboard reflects new awaiting order and revenue didn't count unpaid COD
  console.log('6. Verifying Admin Dashboard after order placement...');
  const afterPlaceDashRes = await axios.get(`${baseURL}/admin/dashboard`, { headers: adminHeaders });
  const afterPlaceStats = afterPlaceDashRes.data.data;
  console.log('   New awaitingConfirmationOrders:', afterPlaceStats.awaitingConfirmationOrders);
  console.log('   New actualSalesRevenue: ₹' + afterPlaceStats.actualSalesRevenue);

  if (afterPlaceStats.awaitingConfirmationOrders !== initialStats.awaitingConfirmationOrders + 1) {
    throw new Error('awaitingConfirmationOrders did not increment by 1');
  }
  if (afterPlaceStats.actualSalesRevenue !== initialStats.actualSalesRevenue) {
    throw new Error('Unpaid COD order incorrectly added to actualSalesRevenue!');
  }
  console.log('   ✓ Unpaid COD correctly excluded from recognized sales revenue.');

  // 7. Admin Confirms the Order
  console.log('7. Admin confirming order...');
  const confirmRes = await axios.patch(
    `${baseURL}/orders/${createdOrder._id}/status`,
    { status: 'confirmed' },
    { headers: adminHeaders }
  );
  const confirmedOrder = confirmRes.data.data;
  const confirmedStatus = confirmedOrder.status || confirmedOrder.orderStatus;
  console.log('   Order status after confirmation:', confirmedStatus);
  console.log('   Confirmed By Admin:', confirmedOrder.confirmedBy);
  console.log('   Confirmed At:', confirmedOrder.confirmedAt);

  if (confirmedStatus !== 'confirmed') throw new Error(`Expected 'confirmed', got ${confirmedStatus}`);
  if (!confirmedOrder.confirmedAt) throw new Error('confirmedAt timestamp missing!');
  if (!confirmedOrder.confirmedBy || !confirmedOrder.confirmedBy.adminId) throw new Error('confirmedBy admin attribution missing!');
  console.log('   ✓ Admin confirmation and attribution recorded properly.');

  // 8. Admin transitions to Shipped
  console.log('8. Admin dispatching order (shipped)...');
  const shipRes = await axios.patch(
    `${baseURL}/orders/${createdOrder._id}/status`,
    {
      status: 'shipped',
      courierName: 'Blue Dart Express',
      trackingId: 'BLD897654321'
    },
    { headers: adminHeaders }
  );
  const shippedOrder = shipRes.data.data;
  const shippedStatus = shippedOrder.status || shippedOrder.orderStatus;
  console.log('   Order status after dispatch:', shippedStatus);

  // 9. Admin marks order as Delivered
  console.log('9. Admin marking order as Delivered...');
  const deliverRes = await axios.patch(
    `${baseURL}/orders/${createdOrder._id}/status`,
    { status: 'delivered' },
    { headers: adminHeaders }
  );
  const deliveredOrder = deliverRes.data.data;
  const deliveredStatus = deliveredOrder.status || deliveredOrder.orderStatus;
  console.log('   Order status after delivery:', deliveredStatus);
  console.log('   COD Payment Status after delivery:', deliveredOrder.paymentStatus);
  console.log('   Delivered At:', deliveredOrder.deliveredAt);

  if (deliveredOrder.paymentStatus !== 'paid') throw new Error('COD order should auto-transition to paid upon delivery!');
  if (!deliveredOrder.deliveredAt) throw new Error('deliveredAt should be populated!');
  console.log('   ✓ COD payment status auto-transitioned to PAID upon delivery.');

  // 10. Verify Admin Dashboard recognizes the revenue now that COD is Delivered
  console.log('10. Verifying recognized sales revenue in Admin Dashboard...');
  const finalDashRes = await axios.get(`${baseURL}/admin/dashboard`, { headers: adminHeaders });
  const finalStats = finalDashRes.data.data;
  console.log('   Final actualSalesRevenue: ₹' + finalStats.actualSalesRevenue);

  if (finalStats.actualSalesRevenue !== initialStats.actualSalesRevenue + deliveredOrder.total) {
    throw new Error(`Expected revenue ₹${initialStats.actualSalesRevenue + deliveredOrder.total}, got ₹${finalStats.actualSalesRevenue}`);
  }
  console.log('   ✓ Sales revenue correctly recognized after COD delivery!');

  // 11. Verify Date-wise Report API
  console.log('11. Verifying Date-wise Reports API...');
  const today = new Date().toISOString().slice(0, 10);
  const reportRes = await axios.get(`${baseURL}/admin/reports/date-wise?startDate=${today}&endDate=${today}`, {
    headers: adminHeaders
  });
  const report = reportRes.data.data;
  console.log('   Report summary total orders:', report.summary.totalOrders);
  console.log('   Report summary orders confirmed:', report.summary.ordersConfirmed);
  console.log('   Report summary orders delivered:', report.summary.ordersDelivered);
  console.log('   Report summary total sales: ₹' + report.summary.totalSalesRevenue);

  console.log('=======================================================================');
  console.log('🎉 ALL LIVE END-TO-END WORKFLOW CHECKS PASSED PERFECTLY!');
  console.log('=======================================================================');
}

testLiveWorkflow().catch(err => {
  console.error('Workflow test failed:', err.response?.data || err.message);
  process.exit(1);
});
