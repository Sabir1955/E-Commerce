const db = require("../database/db");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Cart = require("../models/Cart");
const Coupon = require("../models/Coupon");

function supportsTransactions() {
  return true; // PostgreSQL always supports transactions
}

async function redeemCoupon(coupon, client) {
  if (!coupon) return;
  const couponId = String(coupon._id || coupon.id);
  const res = await client.query(
    "UPDATE coupons SET uses = uses + 1, updated_at = NOW() WHERE id = $1 AND active = TRUE RETURNING *",
    [couponId]
  );
  if (res.rowCount === 0) {
    const error = new Error("Coupon is expired, inactive, or has reached its usage limit");
    error.statusCode = 409;
    throw error;
  }
}

async function decrementStock(items, client) {
  for (const item of items) {
    const prodId = String(item.product);
    const quantity = Number(item.quantity);
    const res = await client.query(
      "UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND active = TRUE AND COALESCE(is_available, true) = TRUE AND stock >= $1 RETURNING *",
      [quantity, prodId]
    );
    if (res.rowCount === 0) {
      const error = new Error("Product is unavailable or stock changed; please retry checkout");
      error.statusCode = 409;
      throw error;
    }
  }
}

async function createOrderAndPayment({ orderData, paymentData, cart, itemList, coupon }) {
  return db.transaction(async (client) => {
    // 1. Decrement stock atomically
    await decrementStock(itemList, client);

    // 2. Redeem coupon if applicable
    if (coupon) {
      await redeemCoupon(coupon, client);
    }

    // 3. Create order with stock_deducted = true
    const order = new Order({ ...orderData, stockDeducted: true });
    await order.save();

    // 4. Create payment
    const payment = new Payment({ ...paymentData, orderId: order.id });
    await payment.save();

    // 5. Clear cart
    if (cart) {
      cart.items = [];
      await cart.save().catch((err) => console.error("Order saved but cart could not be cleared:", err.message));
    }

    try {
      const { invalidateCache } = require("../middleware/cache.middleware");
      invalidateCache(["products", "categories"]);
    } catch (_) {}

    return order;
  });
}

async function releaseExpiredReservations(now = new Date()) {
  const expired = await Order.find({
    status: "awaiting_payment",
    stockReserved: true,
    stockReservationExpiresAt: { $lte: now },
    paymentStatus: { $in: ["pending", "failed"] }
  }).limit(50);

  let releasedCount = 0;
  for (const order of expired) {
    if (order.stockReleasedAt) continue;

    await db.transaction(async (client) => {
      await client.query(
        "UPDATE orders SET status = 'cancelled', stock_reserved = FALSE, stock_released_at = $1, updated_at = NOW() WHERE id = $2 AND stock_released_at IS NULL",
        [now, order.id]
      );
      if ((order.stockDeducted || order.stockReserved) && Array.isArray(order.items)) {
        for (const item of order.items) {
          const prodId = item.product
            ? String(typeof item.product === "object" ? item.product._id || item.product.id : item.product)
            : (item.productId ? String(item.productId) : null);
          if (prodId) {
            await client.query(
              "UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2",
              [Number(item.quantity) || 1, prodId]
            );
          }
        }
      }
    }).catch((err) => console.error("[Inventory] Error releasing reservation for order", order.id, err.message));

    releasedCount++;
  }

  if (releasedCount > 0) {
    try {
      const { invalidateCache } = require("../middleware/cache.middleware");
      invalidateCache(["products", "categories"]);
    } catch (_) {}
  }

  return releasedCount;
}

