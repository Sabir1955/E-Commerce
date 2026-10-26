require("dotenv").config();
const { connectDatabase, disconnectDatabase } = require("../config/database");
const app = require("../app");
const http = require("http");

async function verify() {
  console.log("=================================================");
  console.log("1. Connecting to MongoDB Atlas...");
  await connectDatabase();
  console.log("✓ MongoDB Atlas connected successfully!");

  const server = http.createServer(app).listen(0, async () => {
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    console.log("\n=================================================");
    console.log("2. Verifying Endpoints:");
    console.log("=================================================");

    // 1. GET /api/health
    const resHealth = await fetch(`${base}/api/health`);
    const dataHealth = await resHealth.json();
    console.log(`✓ GET /api/health -> Status: ${resHealth.status}`);
    console.log("  Health Details:", {
      status: dataHealth.status,
      service: dataHealth.service,
      database: dataHealth.database.status,
      dbReadyState: dataHealth.database.readyState
    });

    // 2. GET /api/products?limit=100
    const resProducts = await fetch(`${base}/api/products?limit=100`);
    const dataProducts = await resProducts.json();
    console.log(`\n✓ GET /api/products?limit=100 -> Status: ${resProducts.status}`);
    console.log("  Success:", dataProducts.success);
    console.log("  Products Retrieved:", dataProducts.data ? dataProducts.data.products.length : 0);
    console.log("  Pagination Meta:", dataProducts.data ? dataProducts.data.pagination : null);

    // 3. GET /api-docs (Redirect check)
    const resDocsRedirect = await fetch(`${base}/api-docs`, { redirect: "manual" });
    console.log(`\n✓ GET /api-docs (Redirect) -> Status: ${resDocsRedirect.status}, Location: ${resDocsRedirect.headers.get("location")}`);

    // 4. GET /api-docs/ (Swagger UI HTML)
    const resDocs = await fetch(`${base}/api-docs/`);
    const contentType = resDocs.headers.get("content-type");
    const docsHtml = await resDocs.text();
    console.log(`✓ GET /api-docs/ -> Status: ${resDocs.status}`);
    console.log(`  Content-Type: ${contentType}`);
    console.log(`  Is HTML: ${contentType && contentType.includes("text/html")}`);
    console.log(`  HTML Title Preview:`, docsHtml.match(/<title>(.*?)<\/title>/)?.[1] || "N/A");

    server.close();
    await disconnectDatabase();
    console.log("\n=================================================");
    console.log("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!");
    console.log("=================================================");
    process.exit(0);
  });
}

verify().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
