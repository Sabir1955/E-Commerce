require("dotenv").config();
const bcrypt = require("bcryptjs");
const { connectDatabase, disconnectDatabase } = require("../config/database");

const User = require("../models/User");
const Category = require("../models/Category");
const Product = require("../models/Product");
const ShippingSetting = require("../models/ShippingSetting");
const PickupLocation = require("../models/PickupLocation");
const Coupon = require("../models/Coupon");

const CATEGORIES = [
  {
    name: "Gemstones",
    slug: "gemstones",
    description: "Certified natural Vedic gemstones (Pukhraj, Neelam, Manik, Moonga, Panna) energized through traditional pran-pratishtha rituals.",
    active: true
  },
  {
    name: "Rudraksha",
    slug: "rudraksha",
    description: "Authentic Himalayan and Indonesian Rudraksha beads (1 to 14 Mukhi) and energized japa malas.",
    active: true
  },
  {
    name: "Sacred Yantras",
    slug: "yantras",
    description: "24K Gold-plated and copper geometric Yantras for wealth, peace, vastu correction, and planetary alignment.",
    active: true
  },
  {
    name: "Healing Crystals",
    slug: "healing-crystals",
    description: "Natural raw crystals, polished pyramids, wands, and bracelets for chakra healing and energy enhancement.",
    active: true
  },
  {
    name: "Vastu & Feng Shui",
    slug: "feng-shui-vastu",
    description: "Traditional Vastu dosha remedies, brass tortoises, crystal pyramids, and evil eye protectors.",
    active: true
  },
  {
    name: "Puja Essentials",
    slug: "puja-essentials",
    description: "Pure brass puja articles, diya lamps, sacred dhoop burners, and energized offering accessories.",
    active: true
  }
];

