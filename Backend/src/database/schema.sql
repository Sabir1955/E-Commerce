-- ASTRO NIRVAN PostgreSQL Relational Schema
-- Normalized relational schema replacing MongoDB collections

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    mobile VARCHAR(30) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'customer',
    active BOOLEAN DEFAULT TRUE,
    notification_preferences JSONB DEFAULT '{"orderEmail":true,"orderSms":true,"orderWhatsapp":true,"marketingEmail":false,"marketingSms":false,"marketingWhatsapp":false}'::jsonb,
    referral_code VARCHAR(100),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(255),
    sanskrit VARCHAR(255),
    active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- 3. Products Table
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    description TEXT NOT NULL,
    sku VARCHAR(100),
    brand VARCHAR(100),
    weight NUMERIC(10,2),
    dimensions JSONB DEFAULT '{"length":0,"width":0,"height":0,"unit":"cm"}'::jsonb,
    material VARCHAR(100),
    price NUMERIC(12,2) NOT NULL,
    category VARCHAR(255) NOT NULL,
    category_id VARCHAR(64),
    image_url TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    image_file_id VARCHAR(64),
    image_file_ids JSONB DEFAULT '[]'::jsonb,
    stock INT NOT NULL DEFAULT 0,
    rating NUMERIC(3,2) DEFAULT 0,
    review_count INT DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,
    popularity INT DEFAULT 0,
    is_returnable BOOLEAN DEFAULT TRUE,
    return_window_days INT DEFAULT 7,
    is_replaceable BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT TRUE,
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Idempotent column addition for existing databases
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_is_available ON products(is_available);

-- 3b. Product Images Table (Binary storage in PostgreSQL BYTEA)
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

-- 4. Addresses Table
CREATE TABLE IF NOT EXISTS addresses (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    mobile VARCHAR(30),
    use_registered_mobile BOOLEAN DEFAULT TRUE,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) DEFAULT 'India',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- 5. Carts Table
CREATE TABLE IF NOT EXISTS carts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id);

