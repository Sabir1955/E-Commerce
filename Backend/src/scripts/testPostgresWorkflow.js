const http = require("http");

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on("error", (err) => reject(err));

    if (postData) {
      req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runLivePostgresWorkflow() {
  console.log("=======================================================================");
  console.log("   LIVE POSTGRESQL END-TO-END WORKFLOW & REPORTING VERIFICATION");
  console.log("=======================================================================\n");

  let passed = 0;

  // 1. Health check
  console.log("[1/8] Verifying Health & PostgreSQL Telemetry...");
  const healthRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/health",
    method: "GET"
  });
  if (healthRes.statusCode !== 200 || healthRes.body.status !== "ok") {
    throw new Error(`Health check failed: ${JSON.stringify(healthRes.body)}`);
  }
  console.log(`  ✓ API Health: OK (Status: ${healthRes.body.status}, DB: ${healthRes.body.database})`);
  passed++;

  // 2. Customer Authentication
  console.log("[2/8] Customer Authentication (9876543211 / Devotee@12345)...");
  const custLoginRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/auth/login",
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }, { identifier: "9876543211", password: "Devotee@12345" });

  if (custLoginRes.statusCode !== 200 || !custLoginRes.body.token) {
    throw new Error(`Customer login failed: ${JSON.stringify(custLoginRes.body)}`);
  }
  const custToken = custLoginRes.body.token;
  const custUser = custLoginRes.body.user;
  console.log(`  ✓ Customer logged in: ${custUser.name} (${custUser.email})`);
  passed++;

  // 3. Admin Authentication
  console.log("[3/8] Admin Authentication (admin@example.com / Admin@12345)...");
  const adminLoginRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/auth/login",
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }, { identifier: "admin@example.com", password: "Admin@12345" });

  if (adminLoginRes.statusCode !== 200 || !adminLoginRes.body.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminLoginRes.body)}`);
  }
  const adminToken = adminLoginRes.body.token;
  console.log(`  ✓ Admin logged in: ${adminLoginRes.body.user.name} (Role: ${adminLoginRes.body.user.role})`);
  passed++;

  // 4. Products List
  console.log("[4/8] Fetching Products from PostgreSQL...");
  const prodRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/products?limit=5",
    method: "GET"
  });
  const products = (prodRes.body.data && prodRes.body.data.products) || prodRes.body.products || prodRes.body.data;
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error(`No products returned from database (body: ${JSON.stringify(prodRes.body)})`);
  }
  const chosenProduct = products[0];
  console.log(`  ✓ Loaded ${products.length} products. Selected: "${chosenProduct.name}" (₹${chosenProduct.price})`);
  passed++;

  // 5. Customer Place Order - Verify COD Rejected & Place Online Order
  console.log("[5/8] Verifying Cash on Delivery Order is Rejected...");
  const codAttemptRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/orders",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${custToken}`
    }
  }, orderPayload);

  if (codAttemptRes.statusCode !== 400) {
    throw new Error(`Expected COD to be rejected with 400, got ${codAttemptRes.statusCode}`);
  }
  console.log("  ✓ COD payment method correctly rejected (400 Bad Request)");

  console.log("  Placing Online Order...");
  orderPayload.paymentMethod = "online";
  const createOrderRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/orders",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${custToken}`
    }
  }, orderPayload);

  if (createOrderRes.statusCode !== 201 && createOrderRes.statusCode !== 200) {
    throw new Error(`Order placement failed (${createOrderRes.statusCode}): ${JSON.stringify(createOrderRes.body)}`);
  }

  const createdOrder = createOrderRes.body.data || createOrderRes.body.order || createOrderRes.body;
  const createdOrderId = createdOrder._id || createdOrder.id;
  const createdOrderNum = createdOrder.orderNumber;
  console.log(`  ✓ Online Order Created & Persisted in PostgreSQL:`);
  console.log(`    - ID: ${createdOrderId}`);
  console.log(`    - Order Number: ${createdOrderNum}`);
  console.log(`    - Total: ₹${createdOrder.total}`);
  console.log(`    - Status: ${createdOrder.status}`);
  console.log(`    - Payment Status: ${createdOrder.paymentStatus}`);
  passed++;

  // 6. Customer Order History Check
  console.log("[6/8] Verifying Order in Customer Order History...");
  const myOrdersRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/orders/my-orders",
    method: "GET",
    headers: { "Authorization": `Bearer ${custToken}` }
  });
  const myOrders = (myOrdersRes.body.data && myOrdersRes.body.data.orders) || myOrdersRes.body.orders || myOrdersRes.body.data;
  const foundInHistory = Array.isArray(myOrders) && myOrders.some(o => (o.orderNumber === createdOrderNum || o._id === createdOrderId));
  if (!foundInHistory) {
    throw new Error(`Order ${createdOrderNum} not found in customer order history (myOrders: ${JSON.stringify(myOrdersRes.body)})`);
  }
  console.log(`  ✓ Order confirmed present in Customer Order History (${myOrders.length} orders total)`);
  passed++;

  // 7. Admin Order Confirmation Workflow
  console.log("[7/8] Admin Order Management & Status Transition Workflow...");
  const adminOrdersRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/admin/orders",
    method: "GET",
    headers: { "Authorization": `Bearer ${adminToken}` }
  });
  const adminOrders = (adminOrdersRes.body.data && adminOrdersRes.body.data.orders) || adminOrdersRes.body.orders || adminOrdersRes.body.data;
  const orderInAdmin = Array.isArray(adminOrders) && adminOrders.find(o => (o.orderNumber === createdOrderNum || o._id === createdOrderId));
  if (!orderInAdmin) {
    throw new Error(`Newly placed order ${createdOrderNum} not visible in admin order list`);
  }
  console.log(`  ✓ Order visible in Admin panel orders list.`);

  // Admin Confirms Order
  console.log("  → Admin confirming order...");
  const confirmRes = await request({
    hostname: "localhost",
    port: 5000,
    path: `/api/orders/${createdOrderId}/status`,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`
    }
  }, { status: "confirmed" });

  if (confirmRes.statusCode !== 200) {
    throw new Error(`Admin confirmation failed (${confirmRes.statusCode}): ${JSON.stringify(confirmRes.body)}`);
  }
  const confirmedOrder = confirmRes.body.data || confirmRes.body.order || confirmRes.body;
  console.log(`  ✓ Order confirmed by admin. New Status: ${confirmedOrder.status} (Confirmed At: ${confirmedOrder.confirmedAt || "recorded"})`);

  // Move status to shipped
  console.log("  → Admin transitioning order to shipped...");
  const dispatchRes = await request({
    hostname: "localhost",
    port: 5000,
    path: `/api/orders/${createdOrderId}/status`,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${adminToken}`
    }
  }, {
    status: "shipped",
    courierName: "Delhivery Express",
    trackingId: "DLV108108108"
  });

  if (dispatchRes.statusCode !== 200) {
    throw new Error(`Status transition failed: ${JSON.stringify(dispatchRes.body)}`);
  }
  console.log(`  ✓ Order dispatched with courier Delhivery Express and AWB DLV108108108`);
  passed++;

  // 8. Admin Sales Dashboard & PostgreSQL Analytics
  console.log("[8/8] Checking Admin Sales Dashboard & Date-Wise Analytics...");
  const dashRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/admin/dashboard",
    method: "GET",
    headers: { "Authorization": `Bearer ${adminToken}` }
  });

  if (dashRes.statusCode !== 200) {
    throw new Error(`Dashboard API failed: ${JSON.stringify(dashRes.body)}`);
  }
  const summary = dashRes.body.data || dashRes.body.summary || dashRes.body;
  console.log("  ✓ Admin Dashboard Loaded from PostgreSQL:");
  console.log(`    - Total Orders: ${summary.orders}`);
  console.log(`    - Total Customers: ${summary.customers}`);
  console.log(`    - Delivered Orders: ${summary.deliveredOrders}`);
  console.log(`    - Dispatched Orders: ${summary.dispatchedOrders}`);
  console.log(`    - Awaiting Confirmation: ${summary.awaitingConfirmationOrders}`);
  console.log(`    - Recognized Revenue: ₹${summary.actualSalesRevenue}`);

  // Fetch Reports for 20 completed days
  const reportRes = await request({
    hostname: "localhost",
    port: 5000,
    path: "/api/admin/reports/sales?startDate=2026-09-21&endDate=2026-10-11",
    method: "GET",
    headers: { "Authorization": `Bearer ${adminToken}` }
  });

  if (reportRes.statusCode !== 200) {
    throw new Error(`Sales Report API failed: ${JSON.stringify(reportRes.body)}`);
  }
  const reportData = reportRes.body.data || reportRes.body;
  const detailedRows = reportData.detailedRows || [];
  const repSummary = reportData.summary || {};
  console.log(`  ✓ Date-Wise Sales Report Generated from PostgreSQL:`);
  console.log(`    - Daily Rows Count: ${detailedRows.length} days`);
  console.log(`    - Orders in Period: ${repSummary.totalOrders}`);
  console.log(`    - Recognized Sales in Period: ₹${repSummary.totalSalesRevenue}`);
  passed++;

  console.log("\n=======================================================================");
  console.log(`✓ ALL 8 LIVE WORKFLOW STEPS PASSED PERFECTLY AGAINST POSTGRESQL! (${passed}/8)`);
  console.log("=======================================================================\n");
}

runLivePostgresWorkflow().catch((err) => {
  console.error("\n❌ Workflow Failed:", err.message);
  process.exit(1);
});
