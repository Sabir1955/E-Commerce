const router = require("express").Router();
const categoriesController = require("./categories.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");
const { cacheMiddleware, invalidateCache } = require("../../middleware/cache.middleware");

// Public endpoints with high-performance 5-minute caching
router.get("/", cacheMiddleware(300, "categories"), (req, res) => categoriesController.list(req, res));
router.get("/most-bought", (req, res) => categoriesController.getMostBought(req, res));
router.get("/slug/:slug", cacheMiddleware(300, "categories"), (req, res) => {
  req.params.id = req.params.slug;
  return categoriesController.getById(req, res);
});
router.get("/:id", cacheMiddleware(300, "categories"), (req, res) => categoriesController.getById(req, res));

// Admin routes with automatic cache invalidation
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  invalidateCache(["categories", "products"]);
  return categoriesController.create(req, res);
});
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  invalidateCache(["categories", "products"]);
  return categoriesController.update(req, res);
});
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  invalidateCache(["categories", "products"]);
  return categoriesController.delete(req, res);
});

module.exports = router;
