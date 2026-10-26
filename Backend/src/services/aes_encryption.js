/**
 * AES-256-GCM Encryption and Decryption Service (Node.js / Express)
 * Location: Backend/src/services/aes_encryption.js
 *
 * Implements authenticated symmetric encryption using AES-256-GCM:
 * - 256-bit (32-byte) key loaded securely from Backend/.env (AES_SECRET_KEY)
 * - 96-bit (12-byte) cryptographically secure unique nonce/IV per encryption
 * - 128-bit (16-byte) authentication tag for tamper detection
 * - Interoperable with browser Web Crypto API (SubtleCrypto)
 */

const crypto = require("crypto");
const { env } = require("../config/env");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 16; // 128 bits auth tag
const KEY_LENGTH = 32; // 256 bits

class AesEncryptionService {
  constructor() {
    this._cachedKeyBuffer = null;
  }

  /**
   * Parse and validate a 32-byte AES key from Buffer, Hex, or Base64 string.
   * Never prints or logs the raw key.
   */
  parseKey(keyInput) {
    if (!keyInput) {
      const envKey = (env && env.AES_SECRET_KEY) || process.env.AES_SECRET_KEY;
      if (!envKey) {
        throw new Error("AES configuration error: AES_SECRET_KEY is missing from environment");
      }
      keyInput = envKey;
    }

    if (Buffer.isBuffer(keyInput)) {
      if (keyInput.length !== KEY_LENGTH) {
        throw new Error(`AES configuration error: Key buffer must be exactly ${KEY_LENGTH} bytes`);
      }
      return keyInput;
    }

    if (typeof keyInput !== "string") {
      throw new Error("AES configuration error: Key must be a hex string, base64 string, or Buffer");
    }

    const trimmed = keyInput.trim();

    // Check 64-char Hex format (32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, "hex");
    }

    // Check Base64 format (32 bytes = 44 chars with padding)
    const base64Buf = Buffer.from(trimmed, "base64");
    if (base64Buf.length === KEY_LENGTH) {
      return base64Buf;
    }

    // Check UTF-8 32-byte string fallback
    const utf8Buf = Buffer.from(trimmed, "utf8");
    if (utf8Buf.length === KEY_LENGTH) {
      return utf8Buf;
    }

