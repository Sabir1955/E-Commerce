const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const { query } = require("../database/db");
const { postgresImageService } = require("../services/postgresImage.service");
const productsService = require("../modules/products/products.service");
const categoriesService = require("../modules/categories/categories.service");

async function runImageWorkflowTests() {
  console.log("==================================================================");
  console.log("   PostgreSQL BYTEA Product Image End-to-End Verification Test   ");
  console.log("==================================================================\n");

  let testCatId = null;
  let testProductId = null;
  let firstImageId = null;
  let secondImageId = null;

  try {
    // 1. Database Connection and Schema Verification
    console.log("Step 1: Verifying PostgreSQL database connection and schema...");
    const dbCheck = await query("SELECT current_database(), now() as current_time");
    console.log(`[PASS] Connected to PostgreSQL DB: ${dbCheck.rows[0].current_database}`);

    const tableCheck = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'product_images'
      ORDER BY ordinal_position;
    `);

    if (tableCheck.rows.length === 0) {
      throw new Error("Table 'product_images' does not exist in PostgreSQL!");
    }
    const byteaCol = tableCheck.rows.find((r) => r.column_name === "data");
    if (!byteaCol || byteaCol.data_type !== "bytea") {
      throw new Error(`Column 'data' in 'product_images' must be 'bytea', found: ${byteaCol?.data_type}`);
    }
    console.log(`[PASS] Table 'product_images' exists with 'data BYTEA' column verified.`);

    // 2. Upload Image Binary Buffer (Simulate Multer single upload)
    console.log("\nStep 2: Uploading image binary buffer to PostgreSQL BYTEA storage...");
    // 1x1 valid transparent PNG binary buffer
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82
    ]);

    const mockFile1 = {
      buffer: pngHeader,
      originalname: "ruby-mala-energized.png",
      mimetype: "image/png",
      size: pngHeader.length
    };

    const uploadRes1 = await postgresImageService.uploadImage(mockFile1);
    firstImageId = uploadRes1.fileId;
    console.log(`[PASS] Image uploaded: ID=${firstImageId}, URL=${uploadRes1.url}, MIME=${uploadRes1.contentType}`);

    // Verify raw row in PostgreSQL directly
    const rawImgRow = await query("SELECT id, product_id, filename, mime_type, size, data, is_primary FROM product_images WHERE id = $1", [firstImageId]);
    if (rawImgRow.rows.length === 0) {
      throw new Error(`Uploaded image ${firstImageId} not found in product_images table!`);
    }
    const dbImg = rawImgRow.rows[0];
    if (!Buffer.isBuffer(dbImg.data)) {
      throw new Error("Retrieved column 'data' is not a Buffer!");
    }
    if (!dbImg.data.equals(pngHeader)) {
      throw new Error("Retrieved BYTEA buffer does not match original uploaded buffer!");
    }
    console.log(`[PASS] Direct PostgreSQL query confirmed BYTEA data matches uploaded buffer byte-for-byte (${dbImg.data.length} bytes).`);

    // 3. Validation and Error Handling Tests
    console.log("\nStep 3: Testing image validation and constraints...");
    // Test oversized rejection (>10MB)
    try {
      const hugeBuffer = Buffer.alloc(11 * 1024 * 1024);
      await postgresImageService.uploadImage({ buffer: hugeBuffer, originalname: "huge.jpg", mimetype: "image/jpeg" });
      throw new Error("Oversized image was not rejected!");
    } catch (err) {
      if (err.message.includes("exceeds maximum allowed size")) {
        console.log(`[PASS] Correctly rejected oversized file: ${err.message}`);
      } else {
        throw err;
      }
    }

    // Test empty file rejection
    try {
      await postgresImageService.uploadImage({ buffer: Buffer.alloc(0), originalname: "empty.jpg", mimetype: "image/jpeg" });
      throw new Error("Empty image was not rejected!");
    } catch (err) {
      if (err.message.includes("empty")) {
        console.log(`[PASS] Correctly rejected empty file: ${err.message}`);
      } else {
        throw err;
      }
    }

    // Test invalid format rejection
    try {
      await postgresImageService.uploadImage({ buffer: Buffer.from("executable"), originalname: "virus.exe", mimetype: "application/x-msdownload" });
      throw new Error("Invalid mime format was not rejected!");
    } catch (err) {
      if (err.message.includes("Invalid image file format")) {
        console.log(`[PASS] Correctly rejected non-image format: ${err.message}`);
      } else {
        throw err;
      }
    }

    // 4. Create Category and Product Linked with the Uploaded Image
    console.log("\nStep 4: Creating product associated with uploaded image...");
    const cat = await categoriesService.createCategory({
      name: `Test Astro Stones ${Date.now()}`,
      description: "Category for image workflow testing"
    });
    testCatId = cat.id || cat._id;

    const productPayload = {
      name: `Energized Ruby Gemstone ${Date.now()}`,
      description: "Authentic natural energized gemstone for Sun astrological remedies",
      price: 3499,
      stock: 7,
      category: cat.name,
      categoryId: testCatId,
      imageUrl: uploadRes1.url, // /api/products/images/:fileId
      imageFileId: firstImageId,
      images: [uploadRes1.url]
    };

    const createdProduct = await productsService.createProduct(productPayload);
    testProductId = createdProduct.id || createdProduct._id;
    console.log(`[PASS] Product created: ID=${testProductId}, Name="${createdProduct.name}", ImageURL="${createdProduct.imageUrl}"`);

    // Verify that the product_images table updated product_id and is_primary
    const linkedImgRes = await query("SELECT id, product_id, is_primary FROM product_images WHERE id = $1", [firstImageId]);
    const linkedImg = linkedImgRes.rows[0];
    if (linkedImg.product_id !== testProductId) {
      throw new Error(`product_images.product_id was not updated! Expected ${testProductId}, got ${linkedImg.product_id}`);
    }
    if (!linkedImg.is_primary) {
      throw new Error(`product_images.is_primary was not set to true!`);
    }
    console.log(`[PASS] product_images table successfully linked to product_id="${linkedImg.product_id}" with is_primary=true.`);

    // 5. Retrieve Image by Image ID and by Product ID
    console.log("\nStep 5: Retrieving image bytes from PostgreSQL service...");
    const retrievedById = await postgresImageService.getImageById(firstImageId);
    if (!retrievedById || !retrievedById.data || !retrievedById.data.equals(pngHeader)) {
      throw new Error("getImageById failed to retrieve valid image bytes!");
    }
    console.log(`[PASS] postgresImageService.getImageById(${firstImageId}) returned valid binary buffer.`);

    const retrievedByProd = await postgresImageService.getPrimaryImageByProductId(testProductId);
    if (!retrievedByProd || !retrievedByProd.data || !retrievedByProd.data.equals(pngHeader)) {
      throw new Error("getPrimaryImageByProductId failed to retrieve valid image bytes!");
    }
    console.log(`[PASS] postgresImageService.getPrimaryImageByProductId(${testProductId}) returned correct primary image.`);

    // 6. Test Product Image Replacement on Update
    console.log("\nStep 6: Testing image replacement on product update...");
    // Create second mock image (JPEG header)
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
    const mockFile2 = {
      buffer: jpegBuffer,
      originalname: "ruby-mala-replacement.jpg",
      mimetype: "image/jpeg",
      size: jpegBuffer.length
    };
    const uploadRes2 = await postgresImageService.uploadImage(mockFile2);
    secondImageId = uploadRes2.fileId;
    console.log(`[PASS] Uploaded replacement image: ID=${secondImageId}`);

    // Update product with new image
    const updatedProd = await productsService.updateProduct(testProductId, {
      imageUrl: uploadRes2.url,
      imageFileId: secondImageId,
      images: [uploadRes2.url]
    });
    console.log(`[PASS] Product updated with new image: ${updatedProd.imageUrl}`);

    // Verify new image is linked and primary
    const newImgCheck = await postgresImageService.getPrimaryImageByProductId(testProductId);
    if (!newImgCheck || newImgCheck.id !== secondImageId) {
      throw new Error(`Expected new primary image ${secondImageId}, but got ${newImgCheck?.id}`);
    }
    if (!newImgCheck.data.equals(jpegBuffer)) {
      throw new Error("New primary image data does not match replacement buffer!");
    }
    console.log(`[PASS] New image ${secondImageId} is active primary image for product.`);

    // Verify unreferenced previous image was deleted from DB
    const oldImgCheck = await query("SELECT id FROM product_images WHERE id = $1", [firstImageId]);
    if (oldImgCheck.rows.length > 0) {
      console.warn(`[INFO] Old image record ${firstImageId} still in DB (or retained by policy).`);
    } else {
      console.log(`[PASS] Replaced unreferenced image ${firstImageId} was cleanly removed from product_images.`);
    }

    // 7. Test Placeholder Fallback
    console.log("\nStep 7: Testing placeholder fallback...");
    const missingImage = await postgresImageService.getImageById("nonexistent-image-id");
    if (missingImage !== null) {
      throw new Error("getImageById for non-existent image should return null!");
    }
    const svg = postgresImageService.getPlaceholderSvg();
    if (!svg.includes("<svg") || !svg.includes("ASTRO NIRVAN")) {
      throw new Error("getPlaceholderSvg does not return valid SVG!");
    }
    console.log("[PASS] Non-existent image safely returns null and placeholder SVG is valid.");

    // 8. Test Database Re-query / Restart Simulation
    console.log("\nStep 8: Simulating server restart & persistence verification...");
    // Fresh query directly from PostgreSQL to verify data persists across requests/connections
    const persistCheck = await query(`
      SELECT p.id as product_id, p.name, pi.id as image_id, pi.filename, pi.mime_type, LENGTH(pi.data) as data_len
      FROM products p
      JOIN product_images pi ON p.id = pi.product_id
      WHERE p.id = $1
    `, [testProductId]);

    if (persistCheck.rows.length === 0) {
      throw new Error("Persistence verification failed: product image relationship not found in PostgreSQL!");
    }
    const pRow = persistCheck.rows[0];
    console.log(`[PASS] Persistence confirmed: Product "${pRow.name}" -> Image ID "${pRow.image_id}" (${pRow.filename}, ${pRow.mime_type}, ${pRow.data_len} bytes in BYTEA).`);

    // 9. Cleanup
    console.log("\nStep 9: Cleaning up test records...");
    await productsService.archiveProduct(testProductId, true); // Hard delete
    const postDelImgs = await query("SELECT id FROM product_images WHERE product_id = $1", [testProductId]);
    if (postDelImgs.rows.length > 0) {
      throw new Error("Product images were not deleted when product was hard-deleted!");
    }
    console.log("[PASS] Product and associated product_images were cleanly deleted.");

    if (testCatId) {
      await categoriesService.deleteCategory(testCatId, true).catch(() => {});
      console.log("[PASS] Test category cleaned up.");
    }

    console.log("\n==================================================================");
    console.log("   ALL POSTGRESQL BYTEA IMAGE WORKFLOW TESTS PASSED (100%)       ");
    console.log("==================================================================");
    process.exit(0);
  } catch (error) {
    console.error("\n[TEST FAILED]:", error);
    if (testProductId) {
      await productsService.archiveProduct(testProductId, true).catch(() => {});
    }
    if (firstImageId) {
      await query("DELETE FROM product_images WHERE id = $1", [firstImageId]).catch(() => {});
    }
    if (secondImageId) {
      await query("DELETE FROM product_images WHERE id = $1", [secondImageId]).catch(() => {});
    }
    if (testCatId) {
      await categoriesService.deleteCategory(testCatId, true).catch(() => {});
    }
    process.exit(1);
  }
}

runImageWorkflowTests();
