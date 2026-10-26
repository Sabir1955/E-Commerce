const router = require("express").Router();
const inventoryController = require("./inventory.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");

router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => inventoryController.getInventory(req, res));
router.patch("/:id", (req, res) => inventoryController.updateStock(req, res));
router.post("/:id/adjust", (req, res) => inventoryController.adjustStock(req, res));

module.exports = router;