-- 6. Coupons Table
CREATE TABLE IF NOT EXISTS coupons (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type VARCHAR(20) NOT NULL,
    discount_value NUMERIC(10,2) NOT NULL,
    maximum_discount NUMERIC(10,2),
    minimum_order_value NUMERIC(10,2) DEFAULT 0,
    usage_limit INT DEFAULT 0,
    uses INT DEFAULT 0,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- 7. Shipping Settings Table
CREATE TABLE IF NOT EXISTS shipping_settings (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(50) DEFAULT 'default' UNIQUE,
    charge NUMERIC(10,2) DEFAULT 0,
    free_shipping_minimum NUMERIC(10,2) DEFAULT 0,
    estimated_days_min INT DEFAULT 3,
    estimated_days_max INT DEFAULT 7,
    default_return_days INT DEFAULT 7,
    return_policy_active BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Pickup Locations Table
CREATE TABLE IF NOT EXISTS pickup_locations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    contact_name VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) DEFAULT 'India',
    active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Store Settings Table
CREATE TABLE IF NOT EXISTS store_settings (
    id VARCHAR(64) PRIMARY KEY,
    key VARCHAR(100) DEFAULT 'store_address' UNIQUE,
    store_name VARCHAR(255) DEFAULT 'Jyotish Astro Store',
    contact_name VARCHAR(255) DEFAULT 'Master Astrologer',
    phone VARCHAR(30) DEFAULT '+919876543210',
    address_line TEXT DEFAULT '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi',
    city VARCHAR(100) DEFAULT 'Varanasi',
    state VARCHAR(100) DEFAULT 'Uttar Pradesh',
    pin_code VARCHAR(20) DEFAULT '221001',
    country VARCHAR(100) DEFAULT 'India',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(64) PRIMARY KEY,
    order_number VARCHAR(100) NOT NULL UNIQUE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    shipping_address JSONB NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'placed',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Online',
    stock_reserved BOOLEAN DEFAULT FALSE,
    stock_deducted BOOLEAN DEFAULT FALSE,
    stock_reservation_expires_at TIMESTAMPTZ,
    stock_released_at TIMESTAMPTZ,
    tracking_events JSONB DEFAULT '[]'::jsonb,
    coupon_code VARCHAR(50),
    referral_code VARCHAR(100),
    invoice_number VARCHAR(100),
    courier_name VARCHAR(100),
    tracking_id VARCHAR(100),
    confirmed_at TIMESTAMPTZ,
    confirmed_by JSONB,
    shipment JSONB DEFAULT '{}'::jsonb,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- 11. Order Items Table (normalized)
CREATE TABLE IF NOT EXISTS order_items (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id VARCHAR(64) REFERENCES products(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    image TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- 12. Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) REFERENCES orders(id) ON DELETE SET NULL,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    client_reference VARCHAR(100),
    method VARCHAR(50) DEFAULT 'online',
    provider VARCHAR(50) DEFAULT 'razorpay',
    gateway_order_id VARCHAR(100),
    gateway_method VARCHAR(50),
    easepayid VARCHAR(100),
    items JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(50) DEFAULT 'pending',
    transaction_id VARCHAR(100),
    amount NUMERIC(12,2) NOT NULL,
    failure_reason TEXT,
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- 13. Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id VARCHAR(64) REFERENCES orders(id) ON DELETE SET NULL,
    verified_purchase BOOLEAN DEFAULT TRUE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    status VARCHAR(50) DEFAULT 'approved',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

-- 14. Returns Table
CREATE TABLE IF NOT EXISTS returns (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    items JSONB DEFAULT '[]'::jsonb,
    type VARCHAR(50) DEFAULT 'return',
    status VARCHAR(50) DEFAULT 'requested',
    refund_amount NUMERIC(12,2),
    admin_note TEXT,
    tracking_number VARCHAR(100),
    tracking_url TEXT,
    pickup_location_id VARCHAR(64) REFERENCES pickup_locations(id) ON DELETE SET NULL,
    pickup_location_name VARCHAR(100),
    pickup_address TEXT,
    tracking_events JSONB DEFAULT '[]'::jsonb,
    evidence_images JSONB DEFAULT '[]'::jsonb,
    comments TEXT,
    admin_message TEXT,
    rejection_reason TEXT,
    refund_gateway VARCHAR(50),
    refund_status VARCHAR(50) DEFAULT 'pending',
    refund_error TEXT,
    refunded_at TIMESTAMPTZ,
    is_restocked BOOLEAN DEFAULT FALSE,
    restocked_at TIMESTAMPTZ,
    status_history JSONB DEFAULT '[]'::jsonb,
    refund_reference VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);

-- Alter returns table for existing databases
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

-- Return Evidence Images Table
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

-- Return Status History Table
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

-- Return Refund Transactions Table
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

-- Return Messages Table
CREATE TABLE IF NOT EXISTS return_messages (
    id VARCHAR(64) PRIMARY KEY,
    return_id VARCHAR(64) NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    sender_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    sender_role VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_return_messages_return_id ON return_messages(return_id);

-- 15. Notification Logs Table
CREATE TABLE IF NOT EXISTS notification_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    order_id VARCHAR(64) REFERENCES orders(id) ON DELETE SET NULL,
    return_request_id VARCHAR(64) REFERENCES returns(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'sent',
    detail TEXT,
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user ON notification_logs(user_id);

-- 16. OTP Codes Table
CREATE TABLE IF NOT EXISTS otp_codes (
    id VARCHAR(64) PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    payload JSONB,
    attempts INT DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_codes(identifier);

-- 17. Referrals Table
CREATE TABLE IF NOT EXISTS referrals (
    id VARCHAR(64) PRIMARY KEY,
    referrer_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_code VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'registered',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Support Tickets Table
CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id VARCHAR(64) REFERENCES orders(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    admin_reply TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. In-App Notifications Table
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

-- 20. Daily Horoscopes Table
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

-- 21. Astrologers Table
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
    fee_per_session NUMERIC(10,2) DEFAULT 899.00,
    consultation_title VARCHAR(255) DEFAULT 'Senior Vedic Astrologer & Kundali Specialist',
    organization_name VARCHAR(255) DEFAULT 'Astro Nirvan',
    venue_title VARCHAR(255) DEFAULT 'Astro Nirvan Consultation Centre',
    office_name VARCHAR(255) DEFAULT 'Astro Poonam Vaish Mam — Astro Nirvan',
    office_address TEXT DEFAULT 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri',
    office_city VARCHAR(100) DEFAULT 'Patna',
    office_state VARCHAR(100) DEFAULT 'Bihar',
    office_pincode VARCHAR(20) DEFAULT '800001',
    office_maps_url TEXT DEFAULT 'https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001',
    visiting_hours VARCHAR(255) DEFAULT '10:00 AM – 06:30 PM (IST) · Monday to Saturday',
    working_days VARCHAR(255) DEFAULT 'Monday to Saturday',
    office_instructions TEXT DEFAULT 'Please arrive 10 minutes prior to your scheduled consultation. Kindly bring your Janam Kundali or birth details (Date, Time, Place of Birth).',
    allow_online BOOLEAN DEFAULT TRUE,
    allow_offline BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_astrologers_active ON astrologers(active);

-- Ensure columns exist if table was already created
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

-- 22. Astrologer Availability Table
CREATE TABLE IF NOT EXISTS astrologer_availability (
    id VARCHAR(64) PRIMARY KEY,
    astrologer_id VARCHAR(64) NOT NULL REFERENCES astrologers(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL,
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

-- 23. Astrologer Holidays Table
CREATE TABLE IF NOT EXISTS astrologer_holidays (
    id VARCHAR(64) PRIMARY KEY,
    astrologer_id VARCHAR(64) NOT NULL REFERENCES astrologers(id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_astrologer_holiday UNIQUE (astrologer_id, holiday_date)
);
CREATE INDEX IF NOT EXISTS idx_astrologer_holidays ON astrologer_holidays(astrologer_id, holiday_date);

-- 24. Consultation Services Table
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

-- 25. Consultation Bookings Table
CREATE TABLE IF NOT EXISTS consultation_bookings (
    id VARCHAR(64) PRIMARY KEY,
    booking_number VARCHAR(100) NOT NULL UNIQUE,
    customer_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    astrologer_id VARCHAR(64) NOT NULL REFERENCES astrologers(id) ON DELETE RESTRICT,
    service_id VARCHAR(64),
    service_name VARCHAR(255) DEFAULT 'General Vedic Consultation',
    consultation_mode VARCHAR(32) DEFAULT 'online',
    office_address TEXT,
    office_maps_url TEXT,
    scheduled_date DATE NOT NULL,
    start_time VARCHAR(10) NOT NULL,
    end_time VARCHAR(10) NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 30,
    start_timestamp TIMESTAMPTZ NOT NULL,
    end_timestamp TIMESTAMPTZ NOT NULL,
    fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(10, 2),
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_id VARCHAR(64) REFERENCES payments(id) ON DELETE SET NULL,
    payment_gateway_order_id VARCHAR(128),
    payment_transaction_id VARCHAR(128),
    payment_signature TEXT,
    payment_verified_at TIMESTAMPTZ,
    payment_method VARCHAR(64) DEFAULT 'easebuzz',
    booking_status VARCHAR(50) DEFAULT 'pending',
    slot_hold_expires_at TIMESTAMPTZ,
    customer_notes TEXT,
    astrologer_notes TEXT,
    rejection_reason TEXT,
    cancellation_reason TEXT,
    refund_status VARCHAR(32),
    refund_amount NUMERIC(10, 2),
    refund_reason TEXT,
    refund_transaction_id VARCHAR(128),
    refunded_at TIMESTAMPTZ,
    google_calendar_event_id VARCHAR(255),
    google_meet_link TEXT,
    google_meet_status VARCHAR(50) DEFAULT 'pending',
    google_meet_error TEXT,
    confirmed_at TIMESTAMPTZ,
    confirmed_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ,
    accepted_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consultation_customer ON consultation_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_consultation_astrologer ON consultation_bookings(astrologer_id);
CREATE INDEX IF NOT EXISTS idx_consultation_date ON consultation_bookings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_consultation_status ON consultation_bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_consultation_start_ts ON consultation_bookings(start_timestamp);

-- Ensure columns exist if consultation_bookings table was already created
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

-- Payments alteration for consultations
ALTER TABLE payments ADD COLUMN IF NOT EXISTS booking_id VARCHAR(64);

-- Order alterations
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by JSONB;