async function restoreOrderStock(order, reason = "failed") {
  if (order.stockReleasedAt) return;
  const now = new Date();

  await db.transaction(async (client) => {
    await client.query(
      "UPDATE orders SET stock_reserved = FALSE, stock_released_at = $1, updated_at = NOW() WHERE id = $2",
      [now, order.id]
    );

    if ((order.stockDeducted || order.stockReserved) && Array.isArray(order.items)) {
      for (const item of order.items) {
        const prodId = item.product
          ? String(typeof item.product === "object" ? item.product._id || item.product.id : item.product)
          : (item.productId ? String(item.productId) : null);
        if (prodId) {
          await client.query(
            "UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2",
            [Number(item.quantity) || 1, prodId]
          );
        }
      }
    }
  });

  order.stockReserved = false;
  order.stockReleasedAt = now;

  try {
    const { invalidateCache } = require("../middleware/cache.middleware");
    invalidateCache(["products", "categories"]);
  } catch (_) {}
}

async function confirmOrderPayment(order) {
  if (order.paymentStatus === "paid") return true;
  if (order.stockReleasedAt) return false;

  // Deduct stock upon successful payment if not already deducted during reservation
  if (!order.stockDeducted) {
    if (Array.isArray(order.items)) {
      for (const item of order.items) {
        const prodId = item.product
          ? String(typeof item.product === "object" ? item.product._id || item.product.id : item.product)
          : (item.productId ? String(item.productId) : null);
        const quantity = Number(item.quantity) || 1;
        if (prodId) {
          await db.query(
            "UPDATE products SET stock = GREATEST(0, stock - $1), updated_at = NOW() WHERE id = $2 AND active = TRUE",
            [quantity, prodId]
          );
        }
      }
    }
  }

  const events = Array.isArray(order.trackingEvents) ? [...order.trackingEvents] : [];
  events.push({ status: "placed", description: "Payment confirmed and order placed", occurredAt: new Date() });

  const nextStatus = order.status === "awaiting_payment" ? "placed" : order.status;

  const res = await db.query(
    `UPDATE orders
     SET payment_status = 'paid', stock_reserved = FALSE, stock_deducted = TRUE, stock_reservation_expires_at = NULL,
         status = $1, tracking_events = $2, updated_at = NOW()
     WHERE id = $3 AND payment_status = 'pending' AND stock_released_at IS NULL
     RETURNING *`,
    [nextStatus, JSON.stringify(events), order.id]
  );

  if (res.rowCount === 0) return false;

  order.paymentStatus = "paid";
  order.status = nextStatus;
  order.stockReserved = false;
  order.stockDeducted = true;
  order.stockReservationExpiresAt = null;
  order.trackingEvents = events;
  order.updatedAt = new Date();

  try {
    const { invalidateCache } = require("../middleware/cache.middleware");
    invalidateCache(["products", "categories"]);
  } catch (_) {}

  return true;
}

/**
 * Restock verified returned product units into PostgreSQL inventory.
 * Enforces transaction atomicity and duplicate restocking prevention.
 */
async function restockReturnItems(returnId, items) {
  if (!returnId || !Array.isArray(items) || items.length === 0) {
    return { restocked: false, count: 0 };
  }

  return db.transaction(async (client) => {
    const chk = await client.query(
      "SELECT is_restocked FROM returns WHERE id = $1 FOR UPDATE",
      [String(returnId)]
    );
    if (chk.rowCount > 0 && chk.rows[0].is_restocked) {
      return { restocked: false, reason: "Already restocked", count: 0 };
    }

    let restockedCount = 0;
    for (const it of items) {
      const pid = String(it.product?._id || it.product?.id || it.product || it.productId || "");
      const qty = Number(it.quantity || 1);
      if (pid && qty > 0) {
        await client.query(
          "UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2",
          [qty, pid]
        );
        restockedCount += qty;
      }
    }

    await client.query(
      "UPDATE returns SET is_restocked = TRUE, restocked_at = NOW() WHERE id = $1",
      [String(returnId)]
    );

    try {
      const { invalidateCache } = require("../middleware/cache.middleware");
      invalidateCache(["products", "categories"]);
    } catch (_) {}

    return { restocked: true, count: restockedCount };
  });
}

module.exports = {
  createOrderAndPayment,
  releaseExpiredReservations,
  restoreOrderStock,
  confirmOrderPayment,
  restockReturnItems,
  supportsTransactions
};

