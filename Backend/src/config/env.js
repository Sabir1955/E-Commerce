require("dotenv").config();

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
  HOST: process.env.HOST || "0.0.0.0",

  // Database (PostgreSQL)
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/astro_ecommerce",
  PGHOST: process.env.PGHOST || "localhost",
  PGPORT: Number(process.env.PGPORT) || 5432,
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGDATABASE: process.env.PGDATABASE || "astro_ecommerce",

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || "default_jwt_secret_change_in_production",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // AES Payload Encryption (AES-256-GCM)
  AES_SECRET_KEY: process.env.AES_SECRET_KEY || "",

  // Admin Defaults (for createAdmin script)
  ADMIN_NAME: process.env.ADMIN_NAME || "Store Admin",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@example.com",
  ADMIN_MOBILE: process.env.ADMIN_MOBILE || "+919876543210",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "Admin@12345",

  // Policy
  RETURN_POLICY_DAYS: Number(process.env.RETURN_POLICY_DAYS) || 7,

  // Razorpay
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "",

  // Easebuzz
  EASEBUZZ_KEY: process.env.EASEBUZZ_KEY || "",
  EASEBUZZ_SALT: process.env.EASEBUZZ_SALT || "",
  EASEBUZZ_ENV: process.env.EASEBUZZ_ENV || "test",
  EASEBUZZ_BASE_URL: process.env.EASEBUZZ_BASE_URL || "https://testpay.easebuzz.in",

  // SMTP
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
  SMTP_FROM: process.env.SMTP_FROM || "",

  // Twilio
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || "",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || "",
  TWILIO_FROM_PHONE: process.env.TWILIO_FROM_PHONE || "",
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM || "",

  // CORS Allowed Origins
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : [
        "http://localhost:4200",
        "http://localhost:5000",
        "http://localhost:3000",
        "http://127.0.0.1:4200",
        "http://127.0.0.1:5000",
        "http://127.0.0.1:3000"
      ]
};

function validateEnv() {
  const missing = [];
  if (process.env.NODE_ENV === "production" && !env.DATABASE_URL && !env.PGDATABASE) {
    missing.push("DATABASE_URL or PGDATABASE");
  }
  if (!env.JWT_SECRET) {
    missing.push("JWT_SECRET");
  } else if (
    process.env.NODE_ENV === "production" &&
    (env.JWT_SECRET === "default_jwt_secret_change_in_production" || env.JWT_SECRET.length < 32)
  ) {
    missing.push("JWT_SECRET (must be high-entropy and >= 32 characters in production)");
  }
  if (process.env.NODE_ENV === "production" && !env.AES_SECRET_KEY) {
    missing.push("AES_SECRET_KEY (must be 64-char hex or 32-byte key for AES-256-GCM)");
  }

  if (missing.length > 0) {
    throw new Error(`Missing mandatory environment variables: ${missing.join(", ")}`);
  }
}

module.exports = { env, validateEnv };