const PRODUCTS = [
  {
    name: "Natural Yellow Sapphire (Pukhraj) 5.25 Ratti",
    sku: "GEM-PUK-001",
    description: "Authentic unheated Ceylon Yellow Sapphire certified by standard gemological laboratory. Governed by planet Jupiter (Guru), this stone brings wisdom, financial prosperity, and spiritual growth.",
    brand: "Vedic Gems",
    price: 12500,
    category: "Gemstones",
    weight: 1.05,
    material: "Natural Corundum",
    dimensions: { length: 0.9, width: 0.7, height: 0.5, unit: "cm" },
    stock: 8,
    featured: true,
    popularity: 95,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Certified Blue Sapphire (Neelam) 4.5 Ratti",
    sku: "GEM-NEL-002",
    description: "Natural unheated Blue Sapphire with deep royal blue hue. Associated with Lord Saturn (Shani), it provides rapid protection, mental clarity, and shields against sudden misfortune.",
    brand: "Vedic Gems",
    price: 18000,
    category: "Gemstones",
    weight: 0.9,
    material: "Natural Sapphire",
    dimensions: { length: 0.8, width: 0.6, height: 0.4, unit: "cm" },
    stock: 5,
    featured: true,
    popularity: 98,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Natural Italian Red Coral (Moonga) 6.0 Ratti",
    sku: "GEM-MNG-003",
    description: "Premium triangular cut Italian Red Coral with radiant vermilion luster. Associated with planet Mars (Mangal), enhancing courage, physical vitality, and removing obstacles in career.",
    brand: "Vedic Gems",
    price: 6500,
    category: "Gemstones",
    weight: 1.2,
    material: "Organic Corallium Rubrum",
    dimensions: { length: 1.1, width: 0.9, height: 0.4, unit: "cm" },
    stock: 14,
    featured: false,
    popularity: 84,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Original 5 Mukhi Nepali Rudraksha Mala (108+1 Beads)",
    sku: "RUD-MAL-001",
    description: "Handcrafted 108+1 bead mala strung with high-grade Nepali 5 Mukhi Rudraksha. Ideal for daily chanting, meditation, blood pressure regulation, and mental tranquility.",
    brand: "Sacred Beads",
    price: 1499,
    category: "Rudraksha",
    weight: 85,
    material: "Natural Elaeocarpus Ganitrus",
    dimensions: { length: 45, width: 1.2, height: 1.2, unit: "cm" },
    stock: 40,
    featured: true,
    popularity: 92,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Collector Grade 7 Mukhi Nepali Rudraksha",
    sku: "RUD-7MK-002",
    description: "Rare and auspicious 7 Mukhi Rudraksha blessed by Goddess Mahalakshmi. Bestows abundance, helps overcome financial distress, and attracts good luck.",
    brand: "Sacred Beads",
    price: 3200,
    category: "Rudraksha",
    weight: 4.5,
    material: "Natural Nepali Rudraksha",
    dimensions: { length: 2.2, width: 2.0, height: 2.0, unit: "cm" },
    stock: 12,
    featured: true,
    popularity: 89,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Sampoorna Sri Yantra in Pure Brass (Heavy Casting)",
    sku: "YAN-SRI-001",
    description: "Masterwork 3D Meru Sri Yantra carved in virgin brass with precise Vedic geometry. Cleanses spatial energy, dispels vastu doshas, and magnetizes prosperity to homes and workplaces.",
    brand: "Divya Yantras",
    price: 2499,
    category: "Sacred Yantras",
    weight: 650,
    material: "Virgin Brass",
    dimensions: { length: 10, width: 10, height: 12, unit: "cm" },
    stock: 22,
    featured: true,
    popularity: 96,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Kuber Yantra 24K Gold Plated Plate (6x6 inch)",
    sku: "YAN-KUB-002",
    description: "Energized Lord Kuber Yantra engraved on durable brass plate with 24-karat gold finish. Placed in cash boxes, safes, or north-facing altar to safeguard wealth and growth.",
    brand: "Divya Yantras",
    price: 999,
    category: "Sacred Yantras",
    weight: 180,
    material: "Gold Plated Brass",
    dimensions: { length: 15, width: 15, height: 0.2, unit: "cm" },
    stock: 35,
    featured: false,
    popularity: 80,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Natural Amethyst Raw Cluster Geode (Brazil)",
    sku: "CRY-AME-001",
    description: "Deep purple natural Brazilian Amethyst cluster. Emits high spiritual vibrations, neutralizes negative electronic geopathic stress, and supports profound meditation.",
    brand: "Aura Crystals",
    price: 1850,
    category: "Healing Crystals",
    weight: 350,
    material: "Natural Quartz Crystal",
    dimensions: { length: 8, width: 6, height: 5, unit: "cm" },
    stock: 18,
    featured: true,
    popularity: 87,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Rose Quartz Energy Pyramid for Heart Chakra",
    sku: "CRY-ROS-002",
    description: "Hand-polished Madagascar Rose Quartz pyramid. Dissolves emotional distress, nurtures unconditional love, and fosters family harmony.",
    brand: "Aura Crystals",
    price: 899,
    category: "Healing Crystals",
    weight: 220,
    material: "Natural Rose Quartz",
    dimensions: { length: 5, width: 5, height: 5, unit: "cm" },
    stock: 25,
    featured: false,
    popularity: 76,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Brass Vastu Tortoise with Glass Plate",
    sku: "VAS-TOR-001",
    description: "Polished brass Vastu tortoise designed with numeric yantra on its shell, paired with decorative water plate. Placed in North or East to bless the household with longevity and career success.",
    brand: "Vastu Harmony",
    price: 799,
    category: "Vastu & Feng Shui",
    weight: 320,
    material: "Brass & Glass",
    dimensions: { length: 14, width: 14, height: 4, unit: "cm" },
    stock: 30,
    featured: false,
    popularity: 82,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Nazar Battu / Evil Eye Traditional Wall Hanging",
    sku: "VAS-EE-002",
    description: "Traditional cast metal Mahakaal Nazar Battu face for home entrance. Protects dwellings from negative glances, jealousy, and bad omens.",
    brand: "Vastu Harmony",
    price: 499,
    category: "Vastu & Feng Shui",
    weight: 210,
    material: "Alloy Metal",
    dimensions: { length: 18, width: 12, height: 2, unit: "cm" },
    stock: 50,
    featured: false,
    popularity: 74,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  },
  {
    name: "Aakhand Brass Diya with Borosilicate Glass Chimney",
    sku: "PUJ-DIY-001",
    description: "Traditional pure brass oil lamp engineered with thermal-resistant glass cover for continuous burning during Navratri, Diwali, or daily home worship.",
    brand: "Vedic Living",
    price: 1199,
    category: "Puja Essentials",
    weight: 420,
    material: "Virgin Brass & Borosilicate Glass",
    dimensions: { length: 12, width: 12, height: 16, unit: "cm" },
    stock: 28,
    featured: true,
    popularity: 91,
    imageUrl: "/uploads/placeholders/product-placeholder.svg",
    images: ["/uploads/placeholders/product-placeholder.svg"],
    active: true
  }
];

