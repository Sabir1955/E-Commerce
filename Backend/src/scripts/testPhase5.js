require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const app = require("../app");
const { connectDatabase } = require("../config/database");
const User = require("../models/User");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Coupon = require("../models/Coupon");

async function testPhase5() {
  console.log("==========================================");
  console.log("Running Phase 5 Shopping Cart & Checkout Tests");
  console.log("==========================================\n");

  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

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

  let customerToken = "";
  let customerUser = null;
  let sampleProduct = null;
  let sampleProduct2 = null;

  try {
    // 0. Setup a customer user for authenticated cart & checkout actions
    const timestamp = Date.now();
    const testEmail = `cart_tester_${timestamp}@example.com`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cart Tester",
        email: testEmail,
        mobile: `+9197${String(timestamp).slice(-8)}`,
        password: "Password@123",
        confirmPassword: "Password@123"
      })
    });
    const regData = await regRes.json();
    customerToken = regData.token;
    customerUser = regData.user;

    // Fetch sample products with adequate stock
    const products = await Product.find({ active: true, stock: { $gte: 10 } }).limit(2);
    if (products.length < 2) {
      throw new Error("Need at least 2 active products with stock >= 10 to run tests");
    }
    sampleProduct = products[0];
    sampleProduct2 = products[1];

    // Ensure test coupon exists
    await Coupon.findOneAndUpdate(
      { code: "TESTPHASE5" },
      {
        code: "TESTPHASE5",
        discountType: "percentage",
        discountValue: 10,
        minimumOrderValue: 200,
        maximumDiscount: 500,
        active: true
      },
      { upsert: true, new: true }
    );

    // 1. GET /api/cart unauthenticated rejects with 401
    await check("1. GET /api/cart unauthenticated rejects with 401", async () => {
      const res = await fetch(`${baseUrl}/api/cart`);
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    // 2. GET /api/cart authenticated returns empty cart structure
    await check("2. GET /api/cart authenticated returns initial empty cart", async () => {
      const res = await fetch(`${baseUrl}/api/cart`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const cart = body.data?.cart || body.data;
      if (!cart || !Array.isArray(cart.items) || cart.items.length !== 0) {
        throw new Error("Expected cart.items to be an empty array");
      }
      if (cart.subtotal !== 0 || cart.itemCount !== 0 || cart.totalQuantity !== 0) {
        throw new Error(`Expected 0 totals, got subtotal=${cart.subtotal}, count=${cart.itemCount}`);
      }
    });

    // 3. POST /api/cart/items adds an item and returns enriched metadata & computed totals
    await check("3. POST /api/cart/items adds an item with calculated totals", async () => {
      const res = await fetch(`${baseUrl}/api/cart/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          productId: sampleProduct._id.toString(),
          quantity: 2
        })
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      const body = await res.json();
      const cart = body.data?.cart || body.data;
      if (!cart || cart.items.length !== 1) {
        throw new Error(`Expected 1 item in cart, got ${cart?.items?.length}`);
      }
      const item = cart.items[0];
      const expectedSubtotal = Math.round(sampleProduct.price * 2 * 100) / 100;
      if (cart.subtotal !== expectedSubtotal) {
        throw new Error(`Expected subtotal ${expectedSubtotal}, got ${cart.subtotal}`);
      }
      if (cart.totalQuantity !== 2 || cart.itemCount !== 1) {
        throw new Error(`Expected totalQuantity=2, itemCount=1; got ${cart.totalQuantity}, ${cart.itemCount}`);
      }
      if (item.itemSubtotal !== expectedSubtotal || !item.inStock) {
        throw new Error(`Item metadata mismatch: itemSubtotal=${item.itemSubtotal}, inStock=${item.inStock}`);
      }
    });

    // 4. POST /api/cart/items increments quantity when re-adding same product
    await check("4. POST /api/cart/items increments quantity for existing item", async () => {
      const res = await fetch(`${baseUrl}/api/cart/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          product: sampleProduct._id.toString(),
          quantity: 1
        })
      });
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      const body = await res.json();
      const cart = body.data?.cart || body.data;
      const item = cart.items[0];
      if (item.quantity !== 3) {
        throw new Error(`Expected quantity 3, got ${item.quantity}`);
      }
      const expectedSubtotal = Math.round(sampleProduct.price * 3 * 100) / 100;
      if (cart.subtotal !== expectedSubtotal || cart.totalQuantity !== 3) {
        throw new Error(`Totals mismatch: subtotal=${cart.subtotal}, totalQuantity=${cart.totalQuantity}`);
      }
    });

    // 5. POST /api/cart/items rejects quantity exceeding available stock
    await check("5. POST /api/cart/items rejects quantity exceeding stock with 400", async () => {
      const res = await fetch(`${baseUrl}/api/cart/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          productId: sampleProduct._id.toString(),
          quantity: sampleProduct.stock + 10
        })
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      const body = await res.json();
      if (!body.message || !body.message.toLowerCase().includes("exceeds available stock")) {
        throw new Error(`Unexpected message: ${body.message}`);
      }
    });

    // 6. POST /api/cart/items rejects invalid/negative quantities
    await check("6. POST /api/cart/items rejects invalid quantities with 400", async () => {
      const res = await fetch(`${baseUrl}/api/cart/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          productId: sampleProduct._id.toString(),
          quantity: -2
        })
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    // 7. PATCH /api/cart/items/:productId updates quantity
    await check("7. PATCH /api/cart/items/:productId updates item quantity", async () => {
      const res = await fetch(`${baseUrl}/api/cart/items/${sampleProduct._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({ quantity: 2 })
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const cart = body.data?.cart || body.data;
      const item = cart.items[0];
      if (item.quantity !== 2) throw new Error(`Expected quantity 2, got ${item.quantity}`);
      if (cart.totalQuantity !== 2) throw new Error(`Expected totalQuantity 2, got ${cart.totalQuantity}`);
    });

    // 8. PATCH /api/cart/items/:productId rejects quantity exceeding stock
    await check("8. PATCH /api/cart/items/:productId rejects stock overflow with 400", async () => {
      const res = await fetch(`${baseUrl}/api/cart/items/${sampleProduct._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({ quantity: sampleProduct.stock + 100 })
      });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    // 9. POST /api/coupons/apply validates discounts and thresholds
    await check("9. POST /api/coupons/apply validates minimums and calculates discounts", async () => {
      // 9a: Empty coupon code
      const emptyRes = await fetch(`${baseUrl}/api/coupons/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "", subtotal: 500 })
      });
      if (emptyRes.status !== 400) throw new Error(`Expected 400 for empty code, got ${emptyRes.status}`);

      // 9b: Below minimum order value
      const minRes = await fetch(`${baseUrl}/api/coupons/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "TESTPHASE5", subtotal: 100 })
      });
      if (minRes.status !== 400) throw new Error(`Expected 400 for below min order value, got ${minRes.status}`);

      // 9c: Valid coupon application
      const validRes = await fetch(`${baseUrl}/api/coupons/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "TESTPHASE5", subtotal: 1000 })
      });
      if (validRes.status !== 200) throw new Error(`Expected 200 for valid coupon, got ${validRes.status}`);
      const validBody = await validRes.json();
      if (!validBody.success || validBody.coupon.discountAmount !== 100 || validBody.coupon.finalSubtotal !== 900) {
        throw new Error(`Discount calculation mismatch: ${JSON.stringify(validBody.coupon)}`);
      }
    });

    // 10. POST /api/orders creates order, decrements stock, and empties cart
    await check("10. POST /api/orders checkout decrements stock and empties cart", async () => {
      // Record initial stock
      const productBefore = await Product.findById(sampleProduct._id);
      const stockBefore = productBefore.stock;

      // Ensure 2 items of sampleProduct are in cart
      await fetch(`${baseUrl}/api/cart/items/${sampleProduct._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({ quantity: 2 })
      });

      const orderPayload = {
        shippingAddress: {
          fullName: "Cart Tester",
          mobile: "+919876543210",
          address: "108 Astro Marg",
          city: "Varanasi",
          state: "Uttar Pradesh",
          postalCode: "221001",
          country: "India"
        },
        paymentMethod: "cod",
        couponCode: "TESTPHASE5"
      };

      const orderRes = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify(orderPayload)
      });

      if (orderRes.status !== 201) {
        const errorText = await orderRes.text();
        throw new Error(`Expected 201 Order Created, got ${orderRes.status}: ${errorText}`);
      }

      const orderBody = await orderRes.json();
      const order = orderBody.data?.order || orderBody.order || orderBody.data;
      if (!order || order.status !== "placed" || order.paymentStatus !== "pending") {
        throw new Error(`Order state invalid: ${JSON.stringify(order)}`);
      }
      if (order.items.length !== 1 || order.items[0].quantity !== 2) {
        throw new Error(`Order items mismatch: ${JSON.stringify(order.items)}`);
      }
      if (order.discountAmount <= 0) {
        throw new Error(`Expected discount applied to order, got ${order.discountAmount}`);
      }

      // Check stock decremented
      const productAfter = await Product.findById(sampleProduct._id);
      if (productAfter.stock !== stockBefore - 2) {
        throw new Error(`Stock not decremented properly! Before=${stockBefore}, After=${productAfter.stock}`);
      }

      // Verify customer cart is automatically emptied
      const cartRes = await fetch(`${baseUrl}/api/cart`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      const cartBody = await cartRes.json();
      const cart = cartBody.data?.cart || cartBody.data;
      if (cart.items.length !== 0 || cart.totalQuantity !== 0 || cart.subtotal !== 0) {
        throw new Error(`Cart was not emptied after checkout! items=${cart.items.length}, totalQuantity=${cart.totalQuantity}`);
      }
    });

    // 11. DELETE /api/cart/items/:productId removes a specific item
    await check("11. DELETE /api/cart/items/:productId removes specific item", async () => {
      // Add two different products
      await fetch(`${baseUrl}/api/cart/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({ productId: sampleProduct._id.toString(), quantity: 1 })
      });
      await fetch(`${baseUrl}/api/cart/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({ productId: sampleProduct2._id.toString(), quantity: 2 })
      });

      // Remove product 1
      const delRes = await fetch(`${baseUrl}/api/cart/items/${sampleProduct._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (delRes.status !== 200) throw new Error(`Expected 200, got ${delRes.status}`);

      const body = await delRes.json();
      const cart = body.data?.cart || body.data;
      if (cart.items.length !== 1 || String(cart.items[0].product._id || cart.items[0].product) !== String(sampleProduct2._id)) {
        throw new Error("Expected only product 2 to remain in cart");
      }
    });

    // 12. DELETE /api/cart clears the entire cart
    await check("12. DELETE /api/cart clears the entire cart", async () => {
      const res = await fetch(`${baseUrl}/api/cart`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const cart = body.data?.cart || body.data;
      if (cart.items.length !== 0 || cart.subtotal !== 0 || cart.totalQuantity !== 0) {
        throw new Error("Expected empty cart after DELETE /api/cart");
      }
    });

  } finally {
    // Cleanup
    if (customerUser) {
      await User.deleteOne({ _id: customerUser._id });
      await Cart.deleteOne({ user: customerUser._id });
      await Order.deleteMany({ user: customerUser._id });
    }
    await Coupon.deleteOne({ code: "TESTPHASE5" });
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
  }

  console.log("\n==========================================");
  console.log(`Phase 5 Tests Complete: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  testPhase5().catch((err) => {
    console.error("Test runner failed:", err);
    process.exit(1);
  });
}

module.exports = { testPhase5 };
