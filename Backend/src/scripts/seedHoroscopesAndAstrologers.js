const db = require("../database/db");
const crypto = require("crypto");

const ASTROLOGERS_SEED = [
  {
    name: "Pt. Radheshyam Shastri",
    email: "radheshyam.shastri@astronirvan.com",
    phone: "+91 98765 43210",
    photoUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80",
    experienceYears: 22,
    rating: 4.95,
    reviewCount: 428,
    specialties: ["Vedic Astrology", "Kundali Milan", "Dosh Nivaran", "Muhurat Guidance"],
    languages: ["Hindi", "Sanskrit", "English"],
    bio: "Renowned Vedic Astrologer with over 22 years of profound experience in Kundali matching, career horoscope analysis, and traditional Vedic remedies. Disciple of traditional Varanasi Jyotish parampara.",
    allowedDurations: [15, 30, 60],
    durationPricing: { "15": 499, "30": 899, "60": 1599 },
    active: true,
    displayOrder: 1
  },
  {
    name: "Dr. Ananya Mukherjee",
    email: "dr.ananya@astronirvan.com",
    phone: "+91 98765 43211",
    photoUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80",
    experienceYears: 14,
    rating: 4.92,
    reviewCount: 312,
    specialties: ["KP Astrology", "Numerology", "Career & Corporate Astrology", "Tarot Reading"],
    languages: ["English", "Hindi", "Bengali"],
    bio: "PhD in Astrological Sciences, specializing in Krishnamurti Paddhati (KP System) and scientific numerology. Guiding young professionals, entrepreneurs, and families globally.",
    allowedDurations: [15, 30, 60],
    durationPricing: { "15": 399, "30": 749, "60": 1399 },
    active: true,
    displayOrder: 2
  },
  {
    name: "Acharya Devendra Joshi",
    email: "devendra.joshi@astronirvan.com",
    phone: "+91 98765 43212",
    photoUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
    experienceYears: 18,
    rating: 4.98,
    reviewCount: 560,
    specialties: ["Vastu Shastra", "Gemstone Therapy", "Spiritual Counseling", "Family Harmony"],
    languages: ["Hindi", "Gujarati", "English"],
    bio: "Certified Gemologist and Senior Vastu Consultant. Expert in harmonizing living spaces and recommending authentic, energized gemstones aligned with personal planetary charts.",
    allowedDurations: [15, 30, 60],
    durationPricing: { "15": 549, "30": 999, "60": 1799 },
    active: true,
    displayOrder: 3
  }
];

