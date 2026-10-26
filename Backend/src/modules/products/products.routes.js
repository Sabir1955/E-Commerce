const router = require("express").Router();
const productsController = require("./products.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");
const { uploadArray } = require("../../middleware/upload.middleware");
const { cacheMiddleware, invalidateCache } = require("../../middleware/cache.middleware");

// Public endpoints with caching
router.get("/", cacheMiddleware(120, "products"), (req, res) => productsController.list(req, res));
router.get("/featured", cacheMiddleware(300, "products"), (req, res) => productsController.featured(req, res));
router.get("/latest", cacheMiddleware(300, "products"), (req, res) => productsController.latest(req, res));
router.get("/slug/:slug", cacheMiddleware(300, "products"), (req, res) => {
  req.params.id = req.params.slug;
  return productsController.getById(req, res);
});
// Image retrieval endpoints (public)
router.get("/images/:fileId", (req, res) => productsController.getGridFSImage(req, res));
router.get("/:id/image", (req, res) => productsController.getProductImage(req, res));
router.get("/placeholder", (req, res) => productsController.getPlaceholder(req, res));

router.get("/:id/related", cacheMiddleware(300, "products"), (req, res) => productsController.related(req, res));
router.get("/:id", cacheMiddleware(300, "products"), (req, res) => productsController.getById(req, res));

// Admin endpoints with automatic cache invalidation
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  invalidateCache(["products", "categories"]);
  return productsController.create(req, res);
});
router.post("/upload-image", requireAuth, requireAdmin, uploadArray("images", 8), async (req, res) => {
  return productsController.uploadSingleImage(req, res);
});
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  invalidateCache(["products", "categories"]);
  return productsController.update(req, res);
});
router.patch("/:id/inventory", requireAuth, requireAdmin, async (req, res) => {
  invalidateCache(["products", "categories"]);
  return productsController.setInventory(req, res);
});
router.post("/:id/inventory/adjust", requireAuth, requireAdmin, async (req, res) => {
  invalidateCache(["products", "categories"]);
  return productsController.adjustInventory(req, res);
});
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  invalidateCache(["products", "categories"]);
  return productsController.archive(req, res);
});

// Product images upload
router.post("/:id/images", requireAuth, requireAdmin, uploadArray("images", 8), async (req, res) => {
  invalidateCache(["products", "categories"]);
  return productsController.uploadImages(req, res);
});

module.exports = router;
