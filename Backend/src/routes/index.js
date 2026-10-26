const router = require("express").Router();

// New Modular Architecture
const authRoutes = require("../modules/auth/auth.routes");
const userRoutes = require("../modules/users/users.routes");
const productRoutes = require("../modules/products/products.routes");
const categoryRoutes = require("../modules/categories/categories.routes");
const cartRoutes = require("../modules/cart/cart.routes");
const addressRoutes = require("../modules/addresses/addresses.routes");
const orderRoutes = require("../modules/orders/orders.routes");
const paymentRoutes = require("../modules/payments/payments.routes");
const inventoryRoutes = require("../modules/inventory/inventory.routes");
const customerRoutes = require("../modules/customers/customers.routes");
const adminRoutes = require("../modules/admin/admin.routes");
const notificationRoutes = require("../modules/notifications/notifications.routes");
const horoscopeRoutes = require("../modules/horoscope/horoscope.routes");
const consultationRoutes = require("../modules/consultations/consultations.routes");
const cryptoRoutes = require("../modules/crypto/crypto.routes");

// Auxiliary / Supporting Features
const shippingRoutes = require("./shipping");
const pickupLocationRoutes = require("./pickupLocations");
const shippingSettingRoutes = require("./shippingSettings");
const returnRoutes = require("./returns");
const reviewRoutes = require("./reviews");
const supportRoutes = require("./support");
const couponRoutes = require("./coupons");
const referralRoutes = require("./referrals");
const settingsRoutes = require("./settings");

const { noCacheMiddleware } = require("../middleware/cache.middleware");

// Mount Core Modular Routes
router.use("/auth", authRoutes);
router.use("/users", noCacheMiddleware, userRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/cart", noCacheMiddleware, cartRoutes); // Mounted and fully accessible
router.use("/addresses", noCacheMiddleware, addressRoutes);
router.use("/orders", noCacheMiddleware, orderRoutes);
router.use("/payments", noCacheMiddleware, paymentRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/customers", noCacheMiddleware, customerRoutes);
router.use("/admin", noCacheMiddleware, adminRoutes);
router.use("/notifications", notificationRoutes);
router.use("/horoscope", horoscopeRoutes);
router.use("/consultations", noCacheMiddleware, consultationRoutes);
router.use("/settings", noCacheMiddleware, settingsRoutes);
router.use("/crypto", noCacheMiddleware, cryptoRoutes);

// Mount Supporting Routes
router.use("/shipping", shippingRoutes);
router.use("/pickup-locations", pickupLocationRoutes);
router.use("/shipping-settings", shippingSettingRoutes);
router.use("/returns", returnRoutes);
router.use("/admin/returns", returnRoutes);
router.use("/reviews", reviewRoutes);
router.use("/support", supportRoutes);
router.use("/coupons", couponRoutes);
router.use("/referrals", referralRoutes);

module.exports = router;
