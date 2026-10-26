const fs = require("fs");
const path = require("path");
const Product = require("../models/Product");
const { storageService } = require("../config/storage");

/**
 * Automatically migrate any legacy products that have local /uploads/ paths
 * to MongoDB Atlas GridFS so that all devices/PCs can see them.
 */
async function autoMigrateLocalImagesToGridFS() {
  try {
    const uploadDir = path.join(__dirname, "..", "..", "uploads");
    if (!fs.existsSync(uploadDir)) return;

    // Find products with /uploads/ that do NOT have a GridFS imageFileId
    const products = await Product.find({
      $or: [
        { imageUrl: { $regex: "/uploads/" } },
        { images: { $elemMatch: { $regex: "/uploads/" } } }
      ]
    });

    if (!products || products.length === 0) return;

    console.log(`[GridFS Migration] Checking ${products.length} products with local /uploads/ paths...`);

    for (const product of products) {
      // Check primary imageUrl
      let updated = false;
      let primaryFileId = product.imageFileId;

      if (product.imageUrl && product.imageUrl.includes("/uploads/") && !product.imageUrl.includes("placeholder")) {
        const filename = product.imageUrl.split("/uploads/").pop();
        const localPath = path.join(uploadDir, filename);

        if (fs.existsSync(localPath)) {
          try {
            const uploadRes = await storageService.uploadFromDiskPath(localPath, { preserveSource: true });
            product.imageUrl = uploadRes.url;
            product.imageFileId = uploadRes.fileId;
            primaryFileId = uploadRes.fileId;
            updated = true;
            console.log(`[GridFS Migration] Migrated image for "${product.name}" -> ${uploadRes.url}`);
          } catch (err) {
            console.warn(`[GridFS Migration] Failed to migrate ${localPath}:`, err.message);
          }
        }
      }

      // Check images array
      if (Array.isArray(product.images) && product.images.length > 0) {
        const newImages = [];
        for (const img of product.images) {
          if (typeof img === "string" && img.includes("/uploads/") && !img.includes("placeholder")) {
            const filename = img.split("/uploads/").pop();
            const localPath = path.join(uploadDir, filename);
            if (fs.existsSync(localPath)) {
              try {
                const uploadRes = await storageService.uploadFromDiskPath(localPath, { preserveSource: true });
                newImages.push(uploadRes.url);
                updated = true;
              } catch (e) {
                newImages.push(img);
              }
            } else {
              newImages.push(img);
            }
          } else {
            newImages.push(img);
          }
        }
        if (updated) {
          product.images = newImages;
        }
      }

      if (updated) {
        if (primaryFileId) {
          product.imageFileId = primaryFileId;
          if (!product.imageFileIds.includes(primaryFileId)) {
            product.imageFileIds.push(primaryFileId);
          }
        }
        await product.save();
      }
    }

    console.log("[GridFS Migration] Local image check and migration complete.");
  } catch (error) {
    console.error("[GridFS Migration Error]:", error.message);
  }
}

module.exports = {
  autoMigrateLocalImagesToGridFS
};
