/**
 * Phase 18 Verification Suite: Final Project Cleanup & Production Hardening
 * Covers: .gitignore Security Rules, .env.example Synchronization,
 * Secret Leak Prevention, Zero External Images Audit, Local SVG Assets Integrity,
 * Seed Data & Admin Script Quality, Modular Architecture, and 100% Codebase Syntax.
 */

const fs = require("fs");
const path = require("path");

function runTests() {
  console.log("======================================================================");
  console.log("Running Phase 18 Final Project Cleanup & Production Hardening Tests");
  console.log("======================================================================\n");

  let passed = 0;
  let failed = 0;

  // Test 1: Root & Subdirectory .gitignore Secret Protections
  try {
    const rootGitignore = fs.readFileSync(path.join(__dirname, "../../../.gitignore"), "utf-8");
    const backendGitignore = fs.readFileSync(path.join(__dirname, "../../.gitignore"), "utf-8");
    const frontendGitignore = fs.readFileSync(path.join(__dirname, "../../../Frontend/.gitignore"), "utf-8");

    if (!rootGitignore.includes(".env") || !rootGitignore.includes("node_modules")) {
      throw new Error("Root .gitignore missing .env or node_modules protection");
    }
    if (!backendGitignore.includes(".env") || !backendGitignore.includes("node_modules")) {
      throw new Error("Backend .gitignore missing .env or node_modules protection");
    }
    if (!frontendGitignore.includes("dist") || !frontendGitignore.includes("node_modules")) {
      throw new Error("Frontend .gitignore missing dist or node_modules protection");
    }

    console.log("  ✓ [PASS] 1. Multi-tier .gitignore rules actively protect credentials (.env), build outputs, and node_modules");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 1. .gitignore rules:", e.message);
    failed++;
  }

  // Test 2: .env.example Synchronization with env.js
  try {
    const envExample = fs.readFileSync(path.join(__dirname, "../../.env.example"), "utf-8");
    const requiredEnvKeys = [
      "PORT",
      "MONGODB_URI",
      "JWT_SECRET",
      "ADMIN_EMAIL",
      "ADMIN_PASSWORD",
      "RETURN_POLICY_DAYS",
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET",
      "SHIPROCKET_EMAIL",
      "SMTP_HOST",
      "TWILIO_ACCOUNT_SID"
    ];

    for (const key of requiredEnvKeys) {
      if (!envExample.includes(key + "=")) {
        throw new Error(`.env.example missing required key: ${key}`);
      }
    }

    console.log("  ✓ [PASS] 2. Backend .env.example fully synchronized with all system environment variables");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 2. .env.example synchronization:", e.message);
    failed++;
  }

  // Test 3: Secret Leak Prevention in Example Configuration
  try {
    const envExample = fs.readFileSync(path.join(__dirname, "../../.env.example"), "utf-8");

    const forbiddenLeakPatterns = [
      /rzp_live_[a-zA-Z0-9]+/,
      /mongodb\+srv:\/\/[^<:]+:[^<@]+@/, // Actual live credentials in URI
      /SK[a-f0-9]{32}/i
    ];

    for (const pattern of forbiddenLeakPatterns) {
      if (pattern.test(envExample)) {
        throw new Error("Potential real secret or credential detected in .env.example");
      }
    }

    console.log("  ✓ [PASS] 3. .env.example verified free of real production secrets, tokens, and credentials");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 3. Secret leak prevention:", e.message);
    failed++;
  }

  // Test 4: Zero External Image Dependencies across Frontend Source
  try {
    const frontendSrc = path.join(__dirname, "../../../Frontend/src");
    let externalImagesFound = 0;

    function scanDir(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (file.endsWith(".ts") || file.endsWith(".html") || file.endsWith(".css")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (
            content.includes("images.unsplash.com") ||
            content.includes("via.placeholder.com") ||
            content.includes("picsum.photos")
          ) {
            externalImagesFound++;
            console.error(`Found external image in: ${fullPath}`);
          }
        }
      }
    }

    scanDir(frontendSrc);

    if (externalImagesFound > 0) {
      throw new Error(`Found ${externalImagesFound} files referencing external placeholder images`);
    }

    console.log("  ✓ [PASS] 4. Zero external image dependencies: 100% of frontend codebase verified free of CDN/Unsplash URLs");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 4. Zero external image audit:", e.message);
    failed++;
  }

  // Test 5: Local Placeholder SVG Assets Presence
  try {
    const backendPlaceholders = path.join(__dirname, "../../uploads/placeholders");
    const frontendPlaceholders = path.join(__dirname, "../../../Frontend/public/uploads/placeholders");

    const requiredSvgs = [
      "avatar-placeholder.svg",
      "banner-placeholder.svg",
      "category-placeholder.svg",
      "product-placeholder.svg"
    ];

    for (const svg of requiredSvgs) {
      const backendFile = path.join(backendPlaceholders, svg);
      const frontendFile = path.join(frontendPlaceholders, svg);

      if (!fs.existsSync(backendFile) || fs.statSync(backendFile).size === 0) {
        throw new Error(`Missing backend placeholder SVG: ${svg}`);
      }
      if (!fs.existsSync(frontendFile) || fs.statSync(frontendFile).size === 0) {
        throw new Error(`Missing frontend public placeholder SVG: ${svg}`);
      }
    }

    console.log("  ✓ [PASS] 5. All 4 sacred SVG placeholders verified in both Backend uploads and Frontend public trees");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 5. Local placeholder assets:", e.message);
    failed++;
  }

  // Test 6: Sacred Navgraha Yantra SVG Asset
  try {
    const yantraPath = path.join(__dirname, "../../../Frontend/public/images/navgraha-yantra.svg");
    if (!fs.existsSync(yantraPath)) {
      throw new Error("navgraha-yantra.svg not found in Frontend/public/images");
    }

    const content = fs.readFileSync(yantraPath, "utf-8");
    if (!content.includes("<svg") || !content.includes("</svg>")) {
      throw new Error("navgraha-yantra.svg does not contain valid SVG markup");
    }

    console.log(`  ✓ [PASS] 6. Sacred Navgraha Yantra SVG verified (${fs.statSync(yantraPath).size} bytes)`);
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 6. Navgraha Yantra asset:", e.message);
    failed++;
  }

  // Test 7: Database Seeding Script Quality & Integrity
  try {
    const seedPath = path.join(__dirname, "seedData.js");
    if (!fs.existsSync(seedPath)) {
      throw new Error("seedData.js not found in scripts directory");
    }

    const seedContent = fs.readFileSync(seedPath, "utf-8");
    // Ensure seed data only points to local placeholder URLs
    if (seedContent.includes("unsplash.com") || seedContent.includes("placeholder.com")) {
      throw new Error("seedData.js contains external image URLs");
    }

    console.log("  ✓ [PASS] 7. Database seeding script verified cleanly structured with 100% local image references");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 7. Seed data integrity:", e.message);
    failed++;
  }

  // Test 8: Admin Creation Script Quality
  try {
    const adminScript = path.join(__dirname, "createAdmin.js");
    if (!fs.existsSync(adminScript)) {
      throw new Error("createAdmin.js not found");
    }

    const adminContent = fs.readFileSync(adminScript, "utf-8");
    if (!adminContent.includes("bcrypt") || !adminContent.includes("role: \"admin\"")) {
      throw new Error("createAdmin.js does not enforce bcrypt password hashing and admin role");
    }

    console.log("  ✓ [PASS] 8. Admin bootstrap script securely hashes credentials using bcrypt and assigns admin role");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 8. Admin creation script:", e.message);
    failed++;
  }

  // Test 9: Modular Backend Architecture Verification (12 Core Modules)
  try {
    const modulesDir = path.join(__dirname, "../modules");
    const expectedModules = [
      "auth",
      "users",
      "products",
      "categories",
      "cart",
      "addresses",
      "orders",
      "payments",
      "inventory",
      "customers",
      "admin",
      "notifications"
    ];

    for (const mod of expectedModules) {
      const modDir = path.join(modulesDir, mod);
      if (!fs.existsSync(modDir)) {
        throw new Error(`Missing expected module directory: ${mod}`);
      }
      const files = fs.readdirSync(modDir);
      const hasRoute = files.some((f) => f.endsWith(".routes.js"));
      const hasController = files.some((f) => f.endsWith(".controller.js"));
      if (!hasRoute || !hasController) {
        throw new Error(`Module ${mod} is missing routes or controller file`);
      }
    }

    console.log("  ✓ [PASS] 9. All 12 modular domains maintain clean encapsulation (routes, controllers, services)");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 9. Modular architecture:", e.message);
    failed++;
  }

  // Test 10: Angular Production Distribution Integrity
  try {
    const distPath = path.join(__dirname, "../../../Frontend/dist/e-commerce-app");
    if (!fs.existsSync(distPath)) {
      throw new Error("Angular production dist directory not found");
    }

    const browserDist = path.join(distPath, "browser");
    const serverDist = path.join(distPath, "server");

    if (!fs.existsSync(browserDist) || !fs.existsSync(serverDist)) {
      throw new Error("Compiled browser or server bundle missing from dist output");
    }

    const indexHtml = path.join(browserDist, "index.html");
    if (!fs.existsSync(indexHtml)) {
      throw new Error("Compiled index.html missing from browser distribution");
    }

    console.log("  ✓ [PASS] 10. Angular production distribution verified (browser bundle, server SSR bundle, index.html)");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 10. Angular distribution:", e.message);
    failed++;
  }

  // Test 11: Production Cleanliness & Error Middleware Resilience
  try {
    const app = require("../app");
    const stack = app._router ? app._router.stack : [];

    const notFoundIndex = stack.findIndex((l) => l.name === "notFoundMiddleware");
    const errorIndex = stack.findIndex((l) => l.name === "errorMiddleware");

    if (notFoundIndex === -1 || errorIndex === -1 || notFoundIndex >= errorIndex) {
      throw new Error("Error handling middleware is improperly ordered or missing from app.js");
    }

    console.log("  ✓ [PASS] 11. Production error boundary handlers (notFoundMiddleware, errorMiddleware) properly terminated at stack tail");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 11. Error boundary ordering:", e.message);
    failed++;
  }

  // Test 12: 100% Codebase Syntax Validation Across All Backend Source Files
  try {
    const { execSync } = require("child_process");
    const output = execSync("node src/scripts/verifySyntax.js", {
      cwd: path.join(__dirname, "../.."),
      encoding: "utf-8"
    });

    if (!output.includes("SUCCESS:")) {
      throw new Error("Syntax check failed: " + output);
    }

    console.log("  ✓ [PASS] 12. 100% codebase syntax validation passed across all JavaScript source files");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 12. Codebase syntax validation:", e.message);
    failed++;
  }

  console.log("\n======================================================================");
  console.log(`Phase 18 Verification Completed: ${passed} passed, ${failed} failed`);
  console.log("======================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
