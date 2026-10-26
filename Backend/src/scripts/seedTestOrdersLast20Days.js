/**
 * ASTRO NIRVAN: Idempotent TEST Order Seeder for Last 20 Completed Days
 * 
 * Inserts clearly labeled TEST orders for the 20 calendar days immediately
 * preceding today (Day -1 to Day -20), excluding today.
 * 
 * Features:
 * - 100% Idempotent (safe to run multiple times without duplicating or deleting genuine data)
 * - Varied valid order statuses:
 *     * Awaiting admin confirmation (placed)
 *     * Confirmed & Processing (confirmed, processing)
 *     * Dispatched (shipped with courier and AWB)
 *     * Delivered (delivered with deliveredAt timestamp)
 *     * Cancelled (cancelled)
 * - Dual payment modes:
 *     * COD with pending payment
 *     * Paid orders with safe test payment records
 * - Uses valid PostgreSQL foreign keys and real existing products
 * - Clearly tagged with 'TEST' prefix in order numbers and customer identifiers
 */

const db = require("../database/db");
const crypto = require("crypto");

async function seedTestOrders() {
  console.log("=======================================================================");
  console.log("   SEEDING IDEMPOTENT TEST ORDERS FOR LAST 20 COMPLETED DAYS");
  console.log("=======================================================================\n");

  // 1. Fetch products to reference real foreign keys
  const prodRes = await db.query("SELECT id, name, price, image_url, images FROM products WHERE active = TRUE ORDER BY id ASC");
  if (prodRes.rows.length === 0) {
    throw new Error("No active products found in PostgreSQL database to reference.");
  }
  const products = prodRes.rows;
  console.log(`✓ Loaded ${products.length} active products for order item references.`);

  // 2. Ensure dedicated TEST customer exists
  const testUserId = "usr_test_migration_audit_customer";
  await db.query(
    `INSERT INTO users (id, name, email, mobile, password, role, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, email = EXCLUDED.email, active = TRUE`,
    [
      testUserId,
      "Test Devotee (TEST MIGRATION)",
      "test_migration_audit@astronirvan.com",
      "+919800000000",
      "$2a$10$RN0R/y7CU8m7uK.N845a7.pS4yRkYlJ00dO1x3V7lQ7Z0E9k2A2C6", // Devotee@12345
      "customer",
      true
    ]
  );
  console.log("✓ Verified dedicated TEST customer account: test_migration_audit@astronirvan.com");

  // 3. Define the 20 completed calendar days (Day -1 to Day -20, excluding today)
  const now = new Date();
  const dates = [];
  for (let i = 1; i <= 20; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(12, 0, 0, 0); // Noon on that calendar day
    dates.push(d);
  }
  dates.reverse(); // Chronological order: Day -20 to Day -1

  console.log(`✓ Target completed date range: ${dates[0].toISOString().slice(0, 10)} to ${dates[dates.length - 1].toISOString().slice(0, 10)} (20 days)`);

  let totalInsertedOrVerified = 0;

  for (let dayIdx = 0; dayIdx < dates.length; dayIdx++) {
    const targetDate = dates[dayIdx];
    const dateStr = targetDate.toISOString().slice(0, 10);
    const daySeedNum = dayIdx + 1;

    // We generate 5 varied orders per day across different valid lifecycle states:
    // Order 1: Delivered (Paid Online)
    // Order 2: Delivered (COD, Paid upon delivery)
    // Order 3: Dispatched (Shipped with Courier tracking)
    // Order 4: Confirmed / Processing
    // Order 5: Awaiting Admin Confirmation OR Cancelled
    const dailySpecs = [
      {
        orderSuffix: "01",
        status: "delivered",
        paymentMethod: "Online",
        paymentStatus: "paid",
        courier: "Blue Dart",
        deliveredOffsetHours: 4
      },
      {
        orderSuffix: "02",
        status: "delivered",
        paymentMethod: "cod",
        paymentStatus: "paid",
        courier: "Delhivery",
        deliveredOffsetHours: 6
      },
      {
        orderSuffix: "03",
        status: "shipped",
        paymentMethod: "Online",
        paymentStatus: "paid",
        courier: "DTDC",
        deliveredOffsetHours: null
      },
      {
        orderSuffix: "04",
        status: "processing",
        paymentMethod: "Online",
        paymentStatus: "paid",
        courier: null,
        deliveredOffsetHours: null
      },
      {
        orderSuffix: "05",
        status: dayIdx % 3 === 0 ? "cancelled" : "placed",
        paymentMethod: "cod",
        paymentStatus: "pending",
        courier: null,
        deliveredOffsetHours: null
      }
    ];

    for (const spec of dailySpecs) {
      const orderNumber = `TEST-ORD-${dateStr.replace(/-/g, "")}-${spec.orderSuffix}`;
      const orderId = `test_ord_${dateStr.replace(/-/g, "")}_${spec.orderSuffix}`;

      // Pick 1-2 products deterministically
      const prod1 = products[(dayIdx + parseInt(spec.orderSuffix, 10)) % products.length];
      const prod2 = products[(dayIdx + parseInt(spec.orderSuffix, 10) + 1) % products.length];
      const quantity1 = 1;
      const quantity2 = (parseInt(spec.orderSuffix, 10) % 2 === 0) ? 1 : 0;

      const items = [
        {
          product: prod1.id,
          name: prod1.name,
          price: Number(prod1.price),
          quantity: quantity1,
          image: prod1.image_url || prod1.images?.[0] || ""
        }
      ];

      if (quantity2 > 0) {
        items.push({
          product: prod2.id,
          name: prod2.name,
          price: Number(prod2.price),
          quantity: quantity2,
          image: prod2.image_url || prod2.images?.[0] || ""
        });
      }

      const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const shippingFee = subtotal >= 1000 ? 0 : 99;
      const total = subtotal + shippingFee;

      const orderCreatedAt = new Date(targetDate);
      orderCreatedAt.setHours(9 + parseInt(spec.orderSuffix, 10), 15, 0, 0);

      const confirmedAt = ["confirmed", "processing", "shipped", "delivered"].includes(spec.status)
        ? new Date(orderCreatedAt.getTime() + 30 * 60 * 1000)
        : null;

      const dispatchedAt = ["shipped", "delivered"].includes(spec.status)
        ? new Date(orderCreatedAt.getTime() + 2 * 3600 * 1000)
        : null;

      const deliveredAt = spec.deliveredOffsetHours
        ? new Date(orderCreatedAt.getTime() + spec.deliveredOffsetHours * 3600 * 1000)
        : null;

      const trackingEvents = [
        {
          status: "placed",
          description: spec.paymentMethod === "cod" ? "Order placed via Cash on Delivery" : "Order placed and paid online",
          occurredAt: orderCreatedAt
        }
      ];

      if (confirmedAt) {
        trackingEvents.push({
          status: "confirmed",
          description: "Order confirmed by Admin: Store Admin (admin@example.com)",
          occurredAt: confirmedAt
        });
      }
      if (dispatchedAt) {
        trackingEvents.push({
          status: "shipped",
          description: `Dispatched via ${spec.courier} (AWB: TEST-AWB-${orderNumber})`,
          occurredAt: dispatchedAt
        });
      }
      if (deliveredAt) {
        trackingEvents.push({
          status: "delivered",
          description: "Order safely delivered to recipient",
          occurredAt: deliveredAt
        });
      }
      if (spec.status === "cancelled") {
        trackingEvents.push({
          status: "cancelled",
          description: "Order cancelled by customer request",
          occurredAt: new Date(orderCreatedAt.getTime() + 60 * 60 * 1000)
        });
      }

      const shippingAddress = {
        fullName: "Test Customer (TEST)",
        mobile: "+919800000000",
        email: "test_migration_audit@astronirvan.com",
        address: `${100 + dayIdx} Temple Road, Test Enclave`,
        city: "Varanasi",
        state: "Uttar Pradesh",
        postalCode: "221001",
        country: "India"
      };

      const shipment = spec.courier ? {
        provider: spec.courier,
        awb: `TEST-AWB-${orderNumber}`,
        shipmentId: `TEST-SHIP-${orderNumber}`,
        shippedAt: dispatchedAt
      } : {};

      const confirmedBy = confirmedAt ? {
        adminId: "6aca7ee355d329ff8b4ec5c3",
        name: "Store Admin",
        email: "admin@example.com"
      } : null;

      // Upsert order
      await db.query(
        `INSERT INTO orders (
           id, order_number, user_id, subtotal, shipping_fee, discount_amount, total,
           shipping_address, items, status, payment_status, payment_method,
           stock_reserved, tracking_events, courier_name, tracking_id,
           confirmed_at, confirmed_by, shipment, delivered_at,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         ON CONFLICT (order_number) DO UPDATE SET
           status = EXCLUDED.status,
           payment_status = EXCLUDED.payment_status,
           delivered_at = EXCLUDED.delivered_at,
           updated_at = EXCLUDED.updated_at`,
        [
          orderId,
          orderNumber,
          testUserId,
          subtotal,
          shippingFee,
          0,
          total,
          JSON.stringify(shippingAddress),
          JSON.stringify(items),
          spec.status,
          spec.paymentStatus,
          spec.paymentMethod,
          false,
          JSON.stringify(trackingEvents),
          spec.courier,
          spec.courier ? `TEST-AWB-${orderNumber}` : null,
          confirmedAt,
          confirmedBy ? JSON.stringify(confirmedBy) : null,
          JSON.stringify(shipment),
          deliveredAt,
          orderCreatedAt,
          deliveredAt || dispatchedAt || confirmedAt || orderCreatedAt
        ]
      );

      // Upsert order items
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const itemId = `${orderId}_it_${idx}`;
        await db.query(
          `INSERT INTO order_items (id, order_id, product_id, name, price, quantity, image, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            itemId,
            orderId,
            it.product,
            it.name,
            it.price,
            it.quantity,
            it.image,
            orderCreatedAt
          ]
        );
      }

      // Upsert payment record
      const paymentId = `test_pay_${orderId}`;
      await db.query(
        `INSERT INTO payments (
           id, order_id, user_id, client_reference, method, provider,
           status, transaction_id, amount, paid_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           paid_at = EXCLUDED.paid_at,
           updated_at = EXCLUDED.updated_at`,
        [
          paymentId,
          orderId,
          testUserId,
          orderNumber,
          spec.paymentMethod,
          spec.paymentMethod === "cod" ? "cod" : "test_razorpay",
          spec.paymentStatus,
          spec.paymentStatus === "paid" ? `TEST-TXN-${orderNumber}` : null,
          total,
          spec.paymentStatus === "paid" ? (deliveredAt || orderCreatedAt) : null,
          orderCreatedAt,
          deliveredAt || orderCreatedAt
        ]
      );

      totalInsertedOrVerified++;
    }
  }

  // Verification counts
  const countRes = await db.query("SELECT COUNT(*)::int AS count FROM orders WHERE order_number LIKE 'TEST-ORD-%'");
  console.log(`\n=======================================================================`);
  console.log(`✓ IDEMPOTENT TEST SEEDING COMPLETE:`);
  console.log(`  - 20 Completed Calendar Days Seeded (excluding today)`);
  console.log(`  - 5 varied orders per day = 100 total TEST orders created`);
  console.log(`  - Total active TEST orders verified in PostgreSQL: ${countRes.rows[0].count}`);
  console.log(`=======================================================================\n`);
}

if (require.main === module) {
  seedTestOrders()
    .then(async () => {
      await db.pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Test seed error:", err);
      await db.pool.end();
      process.exit(1);
    });
}

module.exports = seedTestOrders;
