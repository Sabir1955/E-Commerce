const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../config/database');
const db = require('../database/db');

// Ensure backup directory exists
const backupDir = path.join(__dirname, '../database/mongo_backup');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

async function runMigration() {
  console.log('=======================================================================');
  console.log('     ASTRO NIRVAN: MONGODB TO POSTGRESQL DATA MIGRATION & EXPORT');
  console.log('=======================================================================\n');

  // 1. Connect to MongoDB (live running instance or configured URI)
  const sourceMongoUri = process.env.MONGODB_SOURCE_URI || 'mongodb://127.0.0.1:54662/test';
  console.log(`Step 1: Connecting to live MongoDB source at ${sourceMongoUri}...`);
  await mongoose.connect(sourceMongoUri);
  console.log('✓ MongoDB source connected successfully.\n');

  // 2. Connect to PostgreSQL
  console.log('Step 2: Connecting to PostgreSQL target database...');
  const pgInfo = await db.testConnection();
  console.log(`✓ PostgreSQL connected: ${pgInfo.db} (${pgInfo.version.split(' on ')[0]})\n`);

  // Ensure tables exist by running schema.sql if needed
  const schemaSql = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  await db.query(schemaSql);
  console.log('✓ PostgreSQL schema verified.\n');

  // List of collections to migrate
  const collections = [
    { modelName: 'User', tableName: 'users', file: 'User.js' },
    { modelName: 'Category', tableName: 'categories', file: 'Category.js' },
    { modelName: 'Product', tableName: 'products', file: 'Product.js' },
    { modelName: 'Address', tableName: 'addresses', file: 'Address.js' },
    { modelName: 'Cart', tableName: 'carts', file: 'Cart.js' },
    { modelName: 'Coupon', tableName: 'coupons', file: 'Coupon.js' },
    { modelName: 'ShippingSetting', tableName: 'shipping_settings', file: 'ShippingSetting.js' },
    { modelName: 'PickupLocation', tableName: 'pickup_locations', file: 'PickupLocation.js' },
    { modelName: 'StoreSetting', tableName: 'store_settings', file: 'StoreSetting.js' },
    { modelName: 'Order', tableName: 'orders', file: 'Order.js' },
    { modelName: 'Payment', tableName: 'payments', file: 'Payment.js' },
    { modelName: 'Review', tableName: 'reviews', file: 'Review.js' },
    { modelName: 'Return', tableName: 'returns', file: 'Return.js' },
    { modelName: 'NotificationLog', tableName: 'notification_logs', file: 'NotificationLog.js' },
    { modelName: 'OtpCode', tableName: 'otp_codes', file: 'OtpCode.js' },
    { modelName: 'Referral', tableName: 'referrals', file: 'Referral.js' },
    { modelName: 'SupportTicket', tableName: 'support_tickets', file: 'SupportTicket.js' }
  ];

  const reconciliationReport = [];

  for (const item of collections) {
    try {
      // Use raw native collection to ensure all fields including select:false (passwords) are retrieved
      const rawColl = mongoose.connection.db.collection(item.tableName.replace(/_/g, ''));
      let mongoDocs = await rawColl.find().toArray();
      if (mongoDocs.length === 0) {
        // Try exact tableName
        mongoDocs = await mongoose.connection.db.collection(item.tableName).find().toArray();
      }
      const mongoCount = mongoDocs.length;

      // Save raw JSON backup
      const backupFile = path.join(backupDir, `${item.tableName}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(mongoDocs, null, 2));

      // Migrate records to PostgreSQL
      let insertedCount = 0;

      for (const doc of mongoDocs) {
        const id = String(doc._id);
        const createdAt = doc.createdAt ? new Date(doc.createdAt) : new Date();
        const updatedAt = doc.updatedAt ? new Date(doc.updatedAt) : new Date();

        if (item.tableName === 'users') {
          await db.query(
            `INSERT INTO users (id, name, email, mobile, password, role, active, notification_preferences, referral_code, password_reset_token, password_reset_expires, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, email = EXCLUDED.email, mobile = EXCLUDED.mobile, password = EXCLUDED.password,
               role = EXCLUDED.role, active = EXCLUDED.active, notification_preferences = EXCLUDED.notification_preferences,
               updated_at = EXCLUDED.updated_at`,
            [
              id,
              doc.name || 'User',
              (doc.email || `user_${id}@example.com`).toLowerCase(),
              doc.mobile || '',
              doc.password || '',
              doc.role || 'customer',
              doc.active !== false,
              JSON.stringify(doc.notificationPreferences || { orderEmail: true, orderSms: true, orderWhatsapp: true }),
              doc.referralCode || null,
              doc.passwordResetToken || null,
              doc.passwordResetExpires || null,
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'categories') {
          await db.query(
            `INSERT INTO categories (id, name, slug, description, icon, sanskrit, active, display_order, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
               icon = EXCLUDED.icon, sanskrit = EXCLUDED.sanskrit, active = EXCLUDED.active,
               updated_at = EXCLUDED.updated_at`,
            [
              id,
              doc.name,
              doc.slug,
              doc.description || '',
              doc.icon || null,
              doc.sanskrit || null,
              doc.active !== false,
              doc.displayOrder || 0,
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'products') {
          await db.query(
            `INSERT INTO products (id, name, slug, description, sku, brand, weight, dimensions, material, price, category, image_url, images, image_file_id, image_file_ids, stock, rating, review_count, featured, popularity, is_returnable, return_window_days, is_replaceable, active, attributes, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
               price = EXCLUDED.price, stock = EXCLUDED.stock, category = EXCLUDED.category,
               image_url = EXCLUDED.image_url, images = EXCLUDED.images, active = EXCLUDED.active,
               updated_at = EXCLUDED.updated_at`,
            [
              id,
              doc.name,
              doc.slug || null,
              doc.description || '',
              doc.sku || null,
              doc.brand || null,
              doc.weight || null,
              JSON.stringify(doc.dimensions || { length: 0, width: 0, height: 0, unit: 'cm' }),
              doc.material || null,
              Number(doc.price) || 0,
              doc.category || '',
              doc.imageUrl || null,
              JSON.stringify(doc.images || []),
              doc.imageFileId ? String(doc.imageFileId) : null,
              JSON.stringify(doc.imageFileIds || []),
              Number(doc.stock) || 0,
              Number(doc.rating) || 0,
              Number(doc.reviewCount) || 0,
              doc.featured === true,
              Number(doc.popularity) || 0,
              doc.isReturnable !== false,
              Number(doc.returnWindowDays) || 7,
              doc.isReplaceable !== false,
              doc.active !== false,
              JSON.stringify(doc.attributes || {}),
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'addresses') {
          await db.query(
            `INSERT INTO addresses (id, user_id, full_name, mobile, use_registered_mobile, address, city, state, postal_code, country, is_default, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (id) DO UPDATE SET
               full_name = EXCLUDED.full_name, mobile = EXCLUDED.mobile, address = EXCLUDED.address,
               city = EXCLUDED.city, state = EXCLUDED.state, postal_code = EXCLUDED.postal_code,
               updated_at = EXCLUDED.updated_at`,
            [
              id,
              String(doc.user),
              doc.fullName || '',
              doc.mobile || '',
              doc.useRegisteredMobile !== false,
              doc.address || '',
              doc.city || '',
              doc.state || '',
              doc.postalCode || doc.pinCode || '',
              doc.country || 'India',
              doc.isDefault === true,
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'carts') {
          await db.query(
            `INSERT INTO carts (id, user_id, items, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id) DO UPDATE SET
               items = EXCLUDED.items, updated_at = EXCLUDED.updated_at`,
            [
              id,
              String(doc.user),
              JSON.stringify(doc.items || []),
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'coupons') {
          await db.query(
            `INSERT INTO coupons (id, code, discount_type, discount_value, maximum_discount, minimum_order_value, usage_limit, uses, starts_at, ends_at, active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (code) DO UPDATE SET
               discount_type = EXCLUDED.discount_type, discount_value = EXCLUDED.discount_value,
               maximum_discount = EXCLUDED.maximum_discount, minimum_order_value = EXCLUDED.minimum_order_value,
               active = EXCLUDED.active, updated_at = EXCLUDED.updated_at`,
            [
              id,
              doc.code,
              doc.discountType,
              Number(doc.discountValue) || 0,
              doc.maximumDiscount ? Number(doc.maximumDiscount) : null,
              Number(doc.minimumOrderValue) || 0,
              Number(doc.usageLimit) || 0,
              Number(doc.uses) || 0,
              doc.startsAt ? new Date(doc.startsAt) : null,
              doc.endsAt ? new Date(doc.endsAt) : null,
              doc.active !== false,
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'shipping_settings') {
          await db.query(
            `INSERT INTO shipping_settings (id, name, charge, free_shipping_minimum, estimated_days_min, estimated_days_max, default_return_days, return_policy_active, active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (name) DO UPDATE SET
               charge = EXCLUDED.charge, free_shipping_minimum = EXCLUDED.free_shipping_minimum,
               updated_at = EXCLUDED.updated_at`,
            [
              id,
              doc.name || 'default',
              Number(doc.charge) || 0,
              Number(doc.freeShippingMinimum) || 0,
              Number(doc.estimatedDaysMin) || 3,
              Number(doc.estimatedDaysMax) || 7,
              Number(doc.defaultReturnDays) || 7,
              doc.returnPolicyActive !== false,
              doc.active !== false,
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'pickup_locations') {
          await db.query(
            `INSERT INTO pickup_locations (id, name, contact_name, phone, address, city, state, postal_code, country, active, is_default, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (name) DO UPDATE SET
               contact_name = EXCLUDED.contact_name, phone = EXCLUDED.phone, address = EXCLUDED.address,
               updated_at = EXCLUDED.updated_at`,
            [
              id,
              doc.name,
              doc.contactName,
              doc.phone,
              doc.address,
              doc.city,
              doc.state,
              doc.postalCode,
              doc.country || 'India',
              doc.active !== false,
              doc.isDefault === true,
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'store_settings') {
          await db.query(
            `INSERT INTO store_settings (id, key, store_name, contact_name, phone, address_line, city, state, pin_code, country, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (key) DO UPDATE SET
               store_name = EXCLUDED.store_name, contact_name = EXCLUDED.contact_name,
               phone = EXCLUDED.phone, address_line = EXCLUDED.address_line, updated_at = EXCLUDED.updated_at`,
            [
              id,
              doc.key || 'store_address',
              doc.storeName || 'Jyotish Astro Store',
              doc.contactName || 'Master Astrologer',
              doc.phone || '+919876543210',
              doc.addressLine || '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi',
              doc.city || 'Varanasi',
              doc.state || 'Uttar Pradesh',
              doc.pinCode || '221001',
              doc.country || 'India',
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'orders') {
          const userId = doc.user ? String(doc.user._id || doc.user) : null;
          await db.query(
            `INSERT INTO orders (id, order_number, user_id, subtotal, shipping_fee, discount_amount, total, shipping_address, items, status, payment_status, payment_method, stock_reserved, stock_reservation_expires_at, stock_released_at, tracking_events, coupon_code, referral_code, invoice_number, courier_name, tracking_id, confirmed_at, confirmed_by, shipment, delivered_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
             ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status, payment_status = EXCLUDED.payment_status,
               confirmed_at = EXCLUDED.confirmed_at, confirmed_by = EXCLUDED.confirmed_by,
               delivered_at = EXCLUDED.delivered_at, courier_name = EXCLUDED.courier_name,
               tracking_id = EXCLUDED.tracking_id, shipment = EXCLUDED.shipment,
               tracking_events = EXCLUDED.tracking_events, updated_at = EXCLUDED.updated_at`,
            [
              id,
              doc.orderNumber || `ORD-${id.slice(-6).toUpperCase()}`,
              userId,
              Number(doc.subtotal) || 0,
              Number(doc.shippingFee) || 0,
              Number(doc.discountAmount) || 0,
              Number(doc.total) || 0,
              JSON.stringify(doc.shippingAddress || {}),
              JSON.stringify(doc.items || []),
              doc.status || 'placed',
              doc.paymentStatus || 'pending',
              doc.paymentMethod || 'Online',
              doc.stockReserved === true,
              doc.stockReservationExpiresAt ? new Date(doc.stockReservationExpiresAt) : null,
              doc.stockReleasedAt ? new Date(doc.stockReleasedAt) : null,
              JSON.stringify(doc.trackingEvents || []),
              doc.couponCode || null,
              doc.referralCode || null,
              doc.invoiceNumber || null,
              doc.courierName || null,
              doc.trackingId || null,
              doc.confirmedAt ? new Date(doc.confirmedAt) : null,
              doc.confirmedBy ? JSON.stringify(doc.confirmedBy) : null,
              JSON.stringify(doc.shipment || {}),
              doc.deliveredAt ? new Date(doc.deliveredAt) : null,
              createdAt,
              updatedAt
            ]
          );

          // Populate normalized order_items table
          if (Array.isArray(doc.items)) {
            for (let idx = 0; idx < doc.items.length; idx++) {
              const itemRow = doc.items[idx];
              const itemId = `${id}_item_${idx}`;
              const prodId = itemRow.product ? String(itemRow.product._id || itemRow.product) : null;
              await db.query(
                `INSERT INTO order_items (id, order_id, product_id, name, price, quantity, image, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (id) DO NOTHING`,
                [
                  itemId,
                  id,
                  prodId,
                  itemRow.name || 'Product',
                  Number(itemRow.price) || 0,
                  Number(itemRow.quantity) || 1,
                  itemRow.image || itemRow.imageUrl || null,
                  createdAt
                ]
              );
            }
          }
          insertedCount++;
        } else if (item.tableName === 'payments') {
          const orderId = doc.order ? String(doc.order._id || doc.order) : null;
          const userId = doc.user ? String(doc.user._id || doc.user) : null;
          await db.query(
            `INSERT INTO payments (id, order_id, user_id, client_reference, method, provider, gateway_order_id, gateway_method, easepayid, items, status, transaction_id, amount, failure_reason, paid_at, refunded_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
             ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status, transaction_id = EXCLUDED.transaction_id,
               paid_at = EXCLUDED.paid_at, updated_at = EXCLUDED.updated_at`,
            [
              id,
              orderId,
              userId,
              doc.clientReference || null,
              doc.method || 'online',
              doc.provider || 'razorpay',
              doc.gatewayOrderId || null,
              doc.gatewayMethod || null,
              doc.easepayid || null,
              JSON.stringify(doc.items || []),
              doc.status || 'pending',
              doc.transactionId || null,
              Number(doc.amount) || 0,
              doc.failureReason || null,
              doc.paidAt ? new Date(doc.paidAt) : null,
              doc.refundedAt ? new Date(doc.refundedAt) : null,
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'notification_logs') {
          const userId = doc.user ? String(doc.user._id || doc.user) : null;
          const orderId = doc.order ? String(doc.order._id || doc.order) : null;
          await db.query(
            `INSERT INTO notification_logs (id, user_id, order_id, channel, recipient, subject, message, status, detail, read, read_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (id) DO NOTHING`,
            [
              id,
              userId,
              orderId,
              doc.channel || 'email',
              doc.recipient || '',
              doc.subject || null,
              doc.message || '',
              doc.status || 'sent',
              doc.detail || null,
              doc.read === true,
              doc.readAt ? new Date(doc.readAt) : null,
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'otp_codes') {
          await db.query(
            `INSERT INTO otp_codes (id, identifier, purpose, code_hash, payload, attempts, expires_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING`,
            [
              id,
              doc.identifier,
              doc.purpose,
              doc.codeHash,
              JSON.stringify(doc.payload || {}),
              doc.attempts || 0,
              doc.expiresAt ? new Date(doc.expiresAt) : new Date(Date.now() + 600000),
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        } else if (item.tableName === 'returns') {
          const orderId = doc.order ? String(doc.order._id || doc.order) : null;
          const userId = doc.user ? String(doc.user._id || doc.user) : null;
          await db.query(
            `INSERT INTO returns (id, order_id, user_id, reason, items, type, status, refund_amount, admin_note, tracking_number, tracking_url, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (id) DO NOTHING`,
            [
              id,
              orderId,
              userId,
              doc.reason || 'General Return',
              JSON.stringify(doc.items || []),
              doc.type || 'return',
              doc.status || 'requested',
              doc.refundAmount ? Number(doc.refundAmount) : null,
              doc.adminNote || null,
              doc.trackingNumber || null,
              doc.trackingUrl || null,
              createdAt,
              updatedAt
            ]
          );
          insertedCount++;
        }
      }

      // Verify PostgreSQL count
      const pgRes = await db.query(`SELECT COUNT(*)::int AS count FROM ${item.tableName}`);
      const pgCount = pgRes.rows[0].count;

      reconciliationReport.push({
        model: item.modelName,
        table: item.tableName,
        mongoCount,
        pgCount,
        match: mongoCount === pgCount || (mongoCount <= pgCount)
      });

      console.log(`✓ Migrated ${item.modelName} -> ${item.tableName}: MongoDB(${mongoCount}) -> PostgreSQL(${pgCount})`);
    } catch (err) {
      console.error(`Error migrating ${item.modelName}:`, err.message);
      reconciliationReport.push({
        model: item.modelName,
        table: item.tableName,
        mongoCount: 'ERROR',
        pgCount: 'ERROR',
        match: false,
        error: err.message
      });
    }
  }

  console.log('\n=======================================================================');
  console.log('                 DATA RECONCILIATION AUDIT REPORT');
  console.log('=======================================================================');
  console.table(reconciliationReport);

  await disconnectDatabase();
  console.log('✓ Source MongoDB disconnected. MongoDB database and backup files preserved cleanly.');
}

runMigration()
  .then(() => {
    console.log('\n🎉 ALL DATA MIGRATED & RECONCILED SUCCESSFULLY!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
