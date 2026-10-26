/**
 * Comprehensive AES-256-GCM Encryption and Decryption Verification Suite
 * Location: Backend/src/scripts/testAesEncryptionWorkflow.js
 *
 * Validates:
 * 1. Configuration validation (missing env variables, invalid key formats/lengths)
 * 2. Symmetric encryption/decryption for strings and complex JSON objects
 * 3. Unique IV / nonce generation per encryption operation
 * 4. Tampered ciphertext rejection (auth tag verification)
 * 5. Tampered authentication tag rejection
 * 6. Incorrect key rejection
 * 7. Malformed payload handling (missing IV, missing tag, invalid base64)
 * 8. Compact field-level encryption/decryption ("enc:v1:...")
 * 9. Express middleware behavior (auto-decryption, error rejection, unencrypted pass-through)
 * 10. Web Crypto API (SubtleCrypto) cross-platform interoperability
 */

const crypto = require("crypto");
const { aesEncryptionService, AesEncryptionService } = require("../services/aes_encryption");

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ [PASS] ${message}`);
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("  ASTRO NIRVAN AES-256-GCM SECURITY VERIFICATION SUITE");
  console.log("=======================================================\n");

  const validHexKey = crypto.randomBytes(32).toString("hex");
  const wrongHexKey = crypto.randomBytes(32).toString("hex");

  // -----------------------------------------------------------------
  // 1. Configuration & Key Format Validation
  // -----------------------------------------------------------------
  console.log("1. Configuration and Key Validation Tests:");
  {
    const svc = new AesEncryptionService();

    // Valid 64-char hex key
    const parsedHex = svc.parseKey(validHexKey);
    assert(Buffer.isBuffer(parsedHex) && parsedHex.length === 32, "Accepts valid 64-character hex key");

    // Valid Base64 key
    const base64Key = crypto.randomBytes(32).toString("base64");
    const parsedB64 = svc.parseKey(base64Key);
    assert(Buffer.isBuffer(parsedB64) && parsedB64.length === 32, "Accepts valid 32-byte Base64 key");

    // Invalid short key
    let caughtShort = false;
    try {
      svc.parseKey("short-invalid-key");
    } catch (e) {
      caughtShort = true;
      assert(!e.message.includes("short-invalid-key"), "Error does not leak invalid key value in logs");
    }
    assert(caughtShort, "Rejects short or invalid key length with configuration error");

    // Missing key error when env variable is absent
    const savedEnvKey = process.env.AES_SECRET_KEY;
    const { env: configEnv } = require("../config/env");
    const savedConfigKey = configEnv.AES_SECRET_KEY;
    delete process.env.AES_SECRET_KEY;
    configEnv.AES_SECRET_KEY = "";
    let caughtMissing = false;
    try {
      const emptySvc = new AesEncryptionService();
      emptySvc.parseKey(null);
    } catch (e) {
      caughtMissing = true;
      assert(e.message.includes("AES_SECRET_KEY is missing"), "Identifies missing AES_SECRET_KEY properly");
    }
    process.env.AES_SECRET_KEY = savedEnvKey; // restore
    configEnv.AES_SECRET_KEY = savedConfigKey;
    aesEncryptionService.clearKeyCache();
    assert(caughtMissing, "Throws clean error when environment key is missing");
  }

  // -----------------------------------------------------------------
  // 2. Encryption and Decryption Roundtrip
  // -----------------------------------------------------------------
  console.log("\n2. Symmetric Encryption and Decryption Roundtrip:");
  {
    const samplePayload = {
      orderId: "ORD-2026-9901",
      customer: {
        name: "Aaditya Sharma",
        birthDetails: {
          dob: "1992-05-14",
          tob: "04:30 AM",
          pob: "Varanasi, Uttar Pradesh, India"
        },
        consultationNotes: "Career query regarding Rahu-Ketu dasha transition."
      },
      paymentStatus: "paid"
    };

    const encrypted = aesEncryptionService.encrypt(samplePayload, validHexKey);

    assert(encrypted._encrypted === true, "Encrypted payload has _encrypted: true flag");
    assert(encrypted.algorithm === "aes-256-gcm", "Encrypted payload algorithm is aes-256-gcm");
    assert(typeof encrypted.iv === "string" && encrypted.iv.length > 0, "Payload contains Base64 IV");
    assert(typeof encrypted.tag === "string" && encrypted.tag.length > 0, "Payload contains Base64 Auth Tag");
    assert(typeof encrypted.data === "string" && encrypted.data.length > 0, "Payload contains Base64 Ciphertext");

    const decrypted = aesEncryptionService.decrypt(encrypted, validHexKey);
    assert(
      JSON.stringify(decrypted) === JSON.stringify(samplePayload),
      "Decrypted structured payload matches original object exactly"
    );

    // Plaintext string test
    const stringData = "Namaste Astro Nirvan Secure Consultation";
    const encStr = aesEncryptionService.encrypt(stringData, validHexKey);
    const decStr = aesEncryptionService.decrypt(encStr, validHexKey);
    assert(decStr === stringData, "Plaintext string encryption/decryption roundtrip succeeds");
  }

  // -----------------------------------------------------------------
  // 3. Unique IV / Nonce per Operation
  // -----------------------------------------------------------------
  console.log("\n3. Unique IV / Nonce Security Tests:");
  {
    const testData = { secret: "Sensitive Horoscope Data" };
    const enc1 = aesEncryptionService.encrypt(testData, validHexKey);
    const enc2 = aesEncryptionService.encrypt(testData, validHexKey);

    assert(enc1.iv !== enc2.iv, "Two encryptions of identical data produce distinct IVs");
    assert(enc1.data !== enc2.data, "Two encryptions of identical data produce distinct ciphertexts");
    assert(
      Buffer.from(enc1.iv, "base64").length === 12,
      "IV length is exactly 12 bytes (96 bits recommended for GCM)"
    );
  }

  // -----------------------------------------------------------------
  // 4. Tampered Ciphertext & Tag Rejection (GCM Integrity Verification)
  // -----------------------------------------------------------------
  console.log("\n4. Tamper Detection & Authentication Tag Verification:");
  {
    const original = { account: "sensitive-account", balance: 50000 };
    const enc = aesEncryptionService.encrypt(original, validHexKey);

    // 4.1 Tamper 1 byte in ciphertext
    const rawCiphertext = Buffer.from(enc.data, "base64");
    rawCiphertext[0] ^= 1;
    const tamperedDataPayload = { ...enc, data: rawCiphertext.toString("base64") };

    let caughtTamperData = false;
    try {
      aesEncryptionService.decrypt(tamperedDataPayload, validHexKey);
    } catch (e) {
      caughtTamperData = true;
      assert(
        e.message.includes("Authentication tag verification failed"),
        "Safely rejects tampered ciphertext without leaking internal stack"
      );
    }
    assert(caughtTamperData, "Tampered ciphertext is strictly rejected");

    // 4.2 Tamper 1 byte in authentication tag
    const rawTag = Buffer.from(enc.tag, "base64");
    rawTag[0] ^= 1;
    const tamperedTagPayload = { ...enc, tag: rawTag.toString("base64") };

    let caughtTamperTag = false;
    try {
      aesEncryptionService.decrypt(tamperedTagPayload, validHexKey);
    } catch (e) {
      caughtTamperTag = true;
      assert(
        e.message.includes("Authentication tag verification failed"),
        "Safely rejects tampered authentication tag without leaking internal stack"
      );
    }
    assert(caughtTamperTag, "Tampered authentication tag is strictly rejected");

    // 4.3 Attempt decryption with incorrect key
    let caughtWrongKey = false;
    try {
      aesEncryptionService.decrypt(enc, wrongHexKey);
    } catch (e) {
      caughtWrongKey = true;
      assert(
        e.message.includes("Authentication tag verification failed"),
        "Decryption with incorrect key fails safely via tag verification"
      );
    }
    assert(caughtWrongKey, "Incorrect encryption key is strictly rejected");
  }

  // -----------------------------------------------------------------
  // 5. Malformed Payload Handling
  // -----------------------------------------------------------------
  console.log("\n5. Malformed Payload Rejection:");
  {
    const invalidCases = [
      { name: "null payload", payload: null },
      { name: "empty object", payload: {} },
      { name: "missing tag", payload: { iv: "abc", data: "xyz" } },
      { name: "missing iv", payload: { tag: "abc", data: "xyz" } },
      { name: "missing data", payload: { iv: "abc", tag: "xyz" } },
      { name: "invalid IV length", payload: { iv: Buffer.from("short").toString("base64"), tag: Buffer.alloc(16).toString("base64"), data: "xyz" } },
      { name: "invalid tag length", payload: { iv: Buffer.alloc(12).toString("base64"), tag: Buffer.from("short").toString("base64"), data: "xyz" } },
      { name: "malformed JSON string", payload: "{invalid-json-string}" }
    ];

    for (const testCase of invalidCases) {
      let rejected = false;
      try {
        aesEncryptionService.decrypt(testCase.payload, validHexKey);
      } catch (e) {
        rejected = true;
      }
      assert(rejected, `Correctly rejects malformed payload: ${testCase.name}`);
    }
  }

  // -----------------------------------------------------------------
  // 6. Compact Field-Level Encryption
  // -----------------------------------------------------------------
  console.log("\n6. Compact Field-Level Encryption:");
  {
    const sensitiveField = "Confidential kundli matching comments";
    const encryptedField = aesEncryptionService.encryptField(sensitiveField, validHexKey);

    assert(encryptedField.startsWith("enc:v1:"), "Compact field format starts with enc:v1:");
    assert(encryptedField.split(":").length === 5, "Compact field format contains 5 colon-separated parts");

    const decryptedField = aesEncryptionService.decryptField(encryptedField, validHexKey);
    assert(decryptedField === sensitiveField, "Compact field decrypts back to original string");

    // Non-encrypted string pass-through
    assert(
      aesEncryptionService.decryptField("regular-unencrypted-text", validHexKey) === "regular-unencrypted-text",
      "Regular non-encrypted string passes through decryptField unchanged"
    );
  }

  // -----------------------------------------------------------------
  // 7. Express Middleware Integration
  // -----------------------------------------------------------------
  console.log("\n7. Express Middleware Integration Tests:");
  {
    const middleware = aesEncryptionService.middleware();

    // 7.1 Auto-decrypt valid encrypted request body
    const activeKey = aesEncryptionService.getMasterKey();
    const req1 = {
      body: aesEncryptionService.encrypt({ clientNote: "Confidential Astro Query" }, activeKey)
    };
    const res1 = {
      status: (code) => ({ json: (d) => {} })
    };
    let next1Called = false;
    middleware(req1, res1, () => { next1Called = true; });

    assert(next1Called, "Middleware calls next() for valid encrypted body");
    assert(req1._wasEncrypted === true, "Middleware sets _wasEncrypted flag");
    assert(req1.body.clientNote === "Confidential Astro Query", "Middleware decrypts body into req.body");

    // 7.2 Pass through unencrypted request body (e.g. Razorpay/Easebuzz webhook or public APIs)
    const req2 = {
      body: { razorpay_payment_id: "pay_test_123", amount: 1500 }
    };
    let next2Called = false;
    middleware(req2, res1, () => { next2Called = true; });

    assert(next2Called, "Middleware calls next() for unencrypted body without modifying it");
    assert(req2.body.razorpay_payment_id === "pay_test_123", "Preserves unencrypted body completely");

    // 7.3 Safely reject tampered encrypted request body with 400 Bad Request
    const tamperedReq = {
      body: {
        _encrypted: true,
        iv: Buffer.alloc(12).toString("base64"),
        tag: Buffer.alloc(16).toString("base64"),
        data: Buffer.from("tampered").toString("base64")
      }
    };
    let responseStatus = 0;
    let responseJson = null;
    const mockRes = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => { responseJson = data; }
        };
      }
    };

    middleware(tamperedReq, mockRes, () => {});
    assert(responseStatus === 400, "Middleware returns HTTP 400 Bad Request for tampered payload");
    assert(
      responseJson && responseJson.message === "Invalid or tampered encrypted payload",
      "Middleware returns safe error message without exposing cryptographic details"
    );
  }

  // -----------------------------------------------------------------
  // 8. Browser Web Crypto API (SubtleCrypto) Cross-Compatibility
  // -----------------------------------------------------------------
  console.log("\n8. Web Crypto API (SubtleCrypto) Cross-Platform Interoperability:");
  {
    const subtle = globalThis.crypto.subtle;
    const keyBuf = Buffer.from(validHexKey, "hex");
    const webKey = await subtle.importKey(
      "raw",
      keyBuf,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );

    // Node.js encrypts -> Browser SubtleCrypto decrypts
    const nodeEncrypted = aesEncryptionService.encrypt(
      { source: "NodeExpressServer", message: "Interoperable message" },
      validHexKey
    );

    const ivBuf = Buffer.from(nodeEncrypted.iv, "base64");
    const tagBuf = Buffer.from(nodeEncrypted.tag, "base64");
    const dataBuf = Buffer.from(nodeEncrypted.data, "base64");

    const combinedBytes = new Uint8Array(dataBuf.length + tagBuf.length);
    combinedBytes.set(new Uint8Array(dataBuf), 0);
    combinedBytes.set(new Uint8Array(tagBuf), dataBuf.length);

    const webDecryptedBuf = await subtle.decrypt(
      { name: "AES-GCM", iv: ivBuf, tagLength: 128 },
      webKey,
      combinedBytes
    );
    const webDecryptedStr = new TextDecoder().decode(webDecryptedBuf);
    const webDecryptedObj = JSON.parse(webDecryptedStr);

    assert(
      webDecryptedObj.source === "NodeExpressServer",
      "Web Crypto (browser) successfully decrypts payload encrypted by Node.js"
    );

    // Browser SubtleCrypto encrypts -> Node.js decrypts
    const browserIv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const browserText = JSON.stringify({ source: "AngularBrowserApp", note: "Customer Horoscope Secret" });
    const browserTextBytes = new TextEncoder().encode(browserText);

    const browserEncBuf = await subtle.encrypt(
      { name: "AES-GCM", iv: browserIv, tagLength: 128 },
      webKey,
      browserTextBytes
    );
    const browserTotal = new Uint8Array(browserEncBuf);
    const browserData = browserTotal.slice(0, browserTotal.length - 16);
    const browserTag = browserTotal.slice(browserTotal.length - 16);

    const payloadFromBrowser = {
      _encrypted: true,
      algorithm: "aes-256-gcm",
      iv: Buffer.from(browserIv).toString("base64"),
      tag: Buffer.from(browserTag).toString("base64"),
      data: Buffer.from(browserData).toString("base64")
    };

    const nodeDecryptedFromBrowser = aesEncryptionService.decrypt(payloadFromBrowser, validHexKey);
    assert(
      nodeDecryptedFromBrowser.source === "AngularBrowserApp",
      "Node.js successfully decrypts payload encrypted by Web Crypto (browser)"
    );
  }

  console.log("\n=======================================================");
  console.log(`  ALL ${passedTests}/${totalTests} AES-256-GCM SECURITY TESTS PASSED`);
  console.log("=======================================================\n");
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
