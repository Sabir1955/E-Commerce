const app = require("../app");
const http = require("http");

async function testPhase1() {
  console.log("==========================================");
  console.log("Running Phase 1 Architecture Verification");
  console.log("==========================================\n");

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

  // 1. Health check
  await check("GET /api/health returns 200 OK", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    if (res.status !== 200) throw new Error(`Status was ${res.status}`);
    const body = await res.json();
    if (body.status !== "ok") throw new Error(`Expected body.status to be 'ok', got ${body.status}`);
  });

  // 2. Swagger docs
  await check("GET /api-docs.json returns valid OpenAPI 3.0 spec", async () => {
    const res = await fetch(`${baseUrl}/api-docs.json`);
    if (res.status !== 200) throw new Error(`Status was ${res.status}`);
    const spec = await res.json();
    if (!spec.openapi) throw new Error("Missing openapi property");
    if (!spec.paths["/api/cart"]) throw new Error("Missing /api/cart in paths");
    if (!spec.paths["/api/products/featured"]) throw new Error("Missing /api/products/featured in paths");
    if (!spec.paths["/api/products/latest"]) throw new Error("Missing /api/products/latest in paths");
    if (!spec.paths["/api/shipping-settings"]) throw new Error("Missing /api/shipping-settings in paths");
  });

  // 3. Cart Auth Protection
  await check("GET /api/cart requires authentication (returns 401)", async () => {
    const res = await fetch(`${baseUrl}/api/cart`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    const body = await res.json();
    if (body.success !== false) throw new Error("Expected body.success to be false");
  });

  // 4. Products public route access
  await check("GET /api/products route exists and handles query (returns 200 or 500 without db)", async () => {
    const res = await fetch(`${baseUrl}/api/products`);
    // Without DB connection it might throw DB error or return 200, but route must be matched (not 404)
    if (res.status === 404) throw new Error("Route /api/products returned 404 Not Found");
  });

  // 5. 404 Handler
  await check("GET /api/nonexistent-route returns 404 API envelope", async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent-route`);
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    const body = await res.json();
    if (body.success !== false) throw new Error("Expected body.success to be false");
  });

  server.close();

  console.log(`\n==========================================`);
  console.log(`Phase 1 Tests Completed: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  if (failed > 0) process.exit(1);
}

testPhase1().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