const HOROSCOPES_SEED = [
  {
    sign: "Aries",
    prediction: "Today brings an auspicious surge of vitality. Mars bestows courage to resolve pending decisions with clear focus.",
    love: "Harmony blossoms in relationships. An honest conversation brings emotional closeness.",
    career: "New workplace opportunities surface. Your leadership skills will be recognized.",
    finance: "Prudent financial planning will yield favorable long-term returns. Avoid impulsive purchases.",
    health: "Energy levels remain high. Keep yourself well-hydrated throughout the day.",
    luckyNumber: "9",
    luckyColor: "Crimson Red"
  },
  {
    sign: "Taurus",
    prediction: "Venus bestows creative inspiration and steady grounding today. Focus on consistency and patience.",
    love: "Spend quality time with your partner. A peaceful evening brings renewed joy.",
    career: "Steady progress on key projects. Colleagues will appreciate your reliability.",
    finance: "Stable financial outlook. Good day to review savings and investment options.",
    health: "Pay attention to your neck and throat. Gentle stretching will be soothing.",
    luckyNumber: "6",
    luckyColor: "Emerald Green"
  },
  {
    sign: "Gemini",
    prediction: "Mercury sharpens your intellect and communication skills. Ideal day for negotiations, learning, and networking.",
    love: "Engaging conversations create a magnetic bond. Express your heartfelt feelings openly.",
    career: "Meetings and presentations proceed smoothly. Innovative solutions earn praise.",
    finance: "A modest financial gain or unexpected reward could brighten your day.",
    health: "Take short breaks to rest your eyes and practice mindful breathing.",
    luckyNumber: "5",
    luckyColor: "Golden Yellow"
  },
  {
    sign: "Cancer",
    prediction: "The Moon enhances your intuitive empathy today. Trust your inner compass when making domestic and life choices.",
    love: "Warmth and familial affection bring deep comfort. A thoughtful gesture strengthens trust.",
    career: "Collaborative teamwork yields best outcomes. Support a teammate who seeks guidance.",
    finance: "Avoid speculative investments. Stick to balanced and secure financial decisions.",
    health: "Prioritize home-cooked nourishing meals and restful nighttime sleep.",
    luckyNumber: "2",
    luckyColor: "Pearl White"
  },
  {
    sign: "Leo",
    prediction: "The Sun radiates confidence, charisma, and creative fire today. Step into the spotlight with grace and humility.",
    love: "Passion and generosity characterize your romantic life today. Plan a joyful date.",
    career: "Senior leaders recognize your efforts. Great day to present visionary concepts.",
    finance: "Financial prospects look promising. Favorable returns on previous endeavors.",
    health: "Heart and spine wellness is favorable. Engage in active physical exercise.",
    luckyNumber: "1",
    luckyColor: "Royal Gold"
  },
  {
    sign: "Virgo",
    prediction: "Meticulous attention to detail and sharp analytical prowess serve you well today. Order and balance reign.",
    love: "Practical gestures of care communicate your genuine dedication and love.",
    career: "Exceptional efficiency in handling complex data and organizational workflows.",
    finance: "Disciplined budgeting keeps your reserves strong. Keep track of daily expenses.",
    health: "Digestive wellness is paramount today. Opt for light, fiber-rich nutrition.",
    luckyNumber: "5",
    luckyColor: "Forest Green"
  },
  {
    sign: "Libra",
    prediction: "Venus highlights beauty, equilibrium, and social harmony. Conflict dissolves as peace and fairness prevail.",
    love: "Romance sparkles under favorable planetary alignments. Celebrate togetherness.",
    career: "Diplomatic approach resolves a team disagreement smoothly and respectfully.",
    finance: "Financial equilibrium is maintained. Weigh luxury purchases thoughtfully.",
    health: "Maintain kidney hydration with ample water and herbal teas.",
    luckyNumber: "7",
    luckyColor: "Pastel Pink"
  },
  {
    sign: "Scorpio",
    prediction: "Profound focus and transformative energy empower you to overcome lingering obstacles with fortitude.",
    love: "Deep intimacy and emotional bonding bring mutual understanding and reassurance.",
    career: "Research and investigative tasks yield breakthroughs. Keep strategies confidential.",
    finance: "Favorable time to clear pending dues or settle joint financial matters.",
    health: "Channel intense mental energy into meditation or restorative yoga.",
    luckyNumber: "8",
    luckyColor: "Deep Maroon"
  },
  {
    sign: "Sagittarius",
    prediction: "Jupiter expands your optimism, philosophical wisdom, and enthusiasm for life. Horizons widen gracefully.",
    love: "Shared dreams and adventurous conversations reignite romantic joy.",
    career: "International or educational endeavors receive planetary blessings today.",
    finance: "Long-term investment outlook is optimistic. Consult an elder before large commitments.",
    health: "High physical stamina. Outdoor walks or nature strolls boost vitality.",
    luckyNumber: "3",
    luckyColor: "Saffron Orange"
  },
  {
    sign: "Capricorn",
    prediction: "Saturn rewards perseverance, maturity, and steadfast discipline. Your focused dedication builds lasting foundations.",
    love: "Reliability and mutual respect are the cornerstone of your connection today.",
    career: "Milestones are achieved through methodical execution. Bosses acknowledge your dedication.",
    finance: "Solid financial discipline. Long-term assets and property matters favor you.",
    health: "Take care of joints and knees. Warm water soaks or gentle mobility work.",
    luckyNumber: "4",
    luckyColor: "Navy Blue"
  },
  {
    sign: "Aquarius",
    prediction: "Originality and progressive thinking lead to brilliant breakthroughs today. Connect with visionary friends.",
    love: "Intellectual connection sparks romantic chemistry. Celebrate mutual individuality.",
    career: "Technology and forward-thinking initiatives bring rewarding accomplishments.",
    finance: "Consider diversifying income streams. Practical innovations bring prosperity.",
    health: "Stay physically active to maintain smooth circulation throughout the limbs.",
    luckyNumber: "11",
    luckyColor: "Electric Blue"
  },
  {
    sign: "Pisces",
    prediction: "Compassion, artistic sensitivity, and spiritual peace surround your aura. Trust your creative instincts.",
    love: "Soulful harmony and tender affection deepen bonds with those dear to your heart.",
    career: "Creative pursuits and compassionate leadership receive stellar appreciation.",
    finance: "Generosity is rewarded in unexpected ways. Maintain clear financial boundaries.",
    health: "Restorative sleep and evening meditation will rejuvenate your spirit.",
    luckyNumber: "12",
    luckyColor: "Ocean Turquoise"
  }
];

