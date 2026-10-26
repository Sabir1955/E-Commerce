const productsService = require("./products.service");
const ApiResponse = require("../../utils/apiResponse");
const { BadRequestError } = require("../../utils/errors");
const { storageService } = require("../../config/storage");

class ProductsController {
  async list(req, res) {
    const result = await productsService.listProducts(req.query);
    return ApiResponse.success(res, {
      message: "Products retrieved successfully",
      data: result
    });
  }

  async featured(req, res) {
    const result = await productsService.getFeaturedProducts(req.query);
    return ApiResponse.success(res, {
      message: "Featured products retrieved successfully",
      data: result
    });
  }

  async latest(req, res) {
    const result = await productsService.getLatestProducts(req.query);
    return ApiResponse.success(res, {
      message: "Latest products retrieved successfully",
      data: result
    });
  }

  async getById(req, res) {
    const product = await productsService.getProductById(req.params.id);
    return ApiResponse.success(res, {
      message: "Product details retrieved successfully",
      data: product
    });
  }

  async related(req, res) {
    const products = await productsService.getRelatedProducts(req.params.id, req.query.limit);
    return ApiResponse.success(res, {
      message: "Related products retrieved successfully",
      data: { products }
    });
  }

  async create(req, res) {
    const product = await productsService.createProduct(req.body);
    return ApiResponse.created(res, {
      message: "Product created successfully",
      data: product
    });
  }

  async update(req, res) {
    const product = await productsService.updateProduct(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: "Product updated successfully",
      data: product
    });
  }

  async setInventory(req, res) {
    const availability = req.body.available !== undefined
      ? req.body.available
      : (req.body.isAvailable !== undefined ? req.body.isAvailable : req.body.is_available);
    const product = await productsService.setProductInventory(req.params.id, req.body.quantity, availability);
    return ApiResponse.success(res, {
      message: "Product inventory updated successfully",
      data: product
    });
  }

  async adjustInventory(req, res) {
    const product = await productsService.adjustProductInventory(req.params.id, req.body.amount);
    return ApiResponse.success(res, {
      message: "Product inventory adjusted successfully",
      data: product
    });
  }

  async archive(req, res) {
    const hard = req.query.hard === "true" || req.query.permanent === "true";
    await productsService.archiveProduct(req.params.id, hard);
    return ApiResponse.success(res, {
      message: hard ? "Product deleted successfully" : "Product archived"
    });
  }

  async uploadImages(req, res) {
    const files = req.files || (req.file ? [req.file] : []);
    const product = await productsService.uploadProductImages(req.params.id, files);
    return ApiResponse.created(res, {
      message: "Product images uploaded successfully",
      data: { product },
      product
    });
  }

  async uploadSingleImage(req, res) {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      throw new BadRequestError("No image file uploaded");
    }

    const uploadResults = [];
    for (const file of files) {
      const result = await storageService.upload(file);
      uploadResults.push(result);
    }

    const primary = uploadResults[0];
    const uploadedUrls = uploadResults.map((r) => r.url);
    const fileIds = uploadResults.map((r) => r.fileId);

    return ApiResponse.success(res, {
      message: "Image uploaded successfully to PostgreSQL",
      fileId: primary.fileId,
      fileIds,
      url: primary.url,
      imageUrl: primary.url,
      images: uploadedUrls
    });
  }

  /**
   * GET /api/products/images/:fileId
   * Streams a binary image file from PostgreSQL BYTEA storage with CORS & HTTP caching
   */
  async getGridFSImage(req, res) {
    const { fileId } = req.params;
    const { postgresImageService } = require("../../services/postgresImage.service");
    let file = await postgresImageService.getImageById(fileId);
    if (!file) {
      file = await postgresImageService.getPrimaryImageByProductId(fileId);
    }

    if (!file || !file.data) {
      // Graceful fallback: return placeholder SVG
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-cache");
      return res.status(200).send(storageService.getPlaceholderSvg());
    }

    const etag = `"${file.id}-${file.size || file.data.length}"`;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("ETag", etag);

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    const contentType = file.mime_type || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", file.data.length);
    return res.status(200).send(file.data);
  }

  /**
   * GET /api/products/:id/image
   * Streams the product's primary image from PostgreSQL BYTEA storage or gracefully serves placeholder
   */
  async getProductImage(req, res) {
    const { id } = req.params;
    const { postgresImageService } = require("../../services/postgresImage.service");

    const file = await postgresImageService.getPrimaryImageByProductId(id);
    if (file && file.data) {
      const etag = `"${file.id}-${file.size || file.data.length}"`;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      res.setHeader("ETag", etag);

      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      res.setHeader("Content-Type", file.mime_type || "image/jpeg");
      res.setHeader("Content-Length", file.data.length);
      return res.status(200).send(file.data);
    }

    const product = await productsService.findProductQuietly(id);
    if (!product) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-cache");
      return res.status(200).send(storageService.getPlaceholderSvg());
    }

    let fileId = product.imageFileId ? product.imageFileId.toString() : null;
    if (!fileId && product.imageUrl) {
      const match = product.imageUrl.match(/\/images\/([a-zA-Z0-9_-]+)/i);
      if (match) fileId = match[1];
    }
    if (!fileId && Array.isArray(product.images) && product.images.length > 0) {
      for (const img of product.images) {
        const match = typeof img === "string" && img.match(/\/images\/([a-zA-Z0-9_-]+)/i);
        if (match) {
          fileId = match[1];
          break;
        }
      }
    }

    if (fileId) {
      req.params.fileId = fileId;
      return this.getGridFSImage(req, res);
    }

    // External image link fallback
    if (product.imageUrl && (product.imageUrl.startsWith("http://") || product.imageUrl.startsWith("https://"))) {
      return res.redirect(302, product.imageUrl);
    }

    // Default fallback to placeholder
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-cache");
    return res.status(200).send(storageService.getPlaceholderSvg());
  }

  /**
   * GET /api/products/placeholder
   */
  async getPlaceholder(req, res) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(storageService.getPlaceholderSvg());
  }
}

module.exports = new ProductsController();
