const db = require('../database/db');

async function migrate() {
  console.log('Adding consultation profile and office columns to astrologers table...');
  await db.query(`
    ALTER TABLE astrologers
    ADD COLUMN IF NOT EXISTS consultation_title VARCHAR(255) DEFAULT 'Vedic Astrology Consultation',
    ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255) DEFAULT 'Astro Nirvan',
    ADD COLUMN IF NOT EXISTS venue_title VARCHAR(255) DEFAULT 'Physical Office Venue — Patna',
    ADD COLUMN IF NOT EXISTS visiting_hours VARCHAR(255) DEFAULT '10:00 AM – 06:30 PM (IST)',
    ADD COLUMN IF NOT EXISTS working_days VARCHAR(255) DEFAULT 'Monday to Saturday';
  `);

  // Update active astrologer if values are null
  await db.query(`
    UPDATE astrologers SET
      consultation_title = COALESCE(consultation_title, 'Vedic Astrology Consultation'),
      organization_name = COALESCE(organization_name, 'Astro Nirvan'),
      venue_title = COALESCE(venue_title, 'Physical Office Venue — Patna'),
      visiting_hours = COALESCE(visiting_hours, '10:00 AM – 06:30 PM (IST)'),
      working_days = COALESCE(working_days, 'Monday to Saturday')
    WHERE active = TRUE;
  `);

  const res = await db.query('SELECT id, name, consultation_title, organization_name, venue_title, visiting_hours, working_days FROM astrologers WHERE active = TRUE;');
  console.log('Migrated successfully:', res.rows);
  process.exit(0);
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
