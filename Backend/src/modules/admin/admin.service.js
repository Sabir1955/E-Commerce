const db = require("../../database/db");
const User = require("../../models/User");
const Product = require("../../models/Product");
const Category = require("../../models/Category");
const Order = require("../../models/Order");
const Address = require("../../models/Address");
const { BadRequestError, NotFoundError } = require("../../utils/errors");

class AdminService {
  async getDashboardSummary() {
    const [orderRes, productRes, catRes, userRes, consultRes, horoscopeRes, unconfirmedRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS orders,
          COUNT(CASE WHEN status = 'placed' THEN 1 END)::int AS awaiting_confirmation,
          COUNT(CASE WHEN status IN ('confirmed', 'processing', 'packed', 'pickup_requested') THEN 1 END)::int AS confirmed_processing,
          COUNT(CASE WHEN status = 'shipped' THEN 1 END)::int AS dispatched,
          COUNT(CASE WHEN status = 'out_for_delivery' THEN 1 END)::int AS out_for_delivery,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END)::int AS delivered,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS cancelled,
          COALESCE(SUM(CASE WHEN status != 'cancelled' AND (payment_status = 'paid' OR (LOWER(payment_method) = 'cod' AND status = 'delivered')) THEN total ELSE 0 END), 0)::numeric(12,2) AS actual_sales_revenue
        FROM orders
      `),
      db.query(`
        SELECT
          COUNT(*)::int AS products,
          COUNT(CASE WHEN stock <= 0 THEN 1 END)::int AS out_of_stock
        FROM products WHERE active = TRUE
      `),
      db.query("SELECT COUNT(*)::int AS count FROM categories WHERE active = TRUE"),
      db.query("SELECT COUNT(*)::int AS count FROM users WHERE role != 'admin'"),
      db.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(CASE WHEN booking_status = 'pending' THEN 1 END)::int AS pending,
          COUNT(CASE WHEN booking_status = 'confirmed' THEN 1 END)::int AS confirmed,
          COUNT(CASE WHEN scheduled_date = CURRENT_DATE THEN 1 END)::int AS today
        FROM consultation_bookings
      `),
      db.query(`
        SELECT COUNT(*)::int AS today_count
        FROM daily_horoscopes
        WHERE horoscope_date = CURRENT_DATE AND status = 'Published'
      `),
      db.query(`
        SELECT id, order_number, total, created_at, shipping_address->>'fullName' AS customer_name
        FROM orders
        WHERE status = 'placed'
        ORDER BY created_at DESC
        LIMIT 5
      `)
    ]);

    const orderRow = orderRes.rows[0] || {};
    const productRow = productRes.rows[0] || {};
    const consultRow = consultRes.rows[0] || {};
    const horoscopeRow = horoscopeRes.rows[0] || {};

    const orders = orderRow.orders || 0;
    const awaitingConfirmationOrders = orderRow.awaiting_confirmation || 0;
    const confirmedProcessingOrders = orderRow.confirmed_processing || 0;
    const dispatchedOrders = orderRow.dispatched || 0;
    const outForDeliveryOrders = orderRow.out_for_delivery || 0;
    const deliveredOrders = orderRow.delivered || 0;
    const cancelledOrders = orderRow.cancelled || 0;
    const actualSalesRevenue = Number(orderRow.actual_sales_revenue || 0);

    const pendingOrders = awaitingConfirmationOrders + confirmedProcessingOrders;
    const completedOrders = deliveredOrders;
    const shippedOrders = dispatchedOrders;

    const products = productRow.products || 0;
    const outOfStock = productRow.out_of_stock || 0;
    const categories = catRes.rows[0]?.count || 0;
    const customers = userRes.rows[0]?.count || 0;

    return {
      products,
      categories,
      customers,
      orders,
      awaitingConfirmationOrders,
      confirmedProcessingOrders,
      dispatchedOrders,
      deliveredOrders,
      pendingOrders,
      completedOrders,
      shippedOrders,
      outForDeliveryOrders,
      cancelledOrders,
      outOfStock,
      totalSales: actualSalesRevenue,
      actualSalesRevenue,
      consultationsTotal: consultRow.total || 0,
      consultationsPending: consultRow.pending || 0,
      consultationsConfirmed: consultRow.confirmed || 0,
      consultationsToday: consultRow.today || 0,
      horoscopesTodayCount: horoscopeRow.today_count || 0,
      recentUnconfirmedOrders: unconfirmedRes.rows || []
    };
  }

  async getSalesAnalytics() {
    const [totalSalesRes, methodRes, monthlyRes] = await Promise.all([
      db.query(`
        SELECT
          COALESCE(SUM(total), 0)::numeric(12,2) AS total_revenue,
          COUNT(*)::int AS paid_orders_count,
          COALESCE(AVG(total), 0)::numeric(12,2) AS avg_order_value
        FROM orders
        WHERE status != 'cancelled' AND (payment_status = 'paid' OR (LOWER(payment_method) = 'cod' AND status = 'delivered'))
      `),
      db.query(`
        SELECT payment_method AS _id, SUM(total)::numeric(12,2) AS revenue, COUNT(*)::int AS count
        FROM orders
        WHERE status != 'cancelled' AND (payment_status = 'paid' OR (LOWER(payment_method) = 'cod' AND status = 'delivered'))
        GROUP BY payment_method ORDER BY revenue DESC
      `),
      db.query(`
        SELECT TO_CHAR(created_at, 'YYYY-MM') AS _id, SUM(total)::numeric(12,2) AS revenue, COUNT(*)::int AS "orderCount"
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '6 months'
          AND status != 'cancelled' AND (payment_status = 'paid' OR (LOWER(payment_method) = 'cod' AND status = 'delivered'))
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY _id ASC
      `)
    ]);

    const totalRow = totalSalesRes.rows[0] || {};

    return {
      totalRevenue: Number(totalRow.total_revenue || 0),
      paidOrdersCount: totalRow.paid_orders_count || 0,
      avgOrderValue: Number(totalRow.avg_order_value || 0),
      salesByPaymentMethod: methodRes.rows.map((r) => ({ ...r, revenue: Number(r.revenue) })),
      monthlySales: monthlyRes.rows.map((r) => ({ ...r, revenue: Number(r.revenue) }))
    };
  }

  async getOrdersAnalytics() {
    const [statusRes, paymentStatusRes, recentOrders] = await Promise.all([
      db.query("SELECT status AS _id, COUNT(*)::int AS count FROM orders GROUP BY status"),
      db.query("SELECT payment_status AS _id, COUNT(*)::int AS count FROM orders GROUP BY payment_status"),
      Order.find()
        .populate("user", "name email")
        .select("orderNumber user total status paymentStatus createdAt")
        .sort({ createdAt: -1 })
        .limit(10)
    ]);

    return {
      statusBreakdown: Object.fromEntries(statusRes.rows.map((entry) => [entry._id, entry.count])),
      paymentBreakdown: Object.fromEntries(paymentStatusRes.rows.map((entry) => [entry._id, entry.count])),
      recentOrders
    };
  }

  async getInventoryAnalytics() {
    const [bucketRes, criticalLowStockProducts, categoryRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS "totalProducts",
          COUNT(CASE WHEN stock <= 0 THEN 1 END)::int AS "outOfStockCount",
          COUNT(CASE WHEN stock > 0 AND stock <= 5 THEN 1 END)::int AS "lowStockCount",
          COUNT(CASE WHEN stock > 5 THEN 1 END)::int AS "inStockCount"
        FROM products WHERE active = TRUE
      `),
      Product.find({ active: true, stock: { $lte: 5 } })
        .select("name slug brand sku stock price")
        .sort({ stock: 1 })
        .limit(10),
      db.query(`
        SELECT
          category AS _id,
          category AS "categoryName",
          COUNT(*)::int AS "totalProducts",
          COALESCE(SUM(stock), 0)::int AS "totalUnits"
        FROM products WHERE active = TRUE
        GROUP BY category
        ORDER BY "totalUnits" DESC
      `)
    ]);

    const bucketRow = bucketRes.rows[0] || {};

    return {
      summary: {
        totalProducts: bucketRow.totalProducts || 0,
        inStockCount: bucketRow.inStockCount || 0,
        lowStockCount: bucketRow.lowStockCount || 0,
        outOfStockCount: bucketRow.outOfStockCount || 0
      },
      criticalLowStockProducts,
      stockByCategory: categoryRes.rows
    };
  }

  async updateProductReturnPolicy(id, body) {
    const { isReturnable, returnWindowDays, isReplaceable } = body;
    const updates = {};
    if (isReturnable !== undefined) updates.isReturnable = Boolean(isReturnable);
    if (isReplaceable !== undefined) updates.isReplaceable = Boolean(isReplaceable);
    if (returnWindowDays !== undefined) {
      const days = Number(returnWindowDays);
      if (!Number.isInteger(days) || days < 0) {
        throw new BadRequestError("returnWindowDays must be a non-negative integer");
      }
      updates.returnWindowDays = days;
    }

    const product = await Product.findByIdAndUpdate(id, updates, { new: true });
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return {
      message: "Product return policy updated successfully",
      product
    };
  }

  async bulkUpdateReturnPolicy(body) {
    const { category, productIds, isReturnable, returnWindowDays, isReplaceable } = body;
    const filter = {};
    if (category) filter.category = category;
    if (Array.isArray(productIds) && productIds.length) filter._id = { $in: productIds };

    if (Object.keys(filter).length === 0) {
      throw new BadRequestError("Provide category or productIds to update");
    }

    const updates = {};
    if (isReturnable !== undefined) updates.isReturnable = Boolean(isReturnable);
    if (isReplaceable !== undefined) updates.isReplaceable = Boolean(isReplaceable);
    if (returnWindowDays !== undefined) {
      const days = Number(returnWindowDays);
      if (!Number.isInteger(days) || days < 0) {
        throw new BadRequestError("returnWindowDays must be a non-negative integer");
      }
      updates.returnWindowDays = days;
    }

    const result = await Product.updateMany(filter, { $set: updates });
    return {
      message: `Updated return policy for ${result.modifiedCount} products`,
      modifiedCount: result.modifiedCount
    };
  }

  async getStoreAddress(user) {
    const storeSettingService = require("../settings/storeSetting.service");
    return await storeSettingService.getStoreSetting();
  }

  async updateStoreAddress(user, body) {
    const storeSettingService = require("../settings/storeSetting.service");
    return await storeSettingService.updateStoreSetting(body);
  }
}

module.exports = new AdminService();
