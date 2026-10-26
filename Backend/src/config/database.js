const fs = require("fs");
const path = require("path");
const db = require("../database/db");

let isConnected = false;

function getConnectionState() {
  return isConnected ? "connected" : "disconnected";
}

async function connectDatabase() {
  try {
    console.log("[Database] Connecting to PostgreSQL database...");
    const info = await db.testConnection();
    isConnected = true;
    console.log(`[Database] PostgreSQL connected successfully to: ${info.db}`);

    // Auto-apply schema if needed
    const schemaPath = path.join(__dirname, "../database/schema.sql");
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, "utf8");
      await db.query(sql);
      console.log("[Database] PostgreSQL tables and indexes verified.");
    }

    // Auto-verify consultation schema, column migrations & seed data
    try {
      const { ensureConsultationsSchema } = require("../database/ensureConsultationsSchema");
      await ensureConsultationsSchema();
    } catch (migErr) {
      console.warn("[Database] Consultations schema migration note:", migErr.message);
    }

    return db.pool;
  } catch (err) {
    isConnected = false;
    console.error("[Database Error] PostgreSQL connection error:", err.message);
    throw err;
  }
}

async function disconnectDatabase() {
  if (isConnected) {
    await db.pool.end();
    isConnected = false;
    console.log("[Database] PostgreSQL connection pool closed cleanly.");
  }
}

const MONGO_OPTIONS = {
  maxPoolSize: 50,
  minPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
};

module.exports = {
  connectDatabase,
  disconnectDatabase,
  getConnectionState,
  pool: db.pool,
  query: db.query,
  MONGO_OPTIONS
};