async function seed(options = {}) {
  const shouldDisconnect = options.disconnect !== false;
  console.log("==========================================");
  console.log("   ASTROLOGY E-COMMERCE DATABASE SEEDER   ");
  console.log("==========================================\n");

  await connectDatabase();

  // 1. Seed Categories
  console.log("[1/6] Seeding Categories...");
  let catCreated = 0;
  for (const cat of CATEGORIES) {
    const existing = await Category.findOne({ name: cat.name });
    if (!existing) {
      await Category.create(cat);
      catCreated++;
    } else {
      await Category.updateOne({ _id: existing._id }, { $set: cat });
    }
  }
  console.log(`  ✓ Categories synced (${CATEGORIES.length} verified, ${catCreated} newly added)`);

  // 2. Seed Products
  console.log("[2/6] Seeding Products...");
  let prodCreated = 0;
  for (const prod of PRODUCTS) {
    const existing = await Product.findOne({ sku: prod.sku });
    if (!existing) {
      await Product.create(prod);
      prodCreated++;
    } else {
      await Product.updateOne({ _id: existing._id }, { $set: prod });
    }
  }
  console.log(`  ✓ Products synced (${PRODUCTS.length} verified, ${prodCreated} newly added)`);

  // Normalize any legacy products in database to ensure they use local placeholder images
  const normalizedCount = await Product.updateMany(
    {
      $or: [
        { imageUrl: { $exists: false } },
        { imageUrl: null },
        { imageUrl: "" },
        { imageUrl: { $not: { $regex: "^/uploads/placeholders/" } } }
      ]
    },
    {
      $set: {
        imageUrl: "/uploads/placeholders/product-placeholder.svg",
        images: ["/uploads/placeholders/product-placeholder.svg"]
      }
    }
  );
  if (normalizedCount.modifiedCount > 0) {
    console.log(`  ✓ Normalized ${normalizedCount.modifiedCount} legacy product image paths to local placeholder`);
  }

  // 3. Seed Shipping Settings
  console.log("[3/6] Seeding Shipping Settings...");
  await ShippingSetting.findOneAndUpdate(
    { name: "default" },
    {
      charge: 80,
      freeShippingMinimum: 999,
      estimatedDaysMin: 3,
      estimatedDaysMax: 7,
      defaultReturnDays: 7,
      returnPolicyActive: true,
      active: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log("  ✓ Standard shipping settings configured");

  // 4. Seed Pickup Location
  console.log("[4/6] Seeding Pickup Location...");
  await PickupLocation.findOneAndUpdate(
    { name: "Main Astrology Warehouse" },
    {
      contactName: "Vedic Fulfillment Operations",
      phone: "+919876543210",
      address: "Plot 42, Celestial Logistics Park, Andheri East",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400069",
      country: "India",
      isDefault: true,
      active: true
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log("  ✓ Default warehouse pickup location configured");

  // 5. Seed Promotional Coupons
  console.log("[5/6] Seeding Coupons...");
  const coupons = [
    {
      code: "ASTRO10",
      discountType: "percentage",
      discountValue: 10,
      maximumDiscount: 250,
      minimumOrderValue: 500,
      usageLimit: 1000,
      active: true
    },
    {
      code: "WELCOME50",
      discountType: "fixed",
      discountValue: 50,
      minimumOrderValue: 299,
      usageLimit: 500,
      active: true
    }
  ];
  for (const c of coupons) {
    await Coupon.findOneAndUpdate(
      { code: c.code },
      { $set: c },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log("  ✓ Standard promotional coupons configured");

  // 6. Ensure Admin User
  console.log("[6/6] Ensuring Admin Account...");
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_MOBILE, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.findOneAndUpdate(
      { email: ADMIN_EMAIL.toLowerCase() },
      {
        name: ADMIN_NAME || "Astro Admin",
        email: ADMIN_EMAIL.toLowerCase(),
        mobile: ADMIN_MOBILE || "+919876543210",
        password: passwordHash,
        role: "admin",
        active: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`  ✓ Admin user verified: ${ADMIN_EMAIL}`);
  }

  // 7. Seed Authentic Orders for Analytics & Reports
  const Order = require("../models/Order");
  const orderCount = await Order.countDocuments();
  if (orderCount === 0) {
    console.log("[7/7] Seeding Authentic Orders for Analytics...");
    const products = await Product.find({ active: true }).lean();
    if (products.length > 0) {
      const customers = [
        { name: "Ramesh Sharma", email: "ramesh@vedicstore.com", mobile: "+919876543211", city: "Mumbai", state: "Maharashtra", pin: "400001" },
        { name: "Priya Patel", email: "priya@vedicstore.com", mobile: "+919876543212", city: "Ahmedabad", state: "Gujarat", pin: "380015" },
        { name: "Ananya Iyer", email: "ananya@vedicstore.com", mobile: "+919876543213", city: "Bengaluru", state: "Karnataka", pin: "560001" },
        { name: "Rajesh Verma", email: "rajesh@vedicstore.com", mobile: "+919876543214", city: "New Delhi", state: "Delhi", pin: "110001" },
        { name: "Vikram Malhotra", email: "vikram@vedicstore.com", mobile: "+919876543215", city: "Jaipur", state: "Rajasthan", pin: "302001" }
      ];

      const userDocs = [];
      const defaultPassword = await bcrypt.hash("Devotee@12345", 10);
      for (const c of customers) {
        const u = await User.findOneAndUpdate(
          { email: c.email },
          { name: c.name, email: c.email, mobile: c.mobile, password: defaultPassword, role: "customer", active: true },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        userDocs.push({ user: u, ...c });
      }

      // Generate realistic daily order distribution over the past 14 days (up to 2026-10-10)
      const now = new Date();
      let orderSeq = 101;
      const ordersToInsert = [];

      for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
        const orderDate = new Date(now);
        orderDate.setDate(orderDate.getDate() - dayOffset);
        
        // Number of orders for this day (10 to 18 orders per day)
        const dailyCount = 10 + Math.floor((dayOffset * 3 + (dayOffset % 4) * 2) % 9);

        for (let i = 0; i < dailyCount; i++) {
          const cust = userDocs[(orderSeq + i) % userDocs.length];
          const prod1 = products[(orderSeq + i) % products.length];
          const prod2 = products[(orderSeq + i + 2) % products.length];

          const hasTwoItems = (orderSeq + i) % 3 === 0;
          const items = [
            {
              product: prod1._id,
              name: prod1.name,
              quantity: 1,
              price: prod1.price,
              image: prod1.imageUrl || "/uploads/placeholders/product-placeholder.svg"
            }
          ];
          if (hasTwoItems) {
            items.push({
              product: prod2._id,
              name: prod2.name,
              quantity: 1,
              price: prod2.price,
              image: prod2.imageUrl || "/uploads/placeholders/product-placeholder.svg"
            });
          }

          const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
          const shippingFee = subtotal >= 999 ? 0 : 80;
          const total = subtotal + shippingFee;

          // Determine status based on age of order
          let status = "delivered";
          let paymentStatus = "paid";
          let deliveredAt = null;
          let shippedAt = null;
          let cancelledAt = null;
          const trackingEvents = [
            { status: "placed", description: "Order placed successfully by devotee", occurredAt: new Date(orderDate.getTime()) }
          ];

          if (dayOffset === 0) {
            // Today's orders: mix of placed, processing, and shipped
            if (i % 5 === 0) {
              status = "placed";
              paymentStatus = "paid";
            } else if (i % 5 === 1) {
              status = "processing";
              paymentStatus = "paid";
              trackingEvents.push({ status: "processing", description: "Items consecrated and being prepared", occurredAt: new Date(orderDate.getTime() + 1800000) });
            } else if (i % 5 === 2) {
              status = "shipped";
              paymentStatus = "paid";
              shippedAt = new Date(orderDate.getTime() + 3600000);
              trackingEvents.push({ status: "shipped", description: "Dispatched via Bluedart Express", occurredAt: shippedAt });
            } else if (i % 5 === 3) {
              status = "delivered";
              paymentStatus = "paid";
              shippedAt = new Date(orderDate.getTime() + 1800000);
              deliveredAt = new Date(orderDate.getTime() + 7200000);
              trackingEvents.push({ status: "shipped", description: "Dispatched", occurredAt: shippedAt });
              trackingEvents.push({ status: "delivered", description: "Delivered to devotee", occurredAt: deliveredAt });
            } else {
              status = "cancelled";
              paymentStatus = "refunded";
              cancelledAt = new Date(orderDate.getTime() + 1800000);
              trackingEvents.push({ status: "cancelled", description: "Cancelled by customer before dispatch", occurredAt: cancelledAt });
            }
          } else if (dayOffset === 1) {
            // Yesterday's orders: mostly shipped or delivered
            if (i % 6 === 0) {
              status = "cancelled";
              paymentStatus = "refunded";
              cancelledAt = new Date(orderDate.getTime() + 3600000);
              trackingEvents.push({ status: "cancelled", description: "Cancelled by customer", occurredAt: cancelledAt });
            } else if (i % 3 === 0) {
              status = "shipped";
              paymentStatus = "paid";
              shippedAt = new Date(orderDate.getTime() + 14400000);
              trackingEvents.push({ status: "shipped", description: "Dispatched via Delhivery Express", occurredAt: shippedAt });
            } else {
              status = "delivered";
              paymentStatus = "paid";
              shippedAt = new Date(orderDate.getTime() + 7200000);
              deliveredAt = new Date(orderDate.getTime() + 43200000);
              trackingEvents.push({ status: "shipped", description: "Dispatched", occurredAt: shippedAt });
              trackingEvents.push({ status: "delivered", description: "Delivered successfully", occurredAt: deliveredAt });
            }
          } else {
            // Past days: high delivery rate with occasional cancellation
            if (i % 12 === 0) {
              status = "cancelled";
              paymentStatus = "refunded";
              cancelledAt = new Date(orderDate.getTime() + 7200000);
              trackingEvents.push({ status: "cancelled", description: "Order cancelled by devotee", occurredAt: cancelledAt });
            } else if (dayOffset <= 3 && i % 4 === 0) {
              status = "shipped";
              paymentStatus = "paid";
              shippedAt = new Date(orderDate.getTime() + 28800000);
              trackingEvents.push({ status: "shipped", description: "Dispatched in transit", occurredAt: shippedAt });
            } else {
              status = "delivered";
              paymentStatus = "paid";
              shippedAt = new Date(orderDate.getTime() + 14400000);
              deliveredAt = new Date(orderDate.getTime() + 86400000 * 2);
              trackingEvents.push({ status: "shipped", description: "Dispatched", occurredAt: shippedAt });
              trackingEvents.push({ status: "delivered", description: "Delivered to devotee address", occurredAt: deliveredAt });
            }
          }

          const y = orderDate.getFullYear();
          const m = String(orderDate.getMonth() + 1).padStart(2, "0");
          const orderNum = `ORD ${y}/${m}/${String(orderSeq).padStart(3, "0")}`;

          ordersToInsert.push({
            user: cust.user._id,
            orderNumber: orderNum,
            items,
            subtotal,
            shippingFee,
            total,
            shippingAddress: {
              fullName: cust.name,
              mobile: cust.mobile,
              email: cust.email,
              address: `House #${10 + (orderSeq % 50)}, Sacred Sanctuary Marg`,
              city: cust.city,
              state: cust.state,
              postalCode: cust.pin,
              country: "India"
            },
            status,
            paymentStatus,
            paymentMethod: (orderSeq % 2 === 0) ? "Razorpay" : "UPI",
            trackingEvents,
            courierName: (orderSeq % 2 === 0) ? "BlueDart Express" : "Delhivery",
            trackingId: `AWB${y}${m}${10000 + orderSeq}`,
            shipment: shippedAt ? {
              provider: "Delhivery",
              shippedAt,
              awb: `AWB${y}${m}${10000 + orderSeq}`
            } : {},
            deliveredAt,
            stockReleasedAt: cancelledAt,
            createdAt: orderDate,
            updatedAt: deliveredAt || shippedAt || cancelledAt || orderDate
          });

          orderSeq++;
        }
      }

      await Order.insertMany(ordersToInsert);
      console.log(`  ✓ Seeded ${ordersToInsert.length} authentic orders across past 14 days for date-wise analytics`);
    }
  }

  console.log("\n==========================================");
  console.log("   DATABASE SEEDING COMPLETED SUCCESSFULLY");
  console.log("==========================================");

  if (shouldDisconnect) {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  seed().catch(async (err) => {
    console.error("Seeding failed:", err.message);
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  });
}

module.exports = seed;
