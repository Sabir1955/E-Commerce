const { env, validateEnv } = require("./config/env");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const app = require("./app");
const { releaseExpiredReservations } = require("./services/orderInventory");

let reservationInterval = null;
let serverInstance = null;
let isShuttingDown = false;

/**
 * Graceful server termination:
 * Clears timers, stops accepting new requests, drains active HTTP connections,
 * and disconnects Mongoose cleanly.
 */
async function gracefulShutdown(signal = "SIGTERM") {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

  if (reservationInterval) {
    clearInterval(reservationInterval);
    reservationInterval = null;
    console.log("[Inventory] Stock reservation cleanup timer stopped.");
  }

  // Force exit after 10 seconds if connections fail to drain
  const forceExitTimer = setTimeout(() => {
    console.error("[Server] Forceful shutdown timeout exceeded (10s). Exiting.");
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  if (serverInstance) {
    await new Promise((resolve) => {
      serverInstance.close(() => {
        console.log("[Server] HTTP server closed cleanly. No new connections accepted.");
        resolve();
      });
    });
  }

  await disconnectDatabase();
  console.log("[Server] Graceful shutdown sequence completed.");

  if (require.main === module) {
    process.exit(0);
  }
}

async function start() {
  try {
    // 1. Validate mandatory environment variables
    validateEnv();

    // 2. Connect to MongoDB Atlas (or embedded development database)
    await connectDatabase();
    // Ensure product_images table exists in PostgreSQL
    const { query } = require("./database/db");
    await query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id VARCHAR(64) PRIMARY KEY,
        product_id VARCHAR(64) REFERENCES products(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
        size INT NOT NULL DEFAULT 0,
        data BYTEA NOT NULL,
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_images_is_primary ON product_images(is_primary);
    `).catch((err) => {
      console.warn("[PostgreSQL] product_images table check warning:", err.message);
    });

    // 3. Release any expired stock reservations on startup
    await releaseExpiredReservations().catch((error) => {
      console.error("[Inventory] Unable to release expired stock reservations on startup:", error.message);
    });

    // 4. Run reservation cleanup every 60 seconds
    if (!reservationInterval) {
      reservationInterval = setInterval(() => {
        releaseExpiredReservations().catch((error) => {
          console.error("[Inventory] Error during periodic reservation cleanup:", error.message);
        });
      }, 60 * 1000);
    }

    // 5. Start listening
    const port = env.PORT;
    const host = env.HOST;

    serverInstance = app.listen(port, host, () => {
      console.log("");
      console.log("==========================================");
      console.log("   ASTROLOGY E-COMMERCE API STARTED");
      console.log("==========================================");
      console.log(`Local API:     http://localhost:${port}`);
      console.log(`Network API:   http://${host}:${port}`);
      console.log(`Health:        http://localhost:${port}/api/health`);
      console.log(`Swagger Docs:  http://localhost:${port}/api-docs`);
      console.log(`API Base:      http://localhost:${port}/api`);
      console.log("==========================================");
      console.log("");
    });

    // 6. Register graceful shutdown signals
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    return serverInstance;
  } catch (error) {
    console.error("");
    console.error("==========================================");
    console.error("      UNABLE TO START BACKEND API");
    console.error("==========================================");
    console.error(error.message);
    console.error("==========================================");
    console.error("");
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
module.exports.start = start;
module.exports.gracefulShutdown = gracefulShutdown;