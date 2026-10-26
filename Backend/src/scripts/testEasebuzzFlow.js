require("dotenv").config();
const http = require("http");
const crypto = require("crypto");
const app = require("../app");
const { connectDatabase, disconnectDatabase } = require("../config/database");
const easebuzzService = require("../services/easebuzz");
const swaggerDoc = require("../swagger");

async function runEasebuzzTests() {
  console.log("=================================================");
  console.log("Testing Easebuzz & Dual Payment Gateway System");
  console.log("=================================================\n");

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
    // 1. Credentials & Service Configuration
    await check("1. Easebuzz credentials & env setup", async () => {
      const creds = easebuzzService.getCredentials();
      if (!creds.key) throw new Error("Missing EASEBUZZ_KEY in environment");
      if (!creds.salt) throw new Error("Missing EASEBUZZ_SALT in environment");
      if (!creds.baseUrl) throw new Error("Missing EASEBUZZ_BASE_URL");
      if (creds.key.length < 5 || creds.salt.length < 5) throw new Error("Invalid key or salt format");
    });

    // 2. Hash Generation Formula Verification
    await check("2. Easebuzz initiate hash calculation matches official format", async () => {
      const sample = {
        key: "TESTKEY123",
        txnid: "TXN_001",
        amount: 999.00,
        productinfo: "Astrology Yantra",
        firstname: "Rahul",
        email: "rahul@example.com",
        udf1: "",
        udf2: "",
        udf3: "",
        udf4: "",
        udf5: ""
      };
      const salt = "TESTSALT456";
      const hash = easebuzzService.generateInitiateHash(sample, salt);

      const expectedString = `TESTKEY123|TXN_001|999.00|Astrology Yantra|Rahul|rahul@example.com|||||||||||TESTSALT456`;
      const expectedHash = crypto.createHash("sha512").update(expectedString).digest("hex").toLowerCase();

      if (hash !== expectedHash) {
        throw new Error(`Hash mismatch! Expected: ${expectedHash}, Got: ${hash}`);
      }
    });

    // 3. Reverse Response Hash Verification
    await check("3. Easebuzz reverse response hash verification", async () => {
      const salt = "TESTSALT456";
      const key = "TESTKEY123";
      const payload = {
        key,
        status: "success",
        amount: "999.00",
        txnid: "TXN_001",
        firstname: "Rahul",
        email: "rahul@example.com",
        productinfo: "Astrology Yantra",
        udf1: "",
        udf2: "",
        udf3: "",
        udf4: "",
        udf5: "",
        udf6: "",
        udf7: "",
        udf8: "",
        udf9: "",
        udf10: ""
      };
      const hashStr = `${salt}|success|||||||||||rahul@example.com|Rahul|Astrology Yantra|999.00|TXN_001|${key}`;
      payload.hash = crypto.createHash("sha512").update(hashStr).digest("hex").toLowerCase();

      const isValid = easebuzzService.verifyResponseHash(payload, salt);
      if (!isValid) throw new Error("Expected valid response hash to pass verification");

      // Test with tampered hash
      const isInvalid = easebuzzService.verifyResponseHash({ ...payload, hash: "tampered_hash_value" }, salt);
      if (isInvalid) throw new Error("Expected tampered hash to fail verification");
    });

    // 4. Razorpay order creation still works (Gateway 1 - No regression)
    let rzpRecord = null;
    await check("4. Razorpay payment creation (Gateway 1 - existing flow intact)", async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway: "razorpay",
          items: [{ productId: 1, quantity: 1 }]
        })
      });
      if (res.status !== 201) throw new Error(`Status ${res.status}`);
      rzpRecord = await res.json();
      if (!rzpRecord.recordId) throw new Error("Missing recordId");
      if (rzpRecord.paymentMethod !== "razorpay") throw new Error("Expected razorpay paymentMethod");
      if (!rzpRecord.keyId) throw new Error("Missing keyId");
      if (rzpRecord.amount !== 99900) throw new Error(`Expected 99900, got ${rzpRecord.amount}`);
    });

    // 5. Razorpay verification still works (Gateway 1 - existing flow intact)
    await check("5. Razorpay payment verification (Gateway 1)", async () => {
      const res = await fetch(`${baseUrl}/api/payments/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: rzpRecord.recordId,
          orderId: rzpRecord.orderId,
          paymentId: "pay_test_" + Date.now(),
          signature: "test_sig_verified"
        })
      });
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (data.status !== "paid") throw new Error(`Expected paid status, got ${data.status}`);
    });

    // 6. Easebuzz Payment Initiation (Gateway 2 - New Feature)
    let ebzRecord = null;
    await check("6. POST /api/payments/create-order with gateway=easebuzz initiates Easebuzz order", async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway: "easebuzz",
          items: [{ productId: 1, quantity: 1 }],
          shippingAddress: {
            fullName: "Aarav Sharma",
            mobile: "+919876543210",
            email: "aarav@gmail.com",
            address: "108 Ganga Ghat",
            city: "Varanasi",
            state: "Uttar Pradesh",
            postalCode: "221001"
          }
        })
      });
      if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Expected 201, got ${res.status}: ${text}`);
      }
      ebzRecord = await res.json();
      if (!ebzRecord.recordId) throw new Error("Missing recordId");
      if (ebzRecord.paymentMethod !== "easebuzz") throw new Error(`Expected easebuzz, got ${ebzRecord.paymentMethod}`);
      if (!ebzRecord.accessKey && !ebzRecord.txnid) throw new Error("Missing accessKey/txnid");
      if (ebzRecord.amount !== 99900) throw new Error(`Expected 99900, got ${ebzRecord.amount}`);
      if (!ebzRecord.payUrl) throw new Error("Missing payUrl");
    });

    // 7. Easebuzz Successful Payment Verification with Valid Hash
    await check("7. POST /api/payments/easebuzz/verify verifies success response & marks order paid", async () => {
      const creds = easebuzzService.getCredentials();
      const amount = "999.00";
      const hashStr = `${creds.salt}|success|||||||||||aarav@gmail.com|Aarav|Astrology Products Checkout|${amount}|${ebzRecord.txnid}|${creds.key}`;
      const validHash = crypto.createHash("sha512").update(hashStr).digest("hex").toLowerCase();

      const res = await fetch(`${baseUrl}/api/payments/easebuzz/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: ebzRecord.recordId,
          txnid: ebzRecord.txnid,
          status: "success",
          easepayid: "EASEPAY_" + Date.now(),
          amount: 999.00,
          firstname: "Aarav",
          email: "aarav@gmail.com",
          productinfo: "Astrology Products Checkout",
          hash: validHash
        })
      });

      if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Expected 200, got ${res.status}: ${text}`);
      }
      const data = await res.json();
      if (data.status !== "paid") throw new Error(`Expected paid status, got ${data.status}`);
      if (data.paymentMethod !== "easebuzz") throw new Error(`Expected easebuzz, got ${data.paymentMethod}`);
    });

    // 8. Idempotency Check (Duplicate callback does not create duplicate order or error)
    await check("8. Easebuzz verification idempotency prevents duplicate payment processing", async () => {
      const res = await fetch(`${baseUrl}/api/payments/easebuzz/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: ebzRecord.recordId,
          txnid: ebzRecord.txnid,
          status: "success"
        })
      });
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (data.status !== "paid") throw new Error(`Expected already paid order, got ${data.status}`);
    });

    // 9. Tampered Hash Rejection
    await check("9. Easebuzz verification rejects tampered response hash", async () => {
      // Create new order to test
      const initRes = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway: "easebuzz",
          items: [{ productId: 2, quantity: 1 }]
        })
      });
      const newEbz = await initRes.json();

      const verifyRes = await fetch(`${baseUrl}/api/payments/easebuzz/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: newEbz.recordId,
          txnid: newEbz.txnid,
          status: "success",
          amount: 799.00,
          hash: "fraudulent_tampered_hash_xyz"
        })
      });
      if (verifyRes.status !== 400) {
        throw new Error(`Expected 400 for tampered hash, got ${verifyRes.status}`);
      }
    });

    // 10. Amount Validation Failure
    await check("10. Easebuzz verification rejects mismatched amount", async () => {
      const initRes = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway: "easebuzz",
          items: [{ productId: 3, quantity: 1 }] // 599
        })
      });
      const orderMismatch = await initRes.json();

      const verifyRes = await fetch(`${baseUrl}/api/payments/easebuzz/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: orderMismatch.recordId,
          txnid: orderMismatch.txnid,
          status: "success",
          amount: 100.00 // Intentionally incorrect amount
        })
      });
      if (verifyRes.status !== 400) {
        throw new Error(`Expected 400 for amount mismatch, got ${verifyRes.status}`);
      }
    });

    // 11. User Cancellation Handling (Never marks order as paid)
    await check("11. Easebuzz cancelled response marks payment cancelled and never paid", async () => {
      const initRes = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway: "easebuzz",
          items: [{ productId: 1, quantity: 1 }]
        })
      });
      const cancelOrder = await initRes.json();

      const cancelRes = await fetch(`${baseUrl}/api/payments/easebuzz/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: cancelOrder.recordId,
          txnid: cancelOrder.txnid,
          status: "usercancelled"
        })
      });
      const data = await cancelRes.json();
      if (data.status !== "cancelled") throw new Error(`Expected cancelled, got ${data.status}`);
    });

    // 12. Payment Failure Handling (Never marks order as paid)
    await check("12. Easebuzz failure response records failure and never marks paid", async () => {
      const initRes = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway: "easebuzz",
          items: [{ productId: 2, quantity: 1 }]
        })
      });
      const failOrder = await initRes.json();

      const failRes = await fetch(`${baseUrl}/api/payments/easebuzz/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: failOrder.recordId,
          txnid: failOrder.txnid,
          status: "failure",
          error_Message: "Card limit exceeded"
        })
      });
      const data = await failRes.json();
      if (data.status !== "failed") throw new Error(`Expected failed, got ${data.status}`);
    });

    // 13. Pending Payment Handling
    await check("13. Easebuzz pending response marks payment pending and never paid", async () => {
      const initRes = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway: "easebuzz",
          items: [{ productId: 1, quantity: 1 }]
        })
      });
      const pendingOrder = await initRes.json();

      const pendingRes = await fetch(`${baseUrl}/api/payments/easebuzz/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: pendingOrder.recordId,
          txnid: pendingOrder.txnid,
          status: "pending"
        })
      });
      const data = await pendingRes.json();
      if (data.status !== "pending") throw new Error(`Expected pending, got ${data.status}`);
    });

    // 14. Swagger Documentation Verification
    await check("14. Swagger documentation contains Easebuzz and payment routes", async () => {
      const paths = swaggerDoc.paths || {};
      const expectedPaths = [
        "/api/payments/create-order",
        "/api/payments/verify",
        "/api/payments/easebuzz/create-order",
        "/api/payments/easebuzz/verify",
        "/api/payments/easebuzz/callback"
      ];
      for (const p of expectedPaths) {
        if (!paths[p]) {
          throw new Error(`Swagger missing path: ${p}`);
        }
      }
    });

  } finally {
    server.close();
    await disconnectDatabase();
  }

  console.log("\n=================================================");
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runEasebuzzTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
