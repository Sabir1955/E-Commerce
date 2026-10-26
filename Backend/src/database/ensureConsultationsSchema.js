const db = require("./db");

/**
 * Ensures all consultation tables, columns, indexes, and default seed data exist.
 * This runs on server startup and can be safely re-run idempotently.
 */
async function ensureConsultationsSchema() {
  try {
    // 1. Column alterations for astrologers
    await db.query(`
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS fee_per_session NUMERIC(10,2) DEFAULT 899.00;
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS consultation_title VARCHAR(255) DEFAULT 'Senior Vedic Astrologer & Kundali Specialist';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255) DEFAULT 'Astro Nirvan';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS venue_title VARCHAR(255) DEFAULT 'Astro Nirvan Consultation Centre';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS office_name VARCHAR(255) DEFAULT 'Astro Poonam Vaish Mam — Astro Nirvan';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS office_address TEXT DEFAULT 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS office_city VARCHAR(100) DEFAULT 'Patna';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS office_state VARCHAR(100) DEFAULT 'Bihar';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS office_pincode VARCHAR(20) DEFAULT '800001';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS office_maps_url TEXT DEFAULT 'https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS visiting_hours VARCHAR(255) DEFAULT '10:00 AM – 06:30 PM (IST) · Monday to Saturday';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS working_days VARCHAR(255) DEFAULT 'Monday to Saturday';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS office_instructions TEXT DEFAULT 'Please arrive 10 minutes prior to your scheduled consultation. Kindly bring your Janam Kundali or birth details (Date, Time, Place of Birth).';
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS allow_online BOOLEAN DEFAULT TRUE;
      ALTER TABLE astrologers ADD COLUMN IF NOT EXISTS allow_offline BOOLEAN DEFAULT TRUE;
    `);

    // 2. Column alterations for consultation_bookings
    await db.query(`
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS service_id VARCHAR(64);
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS service_name VARCHAR(255) DEFAULT 'General Vedic Consultation';
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS consultation_mode VARCHAR(32) DEFAULT 'online';
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS office_address TEXT;
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS office_maps_url TEXT;
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS slot_hold_expires_at TIMESTAMPTZ;
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS payment_gateway_order_id VARCHAR(128);
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS payment_transaction_id VARCHAR(128);
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS payment_signature TEXT;
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'easebuzz';
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2);
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32);
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2);
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS refund_reason TEXT;
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS refund_transaction_id VARCHAR(128);
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
      ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS accepted_by VARCHAR(64);
    `);

    // 3. Payments, Orders, Products and Returns alterations
    await db.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS booking_id VARCHAR(64);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by JSONB;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id VARCHAR(64);

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
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS refund_reference VARCHAR(100);

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

      CREATE TABLE IF NOT EXISTS return_refund_transactions (
        id VARCHAR(64) PRIMARY KEY,
        return_id VARCHAR(64) NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        payment_id VARCHAR(64) REFERENCES payments(id) ON DELETE SET NULL,
        amount NUMERIC(12, 2) NOT NULL,
        gateway VARCHAR(50) NOT NULL,
        gateway_refund_id VARCHAR(100),
        gateway_response JSONB DEFAULT '{}'::jsonb,
        status VARCHAR(50) NOT NULL DEFAULT 'processing',
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

      CREATE TABLE IF NOT EXISTS return_messages (
        id VARCHAR(64) PRIMARY KEY,
        return_id VARCHAR(64) NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
        sender_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
        sender_role VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_return_messages_return_id ON return_messages(return_id);
    `);

    // 4. Create consultation_services table if missing
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
      CREATE INDEX IF NOT EXISTS idx_consultation_services_astrologer ON consultation_services(astrologer_id);
      CREATE INDEX IF NOT EXISTS idx_consultation_services_active ON consultation_services(active);
    `);

    // 5. Seed default astrologer if astrologers table is empty or missing Astro Poonam Vaish Mam
    const countRes = await db.query("SELECT COUNT(*) FROM astrologers");
    const count = parseInt(countRes.rows[0].count, 10);

    const poonamId = "astro_poonam_vaish_mam";
    const poonamCheck = await db.query(
      "SELECT id FROM astrologers WHERE id = $1 OR name ILIKE '%Poonam Vaish%' LIMIT 1",
      [poonamId]
    );

    let activeAstroId = poonamId;

    if (count === 0 || poonamCheck.rows.length === 0) {
      await db.query(
        `INSERT INTO astrologers (
          id, name, email, phone, photo_url, experience_years, rating, review_count,
          specialties, languages, bio, allowed_durations, duration_pricing,
          fee_per_session, consultation_title, organization_name, venue_title,
          office_name, office_address, office_city, office_state, office_pincode,
          office_maps_url, visiting_hours, working_days, office_instructions,
          allow_online, allow_offline, active, display_order, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, $24, $25, $26,
          $27, $28, TRUE, 1, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          consultation_title = EXCLUDED.consultation_title,
          organization_name = EXCLUDED.organization_name,
          venue_title = EXCLUDED.venue_title,
          office_name = EXCLUDED.office_name,
          office_address = EXCLUDED.office_address,
          office_city = EXCLUDED.office_city,
          office_state = EXCLUDED.office_state,
          office_pincode = EXCLUDED.office_pincode,
          office_maps_url = EXCLUDED.office_maps_url,
          visiting_hours = EXCLUDED.visiting_hours,
          working_days = EXCLUDED.working_days,
          office_instructions = EXCLUDED.office_instructions,
          allow_online = EXCLUDED.allow_online,
          allow_offline = EXCLUDED.allow_offline,
          active = TRUE,
          updated_at = NOW()`,
        [
          poonamId,
          "Astro Poonam Vaish Mam",
          "poonam.vaish@astronirvan.com",
          "+91 98765 43210",
          "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80",
          22,
          4.98,
          560,
          JSON.stringify([
            "Vedic Astrology",
            "Kundali Milan",
            "Vastu Shastra",
            "Gemstone Therapy",
            "Career & Wealth Guidance",
            "Marriage & Relationship Remedies"
          ]),
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
          899.00,
          "Senior Vedic Astrologer & Kundali Specialist",
          "Astro Nirvan",
          "Astro Nirvan Consultation Centre",
          "Astro Poonam Vaish Mam — Astro Nirvan",
          "Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri",
          "Patna",
          "Bihar",
          "800001",
          "https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001",
          "10:00 AM – 06:30 PM (IST) · Monday to Saturday",
          "Monday to Saturday",
          "Please arrive 10 minutes prior to your scheduled consultation. Kindly bring your Janam Kundali or birth details (Date, Time, Place of Birth).",
          true,
          true
        ]
      );
      console.log("[Consultations] Seeded default astrologer (Astro Poonam Vaish Mam).");
    } else {
      activeAstroId = poonamCheck.rows[0].id;
      // Ensure all settings fields are populated if they were null
      await db.query(
        `UPDATE astrologers SET
          consultation_title = COALESCE(consultation_title, 'Senior Vedic Astrologer & Kundali Specialist'),
          organization_name = COALESCE(organization_name, 'Astro Nirvan'),
          venue_title = COALESCE(venue_title, 'Astro Nirvan Consultation Centre'),
          office_name = COALESCE(office_name, 'Astro Poonam Vaish Mam — Astro Nirvan'),
          office_address = COALESCE(office_address, 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri'),
          office_city = COALESCE(office_city, 'Patna'),
          office_state = COALESCE(office_state, 'Bihar'),
          office_pincode = COALESCE(office_pincode, '800001'),
          office_maps_url = COALESCE(office_maps_url, 'https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001'),
          visiting_hours = COALESCE(visiting_hours, '10:00 AM – 06:30 PM (IST) · Monday to Saturday'),
          working_days = COALESCE(working_days, 'Monday to Saturday'),
          office_instructions = COALESCE(office_instructions, 'Please arrive 10 minutes prior to your scheduled consultation. Kindly bring your Janam Kundali or birth details (Date, Time, Place of Birth).'),
          allow_online = COALESCE(allow_online, TRUE),
          allow_offline = COALESCE(allow_offline, TRUE),
          fee_per_session = COALESCE(fee_per_session, 899.00),
          active = TRUE
        WHERE id = $1`,
        [activeAstroId]
      );
    }

    // 6. Ensure weekly schedule for active astrologer
    for (let day = 0; day <= 6; day++) {
      const availId = `avail_${activeAstroId}_${day}`;
      await db.query(
        `INSERT INTO astrologer_availability (
          id, astrologer_id, day_of_week, start_time, end_time, break_start, break_end, is_active
        ) VALUES ($1, $2, $3, '09:00', '19:00', '13:00', '14:00', $4)
        ON CONFLICT (astrologer_id, day_of_week) DO UPDATE SET
          start_time = COALESCE(astrologer_availability.start_time, '09:00'),
          end_time = COALESCE(astrologer_availability.end_time, '19:00'),
          break_start = COALESCE(astrologer_availability.break_start, '13:00'),
          break_end = COALESCE(astrologer_availability.break_end, '14:00'),
          is_active = EXCLUDED.is_active`,
        [availId, activeAstroId, day, day !== 0]
      );
    }

    // 7. Seed consultation services if none exist for active astrologer
    const srvCountRes = await db.query(
      "SELECT COUNT(*) FROM consultation_services WHERE astrologer_id = $1",
      [activeAstroId]
    );
    const srvCount = parseInt(srvCountRes.rows[0].count, 10);

    if (srvCount === 0) {
      const DEFAULT_SERVICES = [
        {
          id: `srv_kundali_${activeAstroId}`,
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
          id: `srv_career_${activeAstroId}`,
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
          id: `srv_marriage_${activeAstroId}`,
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
          id: `srv_vastu_${activeAstroId}`,
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
          id: `srv_gemstone_${activeAstroId}`,
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

      for (const s of DEFAULT_SERVICES) {
        await db.query(
          `INSERT INTO consultation_services (
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
            updated_at = NOW()`,
          [
            s.id,
            activeAstroId,
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
          ]
        );
      }
      console.log(`[Consultations] Seeded ${DEFAULT_SERVICES.length} consultation services.`);
    }

    console.log("[Consultations] Schema and default settings verified successfully.");
    return true;
  } catch (err) {
    console.error("[Consultations Schema Error]:", err.message);
    throw err;
  }
}

module.exports = { ensureConsultationsSchema };
