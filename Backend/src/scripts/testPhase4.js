require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const app = require("../app");
const { connectDatabase } = require("../config/database");
const User = require("../models/User");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Review = require("../models/Review");
const Wishlist = require("../models/Wishlist");

async function testPhase4() {
  console.log("==========================================");
  console.log("Running Phase 4 Customer Storefront Tests");
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
  let customerId = "";
  let sampleProduct = null;
  let sampleCategory = null;

  try {
    // 0. Setup a customer user for authenticated storefront actions
    const timestamp = Date.now();
    const testEmail = `storefront_${timestamp}@example.com`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Storefront Tester",
        email: testEmail,
        mobile: `+9196${String(timestamp).slice(-8)}`,
        password: "Password@123",
        confirmPassword: "Password@123"
      })
    });
    const regData = await regRes.json();
    customerToken = regData.token;
    customerId = regData.user._id || regData.user.id;

    // 1. Categories List & Product Counts
    await check("1. GET /api/categories returns categories with productCount", async () => {
      const res = await fetch(`${baseUrl}/api/categories`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const categories = body.categories || body.data?.categories || (Array.isArray(body) ? body : body.data);
      if (!Array.isArray(categories) || categories.length === 0) {
        throw new Error("Expected non-empty categories array");
      }
      sampleCategory = categories[0];
      if (typeof sampleCategory.productCount !== "number") {
        throw new Error("Expected productCount property on category");
      }
    });

    // 2. Category by Slug
    await check("2. GET /api/categories/slug/:slug returns category details", async () => {
      const res = await fetch(`${baseUrl}/api/categories/slug/${sampleCategory.slug}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const cat = body.category || body.data || body;
      if (cat.slug !== sampleCategory.slug) throw new Error(`Expected slug ${sampleCategory.slug}, got ${cat.slug}`);
    });

    // 3. Products List & Pagination
    await check("3. GET /api/products returns paginated catalog", async () => {
      const res = await fetch(`${baseUrl}/api/products`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const products = body.products || body.data?.products;
      const pagination = body.pagination || body.data?.pagination;
      if (!Array.isArray(products) || products.length === 0) throw new Error("Expected products array");
      if (!pagination || typeof pagination.total !== "number") throw new Error("Missing pagination metadata");
      sampleProduct = products[0];
    });

    // 4. Products Search Query
    await check("4. GET /api/products?search=pukhraj returns matched product", async () => {
      const res = await fetch(`${baseUrl}/api/products?search=pukhraj`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const products = body.products || body.data?.products;
      if (!Array.isArray(products) || products.length === 0) throw new Error("Expected search result for 'pukhraj'");
      if (!products[0].name.toLowerCase().includes("pukhraj")) {
        throw new Error(`Expected 'pukhraj' in name, got: ${products[0].name}`);
      }
    });

    // 5. Products Category Slug Filter
    await check("5. GET /api/products?category=gemstones filters by category slug", async () => {
      const res = await fetch(`${baseUrl}/api/products?category=gemstones`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const products = body.products || body.data?.products;
      if (!Array.isArray(products) || products.length === 0) throw new Error("Expected gemstone products");
      for (const p of products) {
        if (p.category !== "Gemstones") throw new Error(`Expected category Gemstones, got ${p.category}`);
      }
    });

    // 6. Products Price Filter & Sort
    await check("6. GET /api/products?sort=price_asc orders products ascending", async () => {
      const res = await fetch(`${baseUrl}/api/products?sort=price_asc`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const products = body.products || body.data?.products;
      for (let i = 1; i < products.length; i++) {
        if (products[i].price < products[i - 1].price) {
          throw new Error(`Prices not ascending: ${products[i - 1].price} then ${products[i].price}`);
        }
      }
    });

    // 7. Featured Products
    await check("7. GET /api/products/featured returns featured items", async () => {
      const res = await fetch(`${baseUrl}/api/products/featured`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const products = body.products || body.data?.products;
      if (!Array.isArray(products) || products.length === 0) throw new Error("Expected featured products");
      for (const p of products) {
        if (!p.featured) throw new Error("Non-featured product returned from /featured endpoint");
      }
    });

    // 8. Product by Slug
    await check("8. GET /api/products/slug/:slug returns single product", async () => {
      const res = await fetch(`${baseUrl}/api/products/slug/${sampleProduct.slug}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const prod = body.product || body.data || body;
      if (prod.sku !== sampleProduct.sku) throw new Error(`Expected sku ${sampleProduct.sku}, got ${prod.sku}`);
    });

    // 9. Related Products
    await check("9. GET /api/products/:id/related returns matching category items", async () => {
      const res = await fetch(`${baseUrl}/api/products/${sampleProduct._id}/related`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const products = body.products || body.data?.products || (Array.isArray(body.data) ? body.data : []);
      if (!Array.isArray(products)) throw new Error("Expected array of related products");
      // All related items must share category and not be the sample product itself
      for (const p of products) {
        if (p._id === String(sampleProduct._id)) throw new Error("Related items should not include current product");
        if (p.category !== sampleProduct.category) throw new Error(`Expected category ${sampleProduct.category}`);
      }
    });

    // 10. Shipping Settings Storefront API
    await check("10. GET /api/shipping-settings returns active delivery fee config", async () => {
      const res = await fetch(`${baseUrl}/api/shipping-settings`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      const settings = body.shippingSettings || body.data || body;
      if (typeof settings.charge !== "number" || typeof settings.freeShippingMinimum !== "number") {
        throw new Error("Invalid shipping settings returned");
      }
    });

    // 11. Customer Reviews Submission & Retrieval
    await check("11. POST /api/reviews and GET /api/reviews/product/:id", async () => {
      const submitRes = await fetch(`${baseUrl}/api/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({
          product: sampleProduct._id,
          rating: 5,
          comment: "Authentic Vedic energized item. Excellent energy!"
        })
      });
      if (submitRes.status !== 201) throw new Error(`Review submit failed: ${submitRes.status}`);

      // Verify review can be retrieved (pending or approved)
      const listRes = await fetch(`${baseUrl}/api/reviews/product/${sampleProduct._id}`);
      if (listRes.status !== 200) throw new Error(`Review list failed: ${listRes.status}`);
    });

    // 12. Wishlist Management (Add, Get, Remove)
    await check("12. Wishlist Add, Get, and Remove operations", async () => {
      // Add
      const addRes = await fetch(`${baseUrl}/api/wishlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`
        },
        body: JSON.stringify({ productId: sampleProduct._id })
      });
      if (addRes.status !== 201) throw new Error(`Wishlist add failed: ${addRes.status}`);

      // Get
      const getRes = await fetch(`${baseUrl}/api/wishlist`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (getRes.status !== 200) throw new Error(`Wishlist get failed: ${getRes.status}`);
      const getData = await getRes.json();
      const wishlist = getData.wishlist || getData.data?.wishlist;
      if (!wishlist || !Array.isArray(wishlist.products) || wishlist.products.length === 0) {
        throw new Error("Product was not found in wishlist");
      }

      // Remove
      const delRes = await fetch(`${baseUrl}/api/wishlist/${sampleProduct._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      if (delRes.status !== 200) throw new Error(`Wishlist delete failed: ${delRes.status}`);
    });

  } finally {
    if (customerId) {
      await User.deleteOne({ _id: customerId }).catch(() => {});
      await Review.deleteMany({ user: customerId }).catch(() => {});
      await Wishlist.deleteOne({ user: customerId }).catch(() => {});
    }
    server.close();
    await mongoose.disconnect();
  }

  console.log(`\n==========================================`);
  console.log(`Phase 4 Tests Completed: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  if (failed > 0) process.exit(1);
}

testPhase4().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