async function seedData() {
  try {
    console.log("Seeding Astrologers and Daily Horoscopes into PostgreSQL...");

    // 1. Seed Astrologers
    for (const a of ASTROLOGERS_SEED) {
      const existing = await db.query("SELECT id FROM astrologers WHERE email = $1", [a.email]);
      let astroId;
      if (existing.rows.length === 0) {
        astroId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
        await db.query(
          `INSERT INTO astrologers (
            id, name, email, phone, photo_url, experience_years, rating, review_count,
            specialties, languages, bio, allowed_durations, duration_pricing, active, display_order,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9::jsonb, $10::jsonb, $11, $12::jsonb, $13::jsonb, $14, $15,
            NOW(), NOW()
          )`,
          [
            astroId, a.name, a.email, a.phone, a.photoUrl, a.experienceYears, a.rating, a.reviewCount,
            JSON.stringify(a.specialties), JSON.stringify(a.languages), a.bio,
            JSON.stringify(a.allowedDurations), JSON.stringify(a.durationPricing), a.active, a.displayOrder
          ]
        );
        console.log(`Created Astrologer: ${a.name} (${astroId})`);
      } else {
        astroId = existing.rows[0].id;
        console.log(`Astrologer exists: ${a.name} (${astroId})`);
      }

      // Ensure 7-day schedule
      for (let day = 0; day <= 6; day++) {
        const availId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
        await db.query(
          `INSERT INTO astrologer_availability (
            id, astrologer_id, day_of_week, start_time, end_time, break_start, break_end, is_active
          ) VALUES ($1, $2, $3, '09:00', '19:00', '13:00', '14:00', $4)
          ON CONFLICT (astrologer_id, day_of_week) DO NOTHING`,
          [availId, astroId, day, day !== 0]
        );
      }
    }

    // 2. Seed Daily Horoscopes for Today (Asia/Kolkata)
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const todayStr = formatter.format(new Date());

    console.log(`Seeding Horoscopes for Date: ${todayStr}...`);
    for (const h of HOROSCOPES_SEED) {
      const hid = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
      await db.query(
        `INSERT INTO daily_horoscopes (
          id, horoscope_date, zodiac_sign, prediction, love, career, finance,
          health, lucky_number, lucky_color, language, status, publish_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, 'en', 'Published', NOW(), NOW(), NOW()
        )
        ON CONFLICT (horoscope_date, zodiac_sign, language) DO UPDATE SET
          prediction = EXCLUDED.prediction,
          love = EXCLUDED.love,
          career = EXCLUDED.career,
          finance = EXCLUDED.finance,
          health = EXCLUDED.health,
          lucky_number = EXCLUDED.lucky_number,
          lucky_color = EXCLUDED.lucky_color,
          status = 'Published',
          updated_at = NOW()`,
        [
          hid, todayStr, h.sign, h.prediction, h.love, h.career, h.finance,
          h.health, h.luckyNumber, h.luckyColor
        ]
      );
    }
    console.log(`All 12 signs seeded for ${todayStr} successfully!`);

    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

seedData();
