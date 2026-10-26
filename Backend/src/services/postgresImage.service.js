const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { query } = require("../database/db");
const { BadRequestError, NotFoundError } = require("../utils/errors");

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="100%" height="100%"><defs><linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#20233B"/><stop offset="50%" stop-color="#30272A"/><stop offset="100%" stop-color="#141624"/></linearGradient><radialGradient id="goldGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#B99A45" stop-opacity="0.3"/><stop offset="100%" stop-color="#B99A45" stop-opacity="0"/></radialGradient></defs><rect width="600" height="600" fill="url(#bgGrad)"/><circle cx="300" cy="270" r="180" fill="url(#goldGlow)"/><circle cx="300" cy="270" r="140" fill="none" stroke="#D8B88E" stroke-width="1.5" stroke-dasharray="4,6" opacity="0.6"/><circle cx="300" cy="270" r="110" fill="none" stroke="#B99A45" stroke-width="2" opacity="0.8"/><text x="300" y="490" text-anchor="middle" fill="#E8D5B5" font-family="'Cinzel',serif" font-size="20" letter-spacing="4">ASTRO NIRVAN</text></svg>`;

const ALLOWED_MIME_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"]
]);

const EXT_TO_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

class PostgresImageService {
  /**
   * Return inline placeholder SVG
   */
  getPlaceholderSvg() {
    return FALLBACK_SVG;
  }

  /**
   * Normalize and validate image MIME type
   */
  detectMimeType(file, originalName = "") {
    let mime = (file.mimetype || file.contentType || "").toLowerCase().trim();
    if (ALLOWED_MIME_TYPES.has(mime)) {
      return mime === "image/jpg" ? "image/jpeg" : mime;
    }

    const ext = path.extname(originalName || file.originalname || "").toLowerCase();
    if (EXT_TO_MIME[ext]) {
      return EXT_TO_MIME[ext];
    }

    if (mime.startsWith("image/")) {
      return mime;
    }

    throw new BadRequestError("Invalid image file format. Only JPG, PNG, WebP, GIF, and SVG are accepted.");
  }

  /**
   * Upload an image buffer directly into PostgreSQL BYTEA storage.
   * @param {Object} file - Multer file object or custom buffer object
   * @param {Object} options - { productId, isPrimary, filename }
   */
  async uploadImage(file, options = {}) {
    if (!file) {
      throw new BadRequestError("No image file provided for upload");
    }

    let buffer = file.buffer;
    if (!buffer && file.path && fs.existsSync(file.path)) {
      buffer = fs.readFileSync(file.path);
    }

    if (!buffer || buffer.length === 0) {
      throw new BadRequestError("Uploaded image file is empty");
    }

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestError("Image file exceeds maximum allowed size of 10 MB");
    }

    const originalName = file.originalname || options.filename || "product-image.jpg";
    const mimeType = this.detectMimeType(file, originalName);
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const id = crypto.randomBytes(12).toString("hex");
    const productId = options.productId || null;
    const isPrimary = options.isPrimary ?? false;

    const sql = `
      INSERT INTO product_images (id, product_id, filename, mime_type, size, data, is_primary, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, product_id, filename, mime_type, size, is_primary, created_at;
    `;

    const res = await query(sql, [
      id,
      productId,
      safeName,
      mimeType,
      buffer.length,
      buffer,
      isPrimary
    ]);

    const row = res.rows[0];
    const relativeUrl = `/api/products/images/${row.id}`;

    return {
      fileId: row.id,
      id: row.id,
      key: row.id,
      url: relativeUrl,
      imageUrl: relativeUrl,
      filename: row.filename,
      contentType: row.mime_type,
      mimetype: row.mime_type,
      size: row.size,
      provider: "postgresql"
    };
  }

  /**
   * Compatibility wrapper matching legacy storageService.upload()
   */
  async upload(file, options = {}) {
    return this.uploadImage(file, options);
  }

  /**
   * Retrieve an image record (including buffer) by image ID
   */
  async getImageById(id) {
    if (!id) return null;
    const cleanId = String(id).replace(/^\/api\/products\/images\//, "").trim();
    const res = await query(
      "SELECT id, product_id, filename, mime_type, size, data, is_primary, created_at, updated_at FROM product_images WHERE id = $1",
      [cleanId]
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  /**
   * Retrieve the primary image (including buffer) for a given product ID
   */
  async getPrimaryImageByProductId(productId) {
    if (!productId) return null;
    const res = await query(
      "SELECT id, product_id, filename, mime_type, size, data, is_primary, created_at, updated_at FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, created_at ASC LIMIT 1",
      [String(productId).trim()]
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  /**
   * Retrieve metadata for an image without fetching the entire data buffer
   */
  async getFileMetadata(id) {
    if (!id) return null;
    const cleanId = String(id).replace(/^\/api\/products\/images\//, "").trim();
    const res = await query(
      "SELECT id, product_id, filename, mime_type, size, is_primary, created_at FROM product_images WHERE id = $1",
      [cleanId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      _id: row.id,
      id: row.id,
      fileId: row.id,
      filename: row.filename,
      contentType: row.mime_type,
      length: row.size,
      uploadDate: row.created_at
    };
  }

  /**
   * Associate uploaded images with a product record
   */
  async linkImagesToProduct(imageIds, productId, primaryImageId = null) {
    if (!productId || !Array.isArray(imageIds) || imageIds.length === 0) return;
    const cleanIds = imageIds.map(id => String(id).replace(/^\/api\/products\/images\//, "").trim()).filter(Boolean);
    if (cleanIds.length === 0) return;

    // Link all images to this product
    await query(
      "UPDATE product_images SET product_id = $1, updated_at = NOW() WHERE id = ANY($2::varchar[])",
      [String(productId), cleanIds]
    );

    // Set primary flag
    if (primaryImageId) {
      const cleanPrimary = String(primaryImageId).replace(/^\/api\/products\/images\//, "").trim();
      await query(
        "UPDATE product_images SET is_primary = FALSE WHERE product_id = $1",
        [String(productId)]
      );
      await query(
        "UPDATE product_images SET is_primary = TRUE WHERE id = $1",
        [cleanPrimary]
      );
    } else {
      // Set the first image as primary if none is designated
      const firstId = cleanIds[0];
      await query(
        "UPDATE product_images SET is_primary = (id = $1) WHERE product_id = $2",
        [firstId, String(productId)]
      );
    }
  }

  /**
   * Delete an image from PostgreSQL by image ID
   */
  async deleteImage(id) {
    if (!id) return false;
    const cleanId = String(id).replace(/^\/api\/products\/images\//, "").trim();
    const res = await query("DELETE FROM product_images WHERE id = $1", [cleanId]);
    return (res.rowCount || 0) > 0;
  }

  /**
   * Compatibility wrapper matching legacy storageService.delete()
   */
  async delete(key) {
    return this.deleteImage(key);
  }

  /**
   * Delete all images associated with a product ID
   */
  async deleteImagesByProductId(productId) {
    if (!productId) return false;
    const res = await query("DELETE FROM product_images WHERE product_id = $1", [String(productId)]);
    return (res.rowCount || 0) > 0;
  }

  /**
   * Generate canonical relative URL for an image ID
   */
  getUrl(fileId) {
    if (!fileId) return "/api/products/placeholder";
    const cleanId = String(fileId).replace(/^\/api\/products\/images\//, "").trim();
    return `/api/products/images/${cleanId}`;
  }
}

const postgresImageService = new PostgresImageService();

module.exports = {
  PostgresImageService,
  postgresImageService
};
