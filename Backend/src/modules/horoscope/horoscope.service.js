const DailyHoroscope = require("../../models/DailyHoroscope");
const db = require("../../database/db");
const { BadRequestError, NotFoundError } = require("../../utils/errors");

const ZODIAC_SIGNS = [
  { sign: "Aries", symbol: "♈", element: "Fire", dates: "Mar 21 - Apr 19", ruler: "Mars" },
  { sign: "Taurus", symbol: "♉", element: "Earth", dates: "Apr 20 - May 20", ruler: "Venus" },
  { sign: "Gemini", symbol: "♊", element: "Air", dates: "May 21 - Jun 20", ruler: "Mercury" },
  { sign: "Cancer", symbol: "♋", element: "Water", dates: "Jun 21 - Jul 22", ruler: "Moon" },
  { sign: "Leo", symbol: "♌", element: "Fire", dates: "Jul 23 - Aug 22", ruler: "Sun" },
  { sign: "Virgo", symbol: "♍", element: "Earth", dates: "Aug 23 - Sep 22", ruler: "Mercury" },
  { sign: "Libra", symbol: "♎", element: "Air", dates: "Sep 23 - Oct 22", ruler: "Venus" },
  { sign: "Scorpio", symbol: "♏", element: "Water", dates: "Oct 23 - Nov 21", ruler: "Mars & Pluto" },
  { sign: "Sagittarius", symbol: "♐", element: "Fire", dates: "Nov 22 - Dec 21", ruler: "Jupiter" },
  { sign: "Capricorn", symbol: "♑", element: "Earth", dates: "Dec 22 - Jan 19", ruler: "Saturn" },
  { sign: "Aquarius", symbol: "♒", element: "Air", dates: "Jan 20 - Feb 18", ruler: "Saturn & Uranus" },
  { sign: "Pisces", symbol: "♓", element: "Water", dates: "Feb 19 - Mar 20", ruler: "Jupiter & Neptune" }
];

class HoroscopeService {
  /**
   * Get the list of all 12 zodiac signs metadata
   */
  getZodiacSigns() {
    return ZODIAC_SIGNS;
  }

