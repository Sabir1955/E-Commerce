require("dotenv").config();
const http = require("http");
const app = require("../app");
const db = require("../database/db");
const Product = require("../models/Product");
const { connectDatabase, disconnectDatabase } = require("../config/database");

async function testProductStockReductionWorkflow() {
  console.log("==================================================");
  console.log("Testing Product Stock Reduction Upon Successful Order");
  console.log("==================================================\n");

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
    // 1. Create / prepare a dedicated test product in PostgreSQL with standard 24-hex ID
    const crypto = require("crypto");
    const testProdId = crypto.randomBytes(12).toString("hex");
    const initialStock = 15;
    const purchaseQty = 3;

    await db.query(
      `INSERT INTO products (id, name, slug, description, price, category, stock, active, is_available)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        testProdId,
        "Stock Test Gemstone",
        `stock-test-${Date.now()}`,
        "Gemstone for stock reduction testing",
        500.00,
        "Gemstones",
        initialStock,
        true,
        true
      ]
    );

    let paymentRecord = null;

    // 2. Customer adds to cart and calls create-order
    await check("1. POST /api/payments/create-order for product with stock = 15", async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: testProdId, quantity: purchaseQty }],
          gateway: "razorpay"
        })
      });

      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Expected 201, got ${res.status}: ${text}`);
      }

      paymentRecord = await res.json();
      if (!paymentRecord.recordId) throw new Error("Missing recordId");
      if (!paymentRecord.orderId) throw new Error("Missing orderId");
      if (paymentRecord.amount !== 150000) {
        throw new Error(`Expected amount 150000 paise (3 * ₹500), got ${paymentRecord.amount}`);
      }
    });

    // 3. Complete payment on Razorpay and verify
    await check("2. POST /api/payments/verify confirms payment and places order", async () => {
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
    });

    // 4. Verify in PostgreSQL that stock is reduced from 15 to 12
    await check("3. PostgreSQL product stock is reduced from 15 to 12", async () => {
      const res = await db.query("SELECT stock FROM products WHERE id = $1", [testProdId]);
      if (res.rows.length === 0) throw new Error("Product not found");
      const currentStock = Number(res.rows[0].stock);
      const expectedStock = initialStock - purchaseQty; // 15 - 3 = 12
      if (currentStock !== expectedStock) {
        throw new Error(`Expected stock ${expectedStock}, but found ${currentStock}`);
      }
    });

    // 5. Verify GET /api/products returns reduced stock = 12 (cache invalidated)
    await check("4. GET /api/products returns reduced stock = 12", async () => {
      const res = await fetch(`${baseUrl}/api/products/${testProdId}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const data = await res.json();
      const productObj = data.product || data.data || data;
      if (Number(productObj.stock) !== 12) {
        throw new Error(`Expected stock 12 from API, got ${productObj.stock}`);
      }
    });

    // 6. Buy again (qty 2) -> stock should reduce from 12 to 10
    await check("5. Second order reduces stock further from 12 to 10", async () => {
      const createRes = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: testProdId, quantity: 2 }],
          gateway: "razorpay"
        })
      });
      const order2 = await createRes.json();

      const verifyRes = await fetch(`${baseUrl}/api/payments/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: order2.recordId,
          orderId: order2.orderId,
          paymentId: "pay_test_" + Date.now(),
          signature: "test_sig_auto_verified"
        })
      });
      if (verifyRes.status !== 200) throw new Error(`Status ${verifyRes.status}`);

      const dbCheck = await db.query("SELECT stock FROM products WHERE id = $1", [testProdId]);
      const stockAfterSecond = Number(dbCheck.rows[0].stock);
      if (stockAfterSecond !== 10) {
        throw new Error(`Expected stock 10 after second order, got ${stockAfterSecond}`);
      }
    });

    // Cleanup test product
    await db.query("DELETE FROM products WHERE id = $1", [testProdId]);
  } finally {
    server.close();
    await disconnectDatabase();
  }

  console.log("\n==================================================");
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

testProductStockReductionWorkflow().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
