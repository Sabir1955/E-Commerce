const db = require("../database/db");

async function migrate() {
  console.log("=== Updating Astrologer & Consultation Services for 30, 45, 60, 90 mins ===");

  await db.query(`
    UPDATE astrologers
    SET allowed_durations = $1,
        duration_pricing = $2
    WHERE id = 'astro_poonam_vaish_mam'
  `, [
    JSON.stringify([30, 45, 60, 90]),
    JSON.stringify({
      online: { "30": 799, "45": 1099, "60": 1499, "90": 1999 },
      offline: { "30": 999, "45": 1399, "60": 1799, "90": 2499 }
    })
  ]);

  await db.query(`
    UPDATE consultation_services
    SET allowed_durations = $1,
        duration_pricing = $2
  `, [
    JSON.stringify([30, 45, 60, 90]),
    JSON.stringify({
      online: { "30": 799, "45": 1099, "60": 1499, "90": 1999 },
      offline: { "30": 999, "45": 1399, "60": 1799, "90": 2499 }
    })
  ]);

  console.log("✓ Durations and pricing updated successfully in PostgreSQL!");
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
