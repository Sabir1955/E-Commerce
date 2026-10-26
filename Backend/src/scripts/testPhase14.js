/**
 * Phase 14 Verification Suite: Performance Optimization & Caching
 * Covers: In-memory Cache Service, HTTP Caching, ETags, 304 Not Modified,
 * Invalidation on Mutation, No-Cache Security, Gzip Compression, and Frontend Preconnection.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { CacheService, cacheService } = require("../services/cache.service");
const {
  cacheMiddleware,
  noCacheMiddleware,
  invalidateCache,
  compressionMiddleware,
  generateETag
} = require("../middleware/cache.middleware");

function runTests() {
  console.log("==========================================");
  console.log("Running Phase 14 Performance & Caching Tests");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  // Test 1: In-Memory Cache TTL & Expiration
  try {
    const testCache = new CacheService(100);
    testCache.set("test:key1", { data: "cosmic-energy" }, 1); // 1 second TTL

    const immediate = testCache.get("test:key1");
    if (!immediate || immediate.data !== "cosmic-energy") {
      throw new Error("Failed to retrieve cached item immediately after set");
    }

    // Force expire
    testCache.store.get("test:key1").expiresAt = Date.now() - 1000;
    const expired = testCache.get("test:key1");
    if (expired !== null) {
      throw new Error("Expired item was returned from cache");
    }

    console.log("  ✓ [PASS] 1. In-memory cache stores items and enforces TTL expiration");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 1. Cache TTL & expiration:", e.message);
    failed++;
  }

  // Test 2: Prefix-based Invalidation
  try {
    const testCache = new CacheService(100);
    testCache.set("products:1", { name: "Navgraha Yantra" }, 300);
    testCache.set("products:2", { name: "Rudraksha" }, 300);
    testCache.set("categories:all", [{ name: "Yantras" }], 300);
    testCache.set("shipping:default", { charge: 50 }, 300);

    const invalidatedCount = testCache.invalidatePrefix("products:");
    if (invalidatedCount !== 2) {
      throw new Error(`Expected 2 items invalidated, got ${invalidatedCount}`);
    }

    if (testCache.get("products:1") !== null || testCache.get("products:2") !== null) {
      throw new Error("Products were not removed upon prefix invalidation");
    }

    if (testCache.get("categories:all") === null || testCache.get("shipping:default") === null) {
      throw new Error("Unrelated caches were unintentionally invalidated");
    }

    console.log("  ✓ [PASS] 2. Prefix-based cache invalidation selectively purges targeted keys");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 2. Prefix invalidation:", e.message);
    failed++;
  }

  // Test 3: Cache Metrics & Hit Ratio Tracking
  try {
    const testCache = new CacheService(100);
    testCache.set("metric:key", "value", 60);

    testCache.get("metric:key"); // HIT 1
    testCache.get("metric:key"); // HIT 2
    testCache.get("metric:missing"); // MISS 1

    const stats = testCache.getStats();
    if (stats.hits !== 2 || stats.misses !== 1 || stats.hitRatio < 0.6 || stats.hitRatio > 0.7) {
      throw new Error(`Unexpected cache stats: ${JSON.stringify(stats)}`);
    }

    console.log("  ✓ [PASS] 3. Cache metrics engine accurately monitors hits, misses, and hit ratio");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 3. Cache metrics tracking:", e.message);
    failed++;
  }

  // Test 4: HTTP Cache Middleware - MISS then HIT Flow
  try {
    cacheService.flush();
    const middleware = cacheMiddleware(180, "test-api");

    let statusCalled = null;
    let headers = {};
    let responseBody = null;

    const req1 = { method: "GET", baseUrl: "/api/products", path: "/featured", originalUrl: "/api/products/featured", headers: {} };
    const res1 = {
      statusCode: 200,
      setHeader: (k, v) => { headers[k] = v; },
      json: (body) => { responseBody = body; return body; }
    };

    middleware(req1, res1, () => {
      // simulate route controller execution
      res1.json({ products: [{ name: "Yantra" }] });
    });

    if (headers["X-Cache"] !== "MISS" || !headers["ETag"] || !headers["Cache-Control"].includes("max-age=180")) {
      throw new Error("First request should result in X-Cache: MISS with ETag and Cache-Control headers");
    }

    // Second request: Should be HIT
    let hitHeaders = {};
    let hitBody = null;
    const req2 = { method: "GET", baseUrl: "/api/products", path: "/featured", originalUrl: "/api/products/featured", headers: {} };
    const res2 = {
      statusCode: 200,
      setHeader: (k, v) => { hitHeaders[k] = v; },
      json: (body) => { hitBody = body; return body; }
    };

    let nextCalled = false;
    middleware(req2, res2, () => { nextCalled = true; });

    if (hitHeaders["X-Cache"] !== "HIT" || nextCalled || !hitBody) {
      throw new Error("Second request should return cached response with X-Cache: HIT without calling next()");
    }

    console.log("  ✓ [PASS] 4. HTTP Cache Middleware generates cache MISS and serves subsequent cache HIT");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 4. Cache MISS/HIT flow:", e.message);
    failed++;
  }

  // Test 5: Conditional HTTP 304 (Not Modified) Handling
  try {
    const middleware = cacheMiddleware(180, "test-304");
    const testData = { categories: ["Rudraksha", "Yantras"] };
    const etag = generateETag(testData);

    cacheService.set("test-304:/api/categories", testData, 300);

    const req = {
      method: "GET",
      baseUrl: "/api/categories",
      path: "/",
      originalUrl: "/api/categories",
      headers: { "if-none-match": etag }
    };

    let statusCode = null;
    let endCalled = false;
    let headers = {};

    const res = {
      setHeader: (k, v) => { headers[k] = v; },
      status: (code) => {
        statusCode = code;
        return {
          end: () => { endCalled = true; }
        };
      }
    };

    middleware(req, res, () => {});

    if (statusCode !== 304 || !endCalled || headers["X-Cache"] !== "HIT") {
      throw new Error(`Expected HTTP 304 Not Modified, got status ${statusCode}`);
    }

    console.log("  ✓ [PASS] 5. Conditional request with matching If-None-Match ETag returns HTTP 304 Not Modified");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 5. HTTP 304 conditional request:", e.message);
    failed++;
  }

  // Test 6: Mutation-triggered Cache Invalidation Helper
  try {
    cacheService.set("products:featured", { list: [] }, 300);
    cacheService.set("categories:list", { list: [] }, 300);

    const count = invalidateCache(["products", "categories"]);
    if (count !== 2) {
      throw new Error(`Expected 2 items invalidated, got ${count}`);
    }

    if (cacheService.get("products:featured") !== null || cacheService.get("categories:list") !== null) {
      throw new Error("Invalidated caches remained in memory");
    }

    console.log("  ✓ [PASS] 6. invalidateCache helper cleanly purges product and category caches across routes");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 6. Mutation invalidation helper:", e.message);
    failed++;
  }

  // Test 7: Strict No-Cache Middleware on Private Routes
  try {
    let headers = {};
    const req = {};
    const res = {
      setHeader: (k, v) => { headers[k] = v; }
    };
    let nextCalled = false;

    noCacheMiddleware(req, res, () => { nextCalled = true; });

    if (!headers["Cache-Control"] || !headers["Cache-Control"].includes("no-store") || !headers["Pragma"] || headers["Expires"] !== "0" || !nextCalled) {
      throw new Error("noCacheMiddleware did not apply required no-store/no-cache headers");
    }

    console.log("  ✓ [PASS] 7. Strict no-cache headers enforced for authenticated and private endpoints");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 7. No-cache security headers:", e.message);
    failed++;
  }

  // Test 8: Native Gzip Response Compression Middleware
  try {
    let headers = {};
    let sentBuffer = null;
    const largeObject = { items: Array.from({ length: 150 }, (_, i) => ({ id: i, name: `Sacred Vedic Gemstone ${i}`, desc: "Consecrated planetary item" })) };
    const rawJson = JSON.stringify(largeObject);

    const req = { headers: { "accept-encoding": "gzip, deflate" } };
    const res = {
      headersSent: false,
      setHeader: (k, v) => { headers[k] = v; },
      send: (body) => { sentBuffer = body; return body; }
    };

    compressionMiddleware(req, res, () => {});

    // Simulate sending large JSON body
    res.send(rawJson);

    if (headers["Content-Encoding"] !== "gzip" || !Buffer.isBuffer(sentBuffer)) {
      throw new Error("Large response was not compressed with Content-Encoding: gzip");
    }

    // Verify decompression yields original content
    const unzipped = zlib.gunzipSync(sentBuffer).toString("utf8");
    if (unzipped !== rawJson) {
      throw new Error("Decompressed payload does not match original JSON content");
    }

    const compressionRatio = Math.round((1 - (sentBuffer.length / rawJson.length)) * 100);
    console.log(`  ✓ [PASS] 8. Native Gzip compression middleware achieved ${compressionRatio}% payload reduction (${rawJson.length}B -> ${sentBuffer.length}B)`);
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 8. Gzip compression middleware:", e.message);
    failed++;
  }

  // Test 9: Memory Bounded Cache Eviction (FIFO Safety)
  try {
    const smallCache = new CacheService(3);
    smallCache.set("key1", 1, 60);
    smallCache.set("key2", 2, 60);
    smallCache.set("key3", 3, 60);
    smallCache.set("key4", 4, 60); // Should evict key1

    if (smallCache.store.size > 3) {
      throw new Error(`Cache exceeded max bounded limit: size ${smallCache.store.size}`);
    }

    if (smallCache.get("key1") !== null) {
      throw new Error("Oldest key was not evicted when cache capacity was reached");
    }

    console.log("  ✓ [PASS] 9. Bounded cache capacity protects against memory leaks via FIFO eviction");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 9. Bounded cache eviction:", e.message);
    failed++;
  }

  // Test 10: Frontend Resource Preconnection & SEO Optimization
  try {
    const indexPath = path.resolve(__dirname, "../../../Frontend/src/index.html");
    const indexHtml = fs.readFileSync(indexPath, "utf8");

    const hasFontsPreconnect = indexHtml.includes("https://fonts.googleapis.com") && indexHtml.includes("https://fonts.gstatic.com");
    const hasCrossorigin = indexHtml.includes("crossorigin");
    const hasDescription = indexHtml.includes("<meta name=\"description\"");
    const hasJyotishTitle = indexHtml.includes("Jyotish");

    if (hasFontsPreconnect && hasCrossorigin && hasDescription && hasJyotishTitle) {
      console.log("  ✓ [PASS] 10. Frontend index.html features early font preconnection, SEO description, and brand title");
      passed++;
    } else {
      throw new Error("Missing font preconnect links or meta description in Frontend index.html");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 10. Frontend resource preconnection:", e.message);
    failed++;
  }

  // Test 11: Sub-Millisecond Cache Performance Benchmark
  try {
    const testCache = new CacheService(500);
    for (let i = 0; i < 100; i++) {
      testCache.set(`bench:${i}`, { id: i, data: "vedic-remedy" }, 120);
    }

    const start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) {
      testCache.get(`bench:${i % 100}`);
    }
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const avgPerReadMs = durationMs / 1000;

    if (avgPerReadMs > 0.1) {
      throw new Error(`Cache read too slow: ${avgPerReadMs}ms per read`);
    }

    console.log(`  ✓ [PASS] 11. Performance benchmark: 1,000 in-memory cache lookups executed in ${durationMs.toFixed(2)}ms (~${(avgPerReadMs * 1000).toFixed(2)}µs per lookup)`);
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 11. Performance benchmark:", e.message);
    failed++;
  }

  // Test 12: Route Mounting & Invalidation Integration Verification
  try {
    const appJs = fs.readFileSync(path.resolve(__dirname, "../app.js"), "utf8");
    const routesIndexJs = fs.readFileSync(path.resolve(__dirname, "../routes/index.js"), "utf8");
    const productsRoutesJs = fs.readFileSync(path.resolve(__dirname, "../modules/products/products.routes.js"), "utf8");
    const categoriesRoutesJs = fs.readFileSync(path.resolve(__dirname, "../modules/categories/categories.routes.js"), "utf8");

    const hasCompressionInApp = appJs.includes("compressionMiddleware");
    const hasNoCacheInRoutes = routesIndexJs.includes("noCacheMiddleware");
    const hasProductCaching = productsRoutesJs.includes("cacheMiddleware") && productsRoutesJs.includes("invalidateCache");
    const hasCategoryCaching = categoriesRoutesJs.includes("cacheMiddleware") && categoriesRoutesJs.includes("invalidateCache");

    if (hasCompressionInApp && hasNoCacheInRoutes && hasProductCaching && hasCategoryCaching) {
      console.log("  ✓ [PASS] 12. Full architectural integration: compression, no-cache, and cache invalidation active across all routes");
      passed++;
    } else {
      throw new Error("Missing middleware integration in app.js or route files");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 12. Route mounting integration:", e.message);
    failed++;
  }

  console.log("\n==========================================");
  console.log(`Phase 14 Tests Complete: ${passed} Passed, ${failed} Failed`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
