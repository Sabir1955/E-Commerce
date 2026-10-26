const db = require("../database/db");
const crypto = require("crypto");

async function runMigration() {
  console.log("=== STARTING MIGRATION: CONSULTATION SERVICES, OFFICE & PAYMENTS ===");

  // 1. Add Office Address columns to astrologers
  console.log("[1/5] Updating astrologers table...");
  await db.query(`
    ALTER TABLE astrologers
    ADD COLUMN IF NOT EXISTS office_name VARCHAR(255) DEFAULT 'Astro Poonam Vaish Mam — Astro Nirvan',
    ADD COLUMN IF NOT EXISTS office_address TEXT DEFAULT 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri',
    ADD COLUMN IF NOT EXISTS office_city VARCHAR(100) DEFAULT 'Patna',
    ADD COLUMN IF NOT EXISTS office_state VARCHAR(100) DEFAULT 'Bihar',
    ADD COLUMN IF NOT EXISTS office_pincode VARCHAR(20) DEFAULT '800001',
    ADD COLUMN IF NOT EXISTS office_maps_url TEXT DEFAULT 'https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001',
    ADD COLUMN IF NOT EXISTS office_instructions TEXT DEFAULT 'Please arrive 10 minutes prior to your scheduled consultation. Kindly bring your birth date, time, and place details.',
    ADD COLUMN IF NOT EXISTS allow_online BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_offline BOOLEAN DEFAULT TRUE;
  `);

  // 2. Create consultation_services table
  console.log("[2/5] Creating consultation_services table...");
  await db.query(`
    CREATE TABLE IF NOT EXISTS consultation_services (
      id VARCHAR(64) PRIMARY KEY,
      astrologer_id VARCHAR(64) REFERENCES astrologers(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100) DEFAULT 'Vedic Astrology',
      active BOOLEAN DEFAULT TRUE,
      allow_online BOOLEAN DEFAULT TRUE,
      allow_offline BOOLEAN DEFAULT TRUE,
      online_fee NUMERIC(10, 2) NOT NULL DEFAULT 899.00,
      offline_fee NUMERIC(10, 2) NOT NULL DEFAULT 1199.00,
      allowed_durations JSONB DEFAULT '[15, 30, 60]'::jsonb,
      duration_pricing JSONB DEFAULT '{"online": {"15": 499, "30": 899, "60": 1599}, "offline": {"15": 699, "30": 1199, "60": 2099}}'::jsonb,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // 3. Update consultation_bookings table
  console.log("[3/5] Updating consultation_bookings table...");
  await db.query(`
    ALTER TABLE consultation_bookings
    ADD COLUMN IF NOT EXISTS service_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS service_name VARCHAR(255) DEFAULT 'General Vedic Consultation',
    ADD COLUMN IF NOT EXISTS consultation_mode VARCHAR(32) DEFAULT 'online',
    ADD COLUMN IF NOT EXISTS office_address TEXT,
    ADD COLUMN IF NOT EXISTS office_maps_url TEXT,
    ADD COLUMN IF NOT EXISTS slot_hold_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_gateway_order_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS payment_transaction_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS payment_signature TEXT,
    ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'razorpay',
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32),
    ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS refund_reason TEXT,
    ADD COLUMN IF NOT EXISTS refund_transaction_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
  `);

  // 4. Update payments table
  console.log("[4/5] Updating payments table...");
  await db.query(`
    ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS booking_id VARCHAR(64);
  `);

  // 5. Seed / Update Astro Poonam Vaish Mam
  console.log("[5/5] Configuring Astro Poonam Vaish Mam & Consultation Services...");
  
  // First, deactivate all other astrologers so only Astro Poonam Vaish Mam is active
  await db.query(`UPDATE astrologers SET active = FALSE`);

  const poonamId = "astro_poonam_vaish_mam";
  const existingPoonam = await db.query(`SELECT id FROM astrologers WHERE id = $1 OR name ILIKE '%Poonam Vaish%'`, [poonamId]);

  let activePoonamId = poonamId;
  if (existingPoonam.rows.length === 0) {
    await db.query(`
      INSERT INTO astrologers (
        id, name, email, phone, photo_url, experience_years, rating, review_count,
        specialties, languages, bio, allowed_durations, duration_pricing,
        office_name, office_address, office_city, office_state, office_pincode, office_maps_url,
        office_instructions, allow_online, allow_offline, active, display_order, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19,
        $20, TRUE, TRUE, TRUE, 1, NOW(), NOW()
      )
    `, [
      poonamId,
      "Astro Poonam Vaish Mam",
      "poonam.vaish@astronirvan.com",
      "+91 98765 43210",
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80",
      22,
      4.98,
      560,
      JSON.stringify(["Vedic Astrology", "Kundali Milan", "Vastu Shastra", "Gemstone Therapy", "Career & Wealth Guidance", "Marriage & Relationship Remedies"]),
      JSON.stringify(["Hindi", "English", "Bhojpuri"]),
      "Distinguished Senior Vedic Astrologer and Vastu Specialist at Astro Nirvan with over 22 years of profound experience in Janam Kundali matching, career horoscope analysis, commercial/residential Vastu, and sacred planetary remedies.",
      JSON.stringify([15, 30, 60]),
      JSON.stringify({
        "15": 499,
        "30": 899,
        "60": 1599,
        "online": { "15": 499, "30": 899, "60": 1599 },
        "offline": { "15": 699, "30": 1199, "60": 2099 }
      }),
      "Astro Poonam Vaish Mam — Astro Nirvan",
      "Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri",
      "Patna",
      "Bihar",
      "800001",
      "https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001",
      "Please arrive 10 minutes prior to your scheduled consultation. Kindly bring your Janam Kundali or birth details (Date, Time, Place of Birth)."
    ]);
    console.log("  -> Inserted Astro Poonam Vaish Mam");
  } else {
    activePoonamId = existingPoonam.rows[0].id;
    await db.query(`
      UPDATE astrologers SET
        name = 'Astro Poonam Vaish Mam',
        email = 'poonam.vaish@astronirvan.com',
        phone = '+91 98765 43210',
        active = TRUE,
        allow_online = TRUE,
        allow_offline = TRUE,
        display_order = 1,
        office_name = 'Astro Poonam Vaish Mam — Astro Nirvan',
        office_address = 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri',
        office_city = 'Patna',
        office_state = 'Bihar',
        office_pincode = '800001',
        office_maps_url = 'https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001',
        office_instructions = 'Please arrive 10 minutes prior to your scheduled consultation. Kindly bring your Janam Kundali or birth details (Date, Time, Place of Birth).',
        duration_pricing = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [
      JSON.stringify({
        "15": 499,
        "30": 899,
        "60": 1599,
        "online": { "15": 499, "30": 899, "60": 1599 },
        "offline": { "15": 699, "30": 1199, "60": 2099 }
      }),
      activePoonamId
    ]);
    console.log(`  -> Updated Astro Poonam Vaish Mam (${activePoonamId})`);
  }

  // Ensure weekly schedule for Astro Poonam Vaish Mam
  for (let day = 0; day <= 6; day++) {
    const availId = `avail_poonam_${day}`;
    await db.query(`
      INSERT INTO astrologer_availability (
        id, astrologer_id, day_of_week, start_time, end_time, break_start, break_end, is_active
      ) VALUES ($1, $2, $3, '09:00', '19:00', '13:00', '14:00', $4)
      ON CONFLICT (astrologer_id, day_of_week) DO UPDATE SET
        start_time = '09:00',
        end_time = '19:00',
        break_start = '13:00',
        break_end = '14:00',
        is_active = $4
    `, [availId, activePoonamId, day, day !== 0]); // Sunday off or active
  }

  // Seed Consultation Services
  const SERVICES = [
    {
      id: "srv_kundali_life",
      name: "Complete Vedic Kundali & Life Guidance",
      category: "Vedic Astrology",
      description: "Comprehensive birth chart analysis covering planetary periods (Dasha), health, career trajectory, and personalized astrological guidance.",
      allowOnline: true,
      allowOffline: true,
      onlineFee: 899,
      offlineFee: 1199,
      durations: [15, 30, 60],
      durationPricing: {
        online: { "15": 499, "30": 899, "60": 1599 },
        offline: { "15": 699, "30": 1199, "60": 2099 }
      },
      displayOrder: 1
    },
    {
      id: "srv_career_wealth",
      name: "Career, Business & Financial Growth Forecast",
      category: "Career & Wealth",
      description: "Focused analysis of 10th and 11th houses for promotions, business ventures, job changes, investment timing, and financial stability.",
      allowOnline: true,
      allowOffline: true,
      onlineFee: 799,
      offlineFee: 1099,
      durations: [15, 30, 60],
      durationPricing: {
        online: { "15": 449, "30": 799, "60": 1499 },
        offline: { "15": 649, "30": 1099, "60": 1999 }
      },
      displayOrder: 2
    },
    {
      id: "srv_marriage_matching",
      name: "Marriage Matching & Relationship Harmony (Kundali Milan)",
      category: "Marriage & Love",
      description: "In-depth Ashtakoot Guna Milan, Manglik dosha analysis, emotional alignment assessment, and remedies for marital harmony.",
      allowOnline: true,
      allowOffline: true,
      onlineFee: 999,
      offlineFee: 1299,
      durations: [15, 30, 60],
      durationPricing: {
        online: { "15": 549, "30": 999, "60": 1799 },
        offline: { "15": 749, "30": 1299, "60": 2299 }
      },
      displayOrder: 3
    },
    {
      id: "srv_vastu_audit",
      name: "Residential & Commercial Vastu Consultation",
      category: "Vastu Shastra",
      description: "Spatial energy diagnosis of your home or workplace layout with non-demolition remedial solutions for health, prosperity, and peace.",
      allowOnline: true,
      allowOffline: true,
      onlineFee: 1199,
      offlineFee: 1599,
      durations: [30, 60],
      durationPricing: {
        online: { "30": 1199, "60": 1999 },
        offline: { "30": 1599, "60": 2699 }
      },
      displayOrder: 4
    },
    {
      id: "srv_gemstone_remedies",
      name: "Gemstone Recommendation & Planetary Dosh Remedies",
      category: "Remedial Astrology",
      description: "Scientific determination of your auspicious life gemstones (Bhagyashali Ratna), Yantra energization, and authentic Vedic remedies for Sade Sati / Rahu-Ketu.",
      allowOnline: true,
      allowOffline: true,
      onlineFee: 599,
      offlineFee: 899,
      durations: [15, 30],
      durationPricing: {
        online: { "15": 399, "30": 599 },
        offline: { "15": 599, "30": 899 }
      },
      displayOrder: 5
    }
  ];

  for (const s of SERVICES) {
    await db.query(`
      INSERT INTO consultation_services (
        id, astrologer_id, name, description, category, active, allow_online, allow_offline,
        online_fee, offline_fee, allowed_durations, duration_pricing, display_order, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        allow_online = EXCLUDED.allow_online,
        allow_offline = EXCLUDED.allow_offline,
        online_fee = EXCLUDED.online_fee,
        offline_fee = EXCLUDED.offline_fee,
        allowed_durations = EXCLUDED.allowed_durations,
        duration_pricing = EXCLUDED.duration_pricing,
        display_order = EXCLUDED.display_order,
        updated_at = NOW()
    `, [
      s.id,
      activePoonamId,
      s.name,
      s.description,
      s.category,
      s.allowOnline,
      s.allowOffline,
      s.onlineFee,
      s.offlineFee,
      JSON.stringify(s.durations),
      JSON.stringify(s.durationPricing),
      s.displayOrder
    ]);
  }
  console.log(`  -> Synced ${SERVICES.length} consultation services`);

  console.log("=== MIGRATION COMPLETED SUCCESSFULLY ===");
  process.exit(0);
}

runMigration().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
