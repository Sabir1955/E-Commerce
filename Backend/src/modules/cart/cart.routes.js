const router = require("express").Router();
const cartController = require("./cart.controller");
const { requireAuth } = require("../../middleware/auth.middleware");

router.use(requireAuth);

router.get("/", (req, res) => cartController.get(req, res));
router.post("/items", (req, res) => cartController.addItem(req, res));
router.patch("/items/:productId", (req, res) => cartController.updateItem(req, res));
router.delete("/items/:productId", (req, res) => cartController.removeItem(req, res));
router.delete("/", (req, res) => cartController.clear(req, res));

module.exports = router;
