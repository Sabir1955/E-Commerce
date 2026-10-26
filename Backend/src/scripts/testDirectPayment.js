require("dotenv").config();
const http = require("http");
const app = require("../app");
const { connectDatabase, disconnectDatabase } = require("../config/database");

async function testDirectPayment() {
  console.log("==========================================");
  console.log("Testing Direct Online Payment Endpoints");
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

  try {
    let paymentRecord = null;

    // 1. Create order with numeric product ID (from static catalog)
    await check("1. POST /api/payments/create-order with items creates payment order", async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 1 }]
        })
      });

      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Expected 201, got ${res.status}: ${text}`);
      }

      paymentRecord = await res.json();
      if (!paymentRecord.recordId) throw new Error("Missing recordId in response");
      if (!paymentRecord.orderId) throw new Error("Missing orderId in response");
      if (!paymentRecord.keyId) throw new Error("Missing keyId in response");
      if (paymentRecord.amount !== 99900) {
        throw new Error(`Expected amount 99900 paise, got ${paymentRecord.amount}`);
      }
      if (paymentRecord.status !== "created") {
        throw new Error(`Expected status created, got ${paymentRecord.status}`);
      }
    });

    // 2. Verify payment successfully with test signature
    await check("2. POST /api/payments/verify confirms payment", async () => {
      const res = await fetch(`${baseUrl}/api/payments/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: paymentRecord.recordId,
          orderId: paymentRecord.orderId,
          paymentId: "pay_test_" + Date.now(),
          signature: "test_sig_auto_verified"
        })
      });

      if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Expected 200, got ${res.status}: ${text}`);
      }

      const verifyData = await res.json();
      if (verifyData.status !== "paid") {
        throw new Error(`Expected status paid, got ${verifyData.status}`);
      }
      if (verifyData.recordId !== paymentRecord.recordId) {
        throw new Error("recordId mismatch");
      }
    });

    // 3. Create another order and record failure
    await check("3. POST /api/payments/failure records failed payment", async () => {
      const createRes = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: 2, quantity: 2 }]
        })
      });
      const order2 = await createRes.json();

      const failRes = await fetch(`${baseUrl}/api/payments/failure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: order2.recordId,
          reason: "Payment cancelled by user"
        })
      });

      if (failRes.status !== 200) {
        const text = await failRes.text();
        throw new Error(`Expected 200, got ${failRes.status}: ${text}`);
      }

      const failData = await failRes.json();
      if (failData.status !== "failed") {
        throw new Error(`Expected status failed, got ${failData.status}`);
      }
    });

    // 4. Verification with empty body returns 400
    await check("4. POST /api/payments/verify rejects invalid payload", async () => {
      const res = await fetch(`${baseUrl}/api/payments/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      if (res.status !== 400) {
        throw new Error(`Expected 400, got ${res.status}`);
      }
    });

    // 5. Direct payment order creation with paymentMethod: "cod" is permanently rejected
    await check("5. POST /api/payments/create-order rejects COD payment requests", async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 1 }],
          paymentMethod: "cod"
        })
      });

      if (res.status !== 400) {
        throw new Error(`Expected 400 Bad Request for COD, got ${res.status}`);
      }
      const data = await res.json();
      if (!data.message || !data.message.toLowerCase().includes("cash on delivery")) {
        throw new Error(`Expected message mentioning Cash on Delivery, got: ${data.message}`);
      }
    });

    // 6. Direct payment order creation with gateway: "cod" is permanently rejected
    await check("6. POST /api/payments/create-order rejects COD gateway requests", async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: 1, quantity: 1 }],
          gateway: "cod"
        })
      });

      if (res.status !== 400) {
        throw new Error(`Expected 400 Bad Request for COD gateway, got ${res.status}`);
      }
    });

    console.log(`\nDirect Payment Tests Complete: ${passed} passed, ${failed} failed\n`);
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

testDirectPayment().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
