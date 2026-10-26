require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("../config/database");

const Category = require("../models/Category");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Address = require("../models/Address");
const Payment = require("../models/Payment");
const Review = require("../models/Review");
const Return = require("../models/Return");
const ShippingSetting = require("../models/ShippingSetting");
const PickupLocation = require("../models/PickupLocation");
const Coupon = require("../models/Coupon");

async function testPhase3() {
  console.log("==========================================");
  console.log("Running Phase 3 Database & Integrity Tests");
  console.log("==========================================\n");

  await connectDatabase();

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  try {
    // 1. Category Data & Slugs
    await check("1. Verify seeded categories exist and have valid slugs", async () => {
      const categories = await Category.find({ active: true });
      if (categories.length < 6) throw new Error(`Expected at least 6 categories, found ${categories.length}`);
      for (const cat of categories) {
        if (!cat.name || !cat.slug) throw new Error(`Category ${cat.name} missing name or slug`);
      }
    });

    // 2. Category Pre-validate Hook
    await check("2. Category pre-validate hook auto-generates slug when omitted", async () => {
      const testCat = new Category({ name: "Temporary Test Gemstones Category" });
      await testCat.validate();
      if (testCat.slug !== "temporary-test-gemstones-category") {
        throw new Error(`Expected auto-generated slug, got: ${testCat.slug}`);
      }
    });

    // 3. Product Catalog Data
    await check("3. Verify seeded products exist with full required attributes", async () => {
      const products = await Product.find({ active: true });
      if (products.length < 12) throw new Error(`Expected at least 12 products, found ${products.length}`);
      for (const p of products) {
        if (!p.sku || typeof p.price !== "number" || typeof p.stock !== "number" || !p.imageUrl) {
          throw new Error(`Product ${p.name} missing essential fields`);
        }
        if (!p.imageUrl.startsWith("/uploads/placeholders/")) {
          throw new Error(`Product ${p.name} does not use local placeholder image: ${p.imageUrl}`);
        }
      }
    });

    // 4. Product Slugs
    await check("4. Product pre-validate hook generates slug when omitted", async () => {
      const prod = new Product({
        name: "Rudraksha 5 Mukhi Silver Pendant",
        description: "Test description",
        price: 999,
        category: "Rudraksha",
        stock: 5
      });
      await prod.validate();
      if (!prod.slug || !prod.slug.includes("rudraksha-5-mukhi-silver-pendant")) {
        throw new Error(`Expected slug containing product name, got: ${prod.slug}`);
      }
    });

    // 5. Model Index Synchronization
    await check("5. Verify database compound indexes on high-traffic models", async () => {
      // Sync indexes to ensure MongoDB Atlas has registered all indexes
      await Promise.all([
        Order.syncIndexes(),
        Address.syncIndexes(),
        Product.syncIndexes(),
        Payment.syncIndexes(),
        Review.syncIndexes(),
        Return.syncIndexes(),
        Category.syncIndexes()
      ]);

      const orderIndexes = await Order.collection.indexes();
      const hasOrderUserIndex = orderIndexes.some((idx) => idx.key.user && idx.key.createdAt);
      if (!hasOrderUserIndex) throw new Error("Order model missing { user: 1, createdAt: -1 } index");

      const addressIndexes = await Address.collection.indexes();
      const hasAddressUserIndex = addressIndexes.some((idx) => idx.key.user);
      if (!hasAddressUserIndex) throw new Error("Address model missing { user: 1 } index");

      const paymentIndexes = await Payment.collection.indexes();
      const hasPaymentTxIndex = paymentIndexes.some((idx) => idx.key.transactionId);
      if (!hasPaymentTxIndex) throw new Error("Payment model missing { transactionId: 1 } index");

      const reviewIndexes = await Review.collection.indexes();
      const hasReviewUnique = reviewIndexes.some((idx) => idx.unique && idx.key.product && idx.key.user);
      if (!hasReviewUnique) throw new Error("Review model missing unique index on { product: 1, user: 1 }");
    });

    // 6. Shipping Settings Integrity
    await check("6. Shipping settings record exists with valid delivery window", async () => {
      const settings = await ShippingSetting.findOne({ name: "default" });
      if (!settings) throw new Error("Default shipping settings document missing");
      if (settings.estimatedDaysMax < settings.estimatedDaysMin) {
        throw new Error("Invalid delivery window");
      }
      if (typeof settings.charge !== "number" || typeof settings.freeShippingMinimum !== "number") {
        throw new Error("Invalid shipping charges definition");
      }
    });

    // 7. Shipping Setting Validation Constraint
    await check("7. ShippingSetting rejects invalid delivery window (max < min)", async () => {
      const invalidSetting = new ShippingSetting({
        name: "test-invalid",
        estimatedDaysMin: 5,
        estimatedDaysMax: 2
      });
      let errorThrown = false;
      try {
        await invalidSetting.validate();
      } catch {
        errorThrown = true;
      }
      if (!errorThrown) throw new Error("Expected validation error for maxDays < minDays");
    });

    // 8. Pickup Location Integrity
    await check("8. Default warehouse pickup location exists and is marked default", async () => {
      const defaultPickup = await PickupLocation.findOne({ isDefault: true, active: true });
      if (!defaultPickup) throw new Error("No default active pickup location found");
      if (!defaultPickup.city || !defaultPickup.postalCode || !defaultPickup.address) {
        throw new Error("Pickup location missing critical address details");
      }
    });

    // 9. Coupon Integrity & Validation
    await check("9. Coupon validation rejects percentage discounts > 100", async () => {
      const invalidCoupon = new Coupon({
        code: "TEST150",
        discountType: "percentage",
        discountValue: 150
      });
      let errorThrown = false;
      try {
        await invalidCoupon.validate();
      } catch {
        errorThrown = true;
      }
      if (!errorThrown) throw new Error("Expected validation error for coupon discount > 100%");
    });

    // 10. Local Placeholder Assets
    await check("10. Local placeholder SVG assets exist in Backend uploads folder", async () => {
      const placeholderDir = path.join(__dirname, "../../uploads/placeholders");
      const requiredFiles = [
        "product-placeholder.svg",
        "category-placeholder.svg",
        "banner-placeholder.svg",
        "avatar-placeholder.svg"
      ];
      for (const file of requiredFiles) {
        const fullPath = path.join(placeholderDir, file);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Placeholder asset missing: ${file}`);
        }
      }
    });

  } finally {
    await mongoose.disconnect();
  }

  console.log(`\n==========================================`);
  console.log(`Phase 3 Tests Completed: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  if (failed > 0) process.exit(1);
}

testPhase3().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
