/**
 * PostgreSQL Migration: Complete Return & Refund System
 * Location: Backend/src/scripts/migrateReturnAndRefundSchema.js
 */

const db = require("../database/db");

async function migrate() {
  console.log("[Migration] Running Return & Refund schema updates on PostgreSQL...");

  await db.transaction(async (client) => {
    // 1. Add missing columns to returns table
    await client.query(`
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS evidence_images JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS comments TEXT;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS admin_message TEXT;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS refund_gateway VARCHAR(50);
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS refund_status VARCHAR(50) DEFAULT 'pending';
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS refund_error TEXT;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS is_restocked BOOLEAN DEFAULT FALSE;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS restocked_at TIMESTAMPTZ;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]'::jsonb;
    `);

    // 2. Evidence Images Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS return_evidence_images (
        id VARCHAR(64) PRIMARY KEY,
        return_id VARCHAR(64) NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        file_id VARCHAR(64),
        original_name VARCHAR(255),
        file_size INT,
        mime_type VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_return_evidence_return_id ON return_evidence_images(return_id);
    `);

    // 3. Status History Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS return_status_history (
        id VARCHAR(64) PRIMARY KEY,
        return_id VARCHAR(64) NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        from_status VARCHAR(50),
        to_status VARCHAR(50) NOT NULL,
        admin_message TEXT,
        actor_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_return_status_history_return ON return_status_history(return_id);
      CREATE INDEX IF NOT EXISTS idx_return_status_history_created ON return_status_history(created_at);
    `);

    // 4. Refund Transactions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS return_refund_transactions (
        id VARCHAR(64) PRIMARY KEY,
        return_id VARCHAR(64) NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        payment_id VARCHAR(64) REFERENCES payments(id) ON DELETE SET NULL,
        amount NUMERIC(12, 2) NOT NULL,
        gateway VARCHAR(50) NOT NULL, -- 'razorpay' | 'easebuzz' | 'manual'
        gateway_refund_id VARCHAR(100),
        gateway_response JSONB DEFAULT '{}'::jsonb,
        status VARCHAR(50) NOT NULL DEFAULT 'processing', -- 'processing' | 'processed' | 'failed'
        error_message TEXT,
        idempotency_key VARCHAR(100) UNIQUE,
        attempt_count INT DEFAULT 1,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_refund_tx_return_id ON return_refund_transactions(return_id);
      CREATE INDEX IF NOT EXISTS idx_refund_tx_order_id ON return_refund_transactions(order_id);
      CREATE INDEX IF NOT EXISTS idx_refund_tx_idempotency ON return_refund_transactions(idempotency_key);
    `);

    // 5. Messages Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS return_messages (
        id VARCHAR(64) PRIMARY KEY,
        return_id VARCHAR(64) NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        sender_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        sender_role VARCHAR(20) NOT NULL, -- 'admin' | 'customer'
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_return_messages_return_id ON return_messages(return_id);
    `);

    console.log("[Migration] Return & Refund database tables and columns created successfully.");
  });

  process.exit(0);
}

migrate().catch((err) => {
  console.error("[Migration Error]:", err);
  process.exit(1);
});