  /**
   * Get today's date formatted as YYYY-MM-DD in Asia/Kolkata timezone
   */
  getTodayKolkataDate() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(new Date()); // Outputs YYYY-MM-DD
  }

  /**
   * Get customer horoscopes for a specific date (default today)
   * Only returns Published horoscopes
   */
  async getPublishedHoroscopes({ date, sign, lang = "en" } = {}) {
    const targetDate = date || this.getTodayKolkataDate();
    let query = `
      SELECT * FROM daily_horoscopes
      WHERE horoscope_date = $1 AND language = $2 AND status = 'Published'
    `;
    const params = [targetDate, lang];

    if (sign) {
      query += ` AND LOWER(zodiac_sign) = LOWER($3)`;
      params.push(sign);
    }

    query += ` ORDER BY zodiac_sign ASC`;

    const res = await db.query(query, params);
    const horoscopes = res.rows.map(row => DailyHoroscope.fromRow(row));

    // If query was for a specific sign and not found for targetDate, attempt to find latest published entry for that sign
    if (sign && horoscopes.length === 0) {
      const fallbackRes = await db.query(
        `SELECT * FROM daily_horoscopes
         WHERE LOWER(zodiac_sign) = LOWER($1) AND language = $2 AND status = 'Published'
         ORDER BY horoscope_date DESC LIMIT 1`,
        [sign, lang]
      );
      if (fallbackRes.rows.length > 0) {
        return {
          date: fallbackRes.rows[0].horoscope_date,
          isLatestAvailable: true,
          horoscopes: [DailyHoroscope.fromRow(fallbackRes.rows[0])]
        };
      }
    }

    return {
      date: targetDate,
      isLatestAvailable: false,
      horoscopes
    };
  }

  /**
   * Admin: List all horoscopes with filtering and pagination
   */
  async getAdminHoroscopes({ date, sign, status, lang = "en", limit = 50, offset = 0 } = {}) {
    let whereClauses = [];
    let params = [];

    if (date) {
      params.push(date);
      whereClauses.push(`horoscope_date = $${params.length}`);
    }
    if (sign) {
      params.push(sign);
      whereClauses.push(`LOWER(zodiac_sign) = LOWER($${params.length})`);
    }
    if (status) {
      params.push(status);
      whereClauses.push(`status = $${params.length}`);
    }
    if (lang) {
      params.push(lang);
      whereClauses.push(`language = $${params.length}`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM daily_horoscopes ${whereStr}`, params);
    const total = countRes.rows[0]?.total || 0;

    const dataQuery = `
      SELECT * FROM daily_horoscopes
      ${whereStr}
      ORDER BY horoscope_date DESC, zodiac_sign ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(Number(limit), Number(offset));

    const res = await db.query(dataQuery, params);
    const horoscopes = res.rows.map(row => DailyHoroscope.fromRow(row));

    return {
      horoscopes,
      total,
      limit: Number(limit),
      offset: Number(offset)
    };
  }

  /**
   * Admin: Upsert/Save a daily horoscope entry
   */
  async upsertHoroscope(data, adminUser) {
    const {
      horoscopeDate,
      zodiacSign,
      prediction,
      love = "",
      career = "",
      finance = "",
      health = "",
      luckyNumber = "",
      luckyColor = "",
      imageUrl = "",
      language = "en",
      status = "Published"
    } = data;

    if (!horoscopeDate || !zodiacSign || !prediction) {
      throw new BadRequestError("horoscopeDate, zodiacSign, and prediction are required");
    }

    // Capitalize sign properly
    const normalizedSign = zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1).toLowerCase();

    const query = `
      INSERT INTO daily_horoscopes (
        id, horoscope_date, zodiac_sign, prediction, love, career, finance,
        health, lucky_number, lucky_color, image_url, language, status,
        publish_at, created_by, updated_by, created_at, updated_at
      ) VALUES (
        COALESCE($1, MD5(RANDOM()::text)), $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        NOW(), $14, $14, NOW(), NOW()
      )
      ON CONFLICT (horoscope_date, zodiac_sign, language) DO UPDATE SET
        prediction = EXCLUDED.prediction,
        love = EXCLUDED.love,
        career = EXCLUDED.career,
        finance = EXCLUDED.finance,
        health = EXCLUDED.health,
        lucky_number = EXCLUDED.lucky_number,
        lucky_color = EXCLUDED.lucky_color,
        image_url = EXCLUDED.image_url,
        status = EXCLUDED.status,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `;

    const res = await db.query(query, [
      data.id || null,
      horoscopeDate,
      normalizedSign,
      prediction,
      love,
      career,
      finance,
      health,
      luckyNumber,
      luckyColor,
      imageUrl,
      language,
      status,
      adminUser?._id || adminUser?.id || null
    ]);

    return DailyHoroscope.fromRow(res.rows[0]);
  }

  /**
   * Admin: Update horoscope by ID
   */
  async updateHoroscope(id, data, adminUser) {
    const existing = await DailyHoroscope.findById(id);
    if (!existing) {
      throw new NotFoundError("Horoscope not found");
    }

    const updates = {};
    if (data.prediction !== undefined) updates.prediction = data.prediction;
    if (data.love !== undefined) updates.love = data.love;
    if (data.career !== undefined) updates.career = data.career;
    if (data.finance !== undefined) updates.finance = data.finance;
    if (data.health !== undefined) updates.health = data.health;
    if (data.luckyNumber !== undefined) updates.luckyNumber = data.luckyNumber;
    if (data.luckyColor !== undefined) updates.luckyColor = data.luckyColor;
    if (data.imageUrl !== undefined) updates.imageUrl = data.imageUrl;
    if (data.status !== undefined) updates.status = data.status;
    if (data.horoscopeDate !== undefined) updates.horoscopeDate = data.horoscopeDate;
    if (data.zodiacSign !== undefined) updates.zodiacSign = data.zodiacSign;
    updates.updatedBy = adminUser?._id || adminUser?.id || null;

    return await DailyHoroscope.findByIdAndUpdate(id, updates, { new: true });
  }

  /**
   * Admin: Update status (Published / Draft)
   */
  async updateStatus(id, status) {
    if (!["Published", "Draft"].includes(status)) {
      throw new BadRequestError("Status must be Published or Draft");
    }
    const updated = await DailyHoroscope.findByIdAndUpdate(id, { status }, { new: true });
    if (!updated) {
      throw new NotFoundError("Horoscope not found");
    }
    return updated;
  }

  /**
   * Admin: Delete horoscope
   */
  async deleteHoroscope(id) {
    const res = await db.query("DELETE FROM daily_horoscopes WHERE id = $1 RETURNING id", [id]);
    if (res.rowCount === 0) {
      throw new NotFoundError("Horoscope not found");
    }
    return { success: true };
  }
}

module.exports = new HoroscopeService();
