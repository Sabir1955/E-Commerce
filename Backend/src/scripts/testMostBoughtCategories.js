const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { query } = require("../database/db");
const categoriesService = require("../modules/categories/categories.service");

async function verifyMostBoughtCategories() {
  console.log("==================================================================");
  console.log("   Verification: Top 6 Most Bought Categories from PostgreSQL    ");
  console.log("==================================================================\n");

  try {
    // 1. Direct PostgreSQL Verification of Purchase Data
    console.log("Step 1: Running direct PostgreSQL aggregation of customer purchases...");
    const rawSql = `
      SELECT
        c.id,
        c.name,
        c.slug,
        COALESCE(SUM(oi.quantity), 0)::int AS total_sold,
        COUNT(DISTINCT oi.order_id)::int AS order_count
      FROM categories c
      JOIN products p ON (p.category_id = c.id OR LOWER(TRIM(p.category)) = LOWER(TRIM(c.name)))
      JOIN order_items oi ON (oi.product_id = p.id OR LOWER(TRIM(oi.name)) = LOWER(TRIM(p.name)))
      JOIN orders o ON o.id = oi.order_id AND LOWER(TRIM(o.status)) != 'cancelled'
      WHERE c.active = true
      GROUP BY c.id, c.name, c.slug
      HAVING COALESCE(SUM(oi.quantity), 0) > 0
      ORDER BY total_sold DESC, order_count DESC, c.name ASC;
    `;
    const dbResult = await query(rawSql);
    console.log(`[PASS] Found ${dbResult.rows.length} categories with customer purchases in PostgreSQL:`);
    console.table(dbResult.rows);

    if (dbResult.rows.length === 0) {
      throw new Error("No customer purchases found in PostgreSQL!");
    }

    // 2. Service Call Verification (default limit = 6)
    console.log("\nStep 2: Calling categoriesService.getMostBoughtCategories()...");
    const serviceCategories = await categoriesService.getMostBoughtCategories({});
    console.log(`[PASS] Service returned ${serviceCategories.length} categories (expected at most 6).`);

    if (serviceCategories.length > 6) {
      throw new Error(`Expected at most 6 categories, but received ${serviceCategories.length}!`);
    }

    const expectedCount = Math.min(dbResult.rows.length, 6);
    if (serviceCategories.length !== expectedCount) {
      throw new Error(`Expected exactly ${expectedCount} categories, but received ${serviceCategories.length}!`);
    }

    // 3. Verify Ranking from Highest to Lowest
    console.log("\nStep 3: Verifying ranking and numbers match PostgreSQL source of truth...");
    for (let i = 0; i < serviceCategories.length; i++) {
      const cat = serviceCategories[i];
      const dbCat = dbResult.rows[i];

      console.log(`Rank #${i + 1}: "${cat.name}" - ${cat.totalSold} sold across ${cat.orderCount} orders`);

      if (cat.name !== dbCat.name) {
        throw new Error(`Rank #${i + 1} mismatch! Expected "${dbCat.name}", got "${cat.name}"`);
      }
      if (cat.totalSold !== dbCat.total_sold) {
        throw new Error(`Category "${cat.name}" totalSold mismatch! Expected ${dbCat.total_sold}, got ${cat.totalSold}`);
      }
      if (cat.orderCount !== dbCat.order_count) {
        throw new Error(`Category "${cat.name}" orderCount mismatch! Expected ${dbCat.order_count}, got ${cat.orderCount}`);
      }

      if (i > 0) {
        const prevCat = serviceCategories[i - 1];
        if (cat.totalSold > prevCat.totalSold) {
          throw new Error(`Ordering violation: Rank #${i + 1} (${cat.name}: ${cat.totalSold}) has higher sales than Rank #${i} (${prevCat.name}: ${prevCat.totalSold})!`);
        }
      }

      if (cat.totalSold <= 0) {
        throw new Error(`Category "${cat.name}" has 0 sales and should not be displayed in Most Bought Categories!`);
      }
    }
    console.log("[PASS] All categories ranked strictly from highest to lowest based on actual PostgreSQL purchases.");

    // 4. Verify Categories with 0 Purchases are Excluded
    console.log("\nStep 4: Verifying zero-purchase categories are excluded...");
    const zeroPurchases = await query(`
      SELECT c.name FROM categories c
      WHERE c.active = true
      AND c.id NOT IN (
        SELECT DISTINCT p.category_id FROM products p
        JOIN order_items oi ON oi.product_id = p.id
        JOIN orders o ON o.id = oi.order_id AND LOWER(TRIM(o.status)) != 'cancelled'
        WHERE p.category_id IS NOT NULL
      )
    `);

    for (const zeroRow of zeroPurchases.rows) {
      const foundInService = serviceCategories.find(c => c.name.toLowerCase() === zeroRow.name.toLowerCase());
      if (foundInService) {
        throw new Error(`Category "${zeroRow.name}" with 0 sales was incorrectly returned in Most Bought Categories!`);
      }
    }
    console.log(`[PASS] Confirmed ${zeroPurchases.rows.length} categories with 0 sales were correctly excluded.`);

    // 5. Test Parameterized Limits (e.g. limit=3 and limit=10)
    console.log("\nStep 5: Testing limit parameter enforcement...");
    const limit3 = await categoriesService.getMostBoughtCategories({ limit: 3 });
    if (limit3.length !== 3) {
      throw new Error(`Expected exactly 3 categories for limit=3, got ${limit3.length}`);
    }
    console.log(`[PASS] limit=3 returned exactly 3 categories.`);

    const limit10 = await categoriesService.getMostBoughtCategories({ limit: 10 });
    if (limit10.length > 6) {
      throw new Error(`Expected limit=10 to be capped at 6, got ${limit10.length}`);
    }
    console.log(`[PASS] limit=10 capped at top 6 categories.`);

    console.log("\n==================================================================");
    console.log("   ALL MOST BOUGHT CATEGORIES TESTS PASSED (100%)                ");
    console.log("==================================================================");
    process.exit(0);
  } catch (err) {
    console.error("\n[TEST FAILED]:", err);
    process.exit(1);
  }
}

verifyMostBoughtCategories();
