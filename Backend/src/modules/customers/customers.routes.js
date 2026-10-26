const router = require("express").Router();
const customersController = require("./customers.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");

router.use(requireAuth, requireAdmin);

router.get("/", (req, res) => customersController.list(req, res));
router.get("/:id", (req, res) => customersController.getById(req, res));
router.patch("/:id/status", (req, res) => customersController.updateStatus(req, res));

module.exports = router;
