const router = require("express").Router();
const addressesController = require("./addresses.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { aesEncryptionService } = require("../../services/aes_encryption");

router.use(requireAuth);

router.get("/", (req, res) => addressesController.list(req, res));
router.post("/", aesEncryptionService.middleware(), (req, res) => addressesController.create(req, res));
router.patch("/:id", aesEncryptionService.middleware(), (req, res) => addressesController.update(req, res));
router.delete("/:id", (req, res) => addressesController.delete(req, res));

module.exports = router;