    throw new Error(
      `AES configuration error: Invalid key format. Expected 64-char hex string or 32-byte base64 (got length ${trimmed.length})`
    );
  }

  /**
   * Clear cached master key buffer (useful for testing and key rotation).
   */
  clearKeyCache() {
    this._cachedKeyBuffer = null;
  }

  /**
   * Get active master key buffer (cached for performance).
   */
  getMasterKey() {
    if (!this._cachedKeyBuffer) {
      this._cachedKeyBuffer = this.parseKey();
    }
    return this._cachedKeyBuffer;
  }

  /**
   * Encrypt an object, string, or number using AES-256-GCM.
   * Generates a fresh unique 12-byte IV for every invocation.
   *
   * @param {any} data - Plaintext or structured object to encrypt
   * @param {string|Buffer} [customKey] - Optional override key
   * @returns {Object} Canonical encrypted payload object
   */
  encrypt(data, customKey = null) {
    if (data === undefined || data === null) {
      throw new Error("Encryption failed: Data cannot be null or undefined");
    }

    const key = this.parseKey(customKey);
    const iv = crypto.randomBytes(IV_LENGTH);

    const plaintextStr = typeof data === "string" ? data : JSON.stringify(data);
    const plaintextBuffer = Buffer.from(plaintextStr, "utf8");

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertextBuffer = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
    const tagBuffer = cipher.getAuthTag();

    return {
      _encrypted: true,
      algorithm: ALGORITHM,
      iv: iv.toString("base64"),
      tag: tagBuffer.toString("base64"),
      data: ciphertextBuffer.toString("base64")
    };
  }

  /**
   * Decrypt a canonical encrypted payload using AES-256-GCM.
   * Enforces authentication tag verification.
   *
   * @param {Object|string} payload - Encrypted payload with iv, tag, and data
   * @param {string|Buffer} [customKey] - Optional override key
   * @returns {any} Decrypted string or parsed JSON object
   */
  decrypt(payload, customKey = null) {
    if (!payload) {
      throw new Error("Decryption failed: Payload cannot be empty");
    }

    // Support JSON string input
    let parsed = payload;
    if (typeof payload === "string") {
      if (payload.startsWith("enc:v1:")) {
        return this.decryptField(payload, customKey);
      }
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw new Error("Decryption failed: Malformed JSON payload");
      }
    }

    if (typeof parsed !== "object" || !parsed.iv || !parsed.tag || !parsed.data) {
      throw new Error("Decryption failed: Malformed encrypted payload structure");
    }

    const key = this.parseKey(customKey);
    const ivBuffer = Buffer.from(parsed.iv, "base64");
    const tagBuffer = Buffer.from(parsed.tag, "base64");
    const dataBuffer = Buffer.from(parsed.data, "base64");

    if (ivBuffer.length !== IV_LENGTH) {
      throw new Error("Decryption failed: Invalid IV length");
    }
    if (tagBuffer.length !== TAG_LENGTH) {
      throw new Error("Decryption failed: Invalid authentication tag length");
    }
    if (dataBuffer.length === 0) {
      throw new Error("Decryption failed: Ciphertext data is empty");
    }

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(tagBuffer);

      const decryptedBuffer = Buffer.concat([decipher.update(dataBuffer), decipher.final()]);
      const decryptedText = decryptedBuffer.toString("utf8");

      try {
        return JSON.parse(decryptedText);
      } catch {
        return decryptedText;
      }
    } catch (err) {
      // Never leak internal cryptographic stack traces or key info
      throw new Error("Decryption failed: Authentication tag verification failed or ciphertext tampered");
    }
  }

  /**
   * Compact field-level encryption for individual sensitive attributes
   * Returns "enc:v1:<iv_b64>:<tag_b64>:<data_b64>"
   */
  encryptField(value, customKey = null) {
    if (value === undefined || value === null) return value;
    const payload = this.encrypt(value, customKey);
    return `enc:v1:${payload.iv}:${payload.tag}:${payload.data}`;
  }

  /**
   * Compact field-level decryption
   */
  decryptField(compactString, customKey = null) {
    if (typeof compactString !== "string" || !compactString.startsWith("enc:v1:")) {
      return compactString;
    }
    const parts = compactString.split(":");
    if (parts.length !== 5) {
      throw new Error("Decryption failed: Invalid compact field encryption format");
    }
    const [, , iv, tag, data] = parts;
    return this.decrypt({ _encrypted: true, iv, tag, data }, customKey);
  }

  /**
   * Check whether an object or string is an encrypted payload
   */
  isEncryptedPayload(body) {
    if (!body) return false;
    if (typeof body === "string") {
      return body.startsWith("enc:v1:") || (body.startsWith("{") && body.includes('"_encrypted":true'));
    }
    return Boolean(
      typeof body === "object" &&
        body !== null &&
        (body._encrypted === true || (body.iv && body.tag && body.data))
    );
  }

  /**
   * Express middleware: transparently decrypts request body if encrypted.
   * If request is not encrypted, passes through unchanged.
   * If encrypted but invalid or tampered, returns 400 Bad Request safely.
   */
  middleware() {
    return (req, res, next) => {
      if (!req.body || !this.isEncryptedPayload(req.body)) {
        return next();
      }

      try {
        const decrypted = this.decrypt(req.body);
        req.body = decrypted;
        req._wasEncrypted = true;
        return next();
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: "Invalid or tampered encrypted payload"
        });
      }
    };
  }

  /**
   * Express middleware: selectively encrypts response payload if requested by client
   * or configured for sensitive endpoints.
   */
  responseMiddleware() {
    return (req, res, next) => {
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        const wantsEncryptedResponse =
          req.headers["x-encrypted-response"] === "true" ||
          req.headers["x-payload-encryption"] === "aes-256-gcm";

        if (wantsEncryptedResponse && body && !body._encrypted) {
          try {
            const encryptedBody = this.encrypt(body);
            res.setHeader("X-Payload-Encryption", "aes-256-gcm");
            return originalJson(encryptedBody);
          } catch {
            return originalJson(body);
          }
        }

        return originalJson(body);
      };
      next();
    };
  }
}

const aesEncryptionService = new AesEncryptionService();

module.exports = {
  aesEncryptionService,
  AesEncryptionService
};
