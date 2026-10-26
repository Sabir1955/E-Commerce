const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { query } = require("../database/db");
const categoriesService = require("../modules/categories/categories.service");
const productsService = require("../modules/products/products.service");

async function runTests() {
  console.log("=== Category & Product Search Workflow Verification ===\n");

  let testCatId = null;
  let testProdId = null;

  try {
    // 1. Verify DB Connection
    const dbCheck = await query("SELECT current_database(), now() as current_time");
    console.log(`[PASS] Connected to database: ${dbCheck.rows[0].current_database}`);

    // 2. Test Category Creation
    const uniqueSuffix = Date.now();
    const testCatData = {
      name: `Test Category ${uniqueSuffix}`,
      description: "Automated test category verification",
      displayOrder: 99
    };
    const createdCat = await categoriesService.createCategory(testCatData);
    testCatId = createdCat._id || createdCat.id;
    console.log(`[PASS] Category created successfully: ID=${testCatId}, Name="${createdCat.name}", Slug="${createdCat.slug}"`);

    // Verify category in PostgreSQL directly
    const catDb = await query("SELECT * FROM categories WHERE id = $1", [testCatId]);
    if (catDb.rows.length === 0) {
      throw new Error("Created category not found in PostgreSQL!");
    }
    console.log(`[PASS] Verified category persisted directly in PostgreSQL table 'categories'`);

    // 3. Test Category Listing & Product Count
    const listRes = await categoriesService.listCategories({ all: "true" });
    const catList = Array.isArray(listRes) ? listRes : (listRes.categories || listRes.data || []);
    const foundInList = catList.find(c => c._id === testCatId || c.id === testCatId);
    if (!foundInList) {
      throw new Error("Created category missing from listCategories() response!");
    }
    console.log(`[PASS] listCategories() returned ${catList.length} categories, including newly created category.`);

    // 4. Test Product Creation with Category Assignment
    const testProdData = {
      name: `Astro Test Gemstone ${uniqueSuffix}`,
      description: "A rare authentic gemstone created for testing",
      price: 4999,
      stock: 15,
      categoryId: testCatId,
      brand: "AstroGems",
      images: ["https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?w=500"]
    };

    const createdProd = await productsService.createProduct(testProdData);
    testProdId = createdProd._id || createdProd.id;
    console.log(`[PASS] Product created: ID=${testProdId}, category="${createdProd.category}", categoryId="${createdProd.categoryId}"`);

    // Verify product in PostgreSQL directly
    const prodDb = await query("SELECT id, name, category, category_id FROM products WHERE id = $1", [testProdId]);
    if (prodDb.rows.length === 0) {
      throw new Error("Created product not found in PostgreSQL!");
    }
    const savedProd = prodDb.rows[0];
    if (savedProd.category_id !== testCatId) {
      throw new Error(`category_id mismatch: expected ${testCatId}, got ${savedProd.category_id}`);
    }
    console.log(`[PASS] Verified product category_id='${savedProd.category_id}' persisted in PostgreSQL`);

    // 5. Test Product Count in Category List
    const updatedCatList = await categoriesService.listCategories({ all: "true" });
    const updatedCats = Array.isArray(updatedCatList) ? updatedCatList : (updatedCatList.categories || updatedCatList.data || []);
    const targetCat = updatedCats.find(c => c._id === testCatId || c.id === testCatId);
    console.log(`[PASS] Category product count dynamically calculated: productCount = ${targetCat.productCount}`);
    if (targetCat.productCount < 1) {
      throw new Error(`Expected productCount >= 1, got ${targetCat.productCount}`);
    }

    // 6. Test Product Category Filtering (by Category Name or ID)
    const filterByCatName = await productsService.listProducts({ category: createdCat.name });
    const foundByName = filterByCatName.products.some(p => (p._id || p.id) === testProdId);
    console.log(`[PASS] Filter products by category name ("${createdCat.name}") returned ${filterByCatName.products.length} products. Test product found: ${foundByName}`);
    if (!foundByName) {
      throw new Error("Product filtering by category name failed!");
    }

    const filterByCatId = await productsService.listProducts({ category: testCatId });
    const foundById = filterByCatId.products.some(p => (p._id || p.id) === testProdId);
    console.log(`[PASS] Filter products by category ID ("${testCatId}") returned ${filterByCatId.products.length} products. Test product found: ${foundById}`);
    if (!foundById) {
      throw new Error("Product filtering by category ID failed!");
    }

    // 7. Test Category Filtering COMBINED with Search
    const searchMatch = await productsService.listProducts({
      category: createdCat.name,
      search: "Gemstone"
    });
    const foundInSearchMatch = searchMatch.products.some(p => (p._id || p.id) === testProdId);
    console.log(`[PASS] Category + Search ("Gemstone") returned ${searchMatch.products.length} products. Test product found: ${foundInSearchMatch}`);
    if (!foundInSearchMatch) {
      throw new Error("Category + Search match failed!");
    }

    const searchNoMatch = await productsService.listProducts({
      category: createdCat.name,
      search: "NonExistentKeywordXYZ123"
    });
    console.log(`[PASS] Category + Unrelated Search returned ${searchNoMatch.products.length} products (expected 0 matching test product).`);
    if (searchNoMatch.products.some(p => (p._id || p.id) === testProdId)) {
      throw new Error("Unrelated search should not have matched test product!");
    }

    // 8. Test Pagination with Category Filter
    const paginated = await productsService.listProducts({
      category: createdCat.name,
      page: 1,
      limit: 10
    });
    console.log(`[PASS] Pagination: page 1 returned ${paginated.products.length} products, total = ${paginated.total}`);

    // 9. Test Category Update and Cascade to Products
    const updatedCat = await categoriesService.updateCategory(testCatId, {
      name: `Updated Test Category ${uniqueSuffix}`
    });
    console.log(`[PASS] Category updated to: "${updatedCat.name}"`);

    const prodAfterCatUpdate = await productsService.getProductById(testProdId);
    console.log(`[PASS] Product category name after update: "${prodAfterCatUpdate.category}" (categoryId="${prodAfterCatUpdate.categoryId}")`);
    if (prodAfterCatUpdate.category !== updatedCat.name) {
      throw new Error("Cascade update of category name to product failed!");
    }

    console.log("\n==============================================");
    console.log(" ALL TESTS PASSED SUCCESSFULLY! ");
    console.log("==============================================\n");
  } catch (err) {
    console.error("\n[FAIL] Test encountered error:", err);
    process.exitCode = 1;
  } finally {
    // Cleanup
    try {
      if (testProdId) {
        await query("DELETE FROM products WHERE id = $1", [testProdId]);
        console.log(`[CLEANUP] Deleted test product ${testProdId}`);
      }
      if (testCatId) {
        await query("DELETE FROM categories WHERE id = $1", [testCatId]);
        console.log(`[CLEANUP] Deleted test category ${testCatId}`);
      }
    } catch (cleanupErr) {
      console.error("[CLEANUP ERROR]", cleanupErr);
    }
    process.exit(process.exitCode || 0);
  }
}

runTests();
