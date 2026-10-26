const { query } = require("../database/db");

async function testBytea() {
  console.log("=== Testing PostgreSQL BYTEA storage ===");

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
  `);
  console.log("[PASS] Table product_images created or already exists.");

  const sampleBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
  const testId = "test_img_" + Date.now();

  await query(
    `INSERT INTO product_images (id, product_id, filename, mime_type, size, data, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [testId, null, "test.png", "image/png", sampleBuffer.length, sampleBuffer, true]
  );
  console.log("[PASS] Inserted test buffer into product_images.");

  const res = await query(`SELECT id, filename, mime_type, size, data FROM product_images WHERE id = $1`, [testId]);
  if (res.rows.length === 0) {
    throw new Error("Row not found after insert!");
  }
  const row = res.rows[0];
  console.log(`[PASS] Selected row: id=${row.id}, mime_type=${row.mime_type}, isBuffer=${Buffer.isBuffer(row.data)}, length=${row.data.length}`);

  if (!Buffer.isBuffer(row.data) || !row.data.equals(sampleBuffer)) {
    throw new Error("Selected buffer does not match inserted buffer!");
  }
  console.log("[PASS] BYTEA round-trip verified byte-for-byte!");

  await query(`DELETE FROM product_images WHERE id = $1`, [testId]);
  console.log("[PASS] Cleaned up test record.");
  process.exit(0);
}

testBytea().catch(err => {
  console.error("[FAIL]", err);
  process.exit(1);
});
