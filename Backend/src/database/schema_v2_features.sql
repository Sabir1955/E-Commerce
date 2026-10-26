-- ASTRO NIRVAN Feature Extension Schema:
-- 1. In-App Notifications
-- 2. Daily Horoscopes CMS
-- 3. Astrologers & Availability Management
-- 4. Consultation Bookings & Google Meet Integration
-- 5. Orders Rejection & Audit Extensions

-- 1. In-App Notifications
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    link TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_user ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_read ON in_app_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_in_app_notif_created ON in_app_notifications(created_at);

-- 2. Daily Horoscopes CMS
CREATE TABLE IF NOT EXISTS daily_horoscopes (
    id VARCHAR(64) PRIMARY KEY,
    horoscope_date DATE NOT NULL,
    zodiac_sign VARCHAR(50) NOT NULL,
    prediction TEXT NOT NULL,
    love TEXT,
    career TEXT,
    finance TEXT,
    health TEXT,
    lucky_number VARCHAR(50),
    lucky_color VARCHAR(50),
    image_url TEXT,
    language VARCHAR(20) DEFAULT 'en',
    status VARCHAR(20) DEFAULT 'Published',
    publish_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    updated_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_horoscope_date_sign_lang UNIQUE (horoscope_date, zodiac_sign, language)
);
CREATE INDEX IF NOT EXISTS idx_horoscope_date_sign ON daily_horoscopes(horoscope_date, zodiac_sign);
CREATE INDEX IF NOT EXISTS idx_horoscope_status ON daily_horoscopes(status);
CREATE INDEX IF NOT EXISTS idx_horoscope_publish_at ON daily_horoscopes(publish_at);

-- 3. Astrologers
CREATE TABLE IF NOT EXISTS astrologers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    photo_url TEXT,
    experience_years INT DEFAULT 5,
    rating NUMERIC(3,2) DEFAULT 4.9,
    review_count INT DEFAULT 0,
    specialties JSONB DEFAULT '["Vedic Astrology", "Kundali Milan", "Career & Finance Guidance"]'::jsonb,
    languages JSONB DEFAULT '["Hindi", "English"]'::jsonb,
    bio TEXT,
    allowed_durations JSONB DEFAULT '[15, 30, 60]'::jsonb,
    duration_pricing JSONB DEFAULT '{"15": 499, "30": 899, "60": 1599}'::jsonb,
    active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_astrologers_active ON astrologers(active);

-- 4. Astrologer Availability (Weekly)
CREATE TABLE IF NOT EXISTS astrologer_availability (
    id VARCHAR(64) PRIMARY KEY,
    astrologer_id VARCHAR(64) NOT NULL REFERENCES astrologers(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL, -- 0 = Sunday, 1 = Monday, ... 6 = Saturday
    start_time VARCHAR(10) NOT NULL DEFAULT '09:00',
    end_time VARCHAR(10) NOT NULL DEFAULT '19:00',
    break_start VARCHAR(10) DEFAULT '13:00',
    break_end VARCHAR(10) DEFAULT '14:00',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_astrologer_day UNIQUE (astrologer_id, day_of_week)
);
CREATE INDEX IF NOT EXISTS idx_astrologer_avail_astro ON astrologer_availability(astrologer_id);

-- 5. Astrologer Holidays (Unavailable dates)
CREATE TABLE IF NOT EXISTS astrologer_holidays (
    id VARCHAR(64) PRIMARY KEY,
    astrologer_id VARCHAR(64) NOT NULL REFERENCES astrologers(id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_astrologer_holiday UNIQUE (astrologer_id, holiday_date)
);
CREATE INDEX IF NOT EXISTS idx_astrologer_holidays ON astrologer_holidays(astrologer_id, holiday_date);

-- 6. Consultation Bookings
CREATE TABLE IF NOT EXISTS consultation_bookings (
    id VARCHAR(64) PRIMARY KEY,
    booking_number VARCHAR(100) NOT NULL UNIQUE,
    customer_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    astrologer_id VARCHAR(64) NOT NULL REFERENCES astrologers(id) ON DELETE RESTRICT,
    scheduled_date DATE NOT NULL,
    start_time VARCHAR(10) NOT NULL,
    end_time VARCHAR(10) NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 30,
    start_timestamp TIMESTAMPTZ NOT NULL,
    end_timestamp TIMESTAMPTZ NOT NULL,
    fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_id VARCHAR(64) REFERENCES payments(id) ON DELETE SET NULL,
    booking_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'completed', 'cancelled', 'rescheduled'
    customer_notes TEXT,
    astrologer_notes TEXT,
    rejection_reason TEXT,
    cancellation_reason TEXT,
    google_calendar_event_id VARCHAR(255),
    google_meet_link TEXT,
    google_meet_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'created', 'failed', 'none'
    google_meet_error TEXT,
    confirmed_at TIMESTAMPTZ,
    confirmed_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consultation_customer ON consultation_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_consultation_astrologer ON consultation_bookings(astrologer_id);
CREATE INDEX IF NOT EXISTS idx_consultation_date ON consultation_bookings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_consultation_status ON consultation_bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_consultation_start_ts ON consultation_bookings(start_timestamp);

-- 7. Orders Alterations (rejection_reason, cancelled_by, admin audit fields)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by JSONB;

-- 8. Complete Return & Refund System
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

