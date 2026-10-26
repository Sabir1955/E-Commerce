const { Pool } = require("pg");
require("dotenv").config();

// Determine connection URL from environment or standard defaults
const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.PGUSER || "postgres"}:${process.env.PGPASSWORD || "postgres"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || "astro_ecommerce"}`;

const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_MAX_POOL_SIZE) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
});

pool.on("error", (err) => {
  console.error("[PostgreSQL Pool Error]", err.message);
});

/**
 * Execute parameterized query
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL === "true") {
    console.log(`[SQL] ${text.slice(0, 80)}... (${duration}ms, ${res.rowCount} rows)`);
  }
  return res;
}

/**
 * Acquire client for manual transaction handling
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Transaction wrapper with automatic rollback on error
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test PostgreSQL connectivity
 */
async function testConnection() {
  const res = await query("SELECT current_database() AS db, version() AS version, NOW() AS now;");
  return res.rows[0];
}

module.exports = {
  pool,
  query,
  getClient,
  transaction,
  testConnection
};
