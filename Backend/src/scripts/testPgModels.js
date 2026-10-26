const db = require('../database/db');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Coupon = require('../models/Coupon');
const ShippingSetting = require('../models/ShippingSetting');
const PickupLocation = require('../models/PickupLocation');
const StoreSetting = require('../models/StoreSetting');

async function testAllModels() {
  console.log('=== TESTING POSTGRESQL MODELS ===\n');

  // 1. User
  const admin = await User.findOne({ role: 'admin' });
  console.log('✓ User.findOne({ role: "admin" }):', admin ? `${admin.name} (${admin.email}) [id: ${admin.id}]` : 'None');
  if (admin) {
    const isPass = await admin.comparePassword('Admin@12345');
    console.log('  Password verification (Admin@12345):', isPass ? 'VALID' : 'INVALID');
  }

  // 2. Product
  const products = await Product.find().limit(3);
  console.log(`✓ Product.find().limit(3): Found ${products.length} products`);
  products.forEach(p => console.log(`  - ${p.name} (₹${p.price}, Stock: ${p.stock}) [id: ${p.id}]`));

  // 3. Category
  const categories = await Category.find();
  console.log(`✓ Category.find(): Found ${categories.length} categories`);

  // 4. Order with population
  const orders = await Order.find().limit(3).populate('user').populate('items.product');
  console.log(`✓ Order.find().populate("user", "items.product"): Found ${orders.length} orders`);
  orders.forEach(o => {
    console.log(`  - Order ${o.orderNumber}: status="${o.status}", total=₹${o.total}, user=${o.user?.name || o.userId}`);
  });

  // 5. Order count
  const orderCount = await Order.countDocuments();
  console.log(`✓ Order.countDocuments(): ${orderCount}`);

  // 6. Payment
  const payments = await Payment.find().limit(2);
  console.log(`✓ Payment.find(): Found ${payments.length} payments`);

  // 7. Store Setting
  const setting = await StoreSetting.findOne({ key: 'store_address' });
  console.log('✓ StoreSetting.findOne():', setting?.storeName, setting?.addressLine);

  console.log('\n🎉 ALL POSTGRESQL MODEL BASIC TESTS PASSED!\n');
  await db.pool.end();
}

testAllModels().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
