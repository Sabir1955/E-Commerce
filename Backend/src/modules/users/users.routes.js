const router = require("express").Router();
const usersController = require("./users.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { aesEncryptionService } = require("../../services/aes_encryption");

router.use(requireAuth);

router.get("/me", (req, res) => usersController.getProfile(req, res));
router.patch("/me", aesEncryptionService.middleware(), (req, res) => usersController.updateProfile(req, res));
router.patch("/me/preferences", (req, res) => usersController.updatePreferences(req, res));

module.exports = router;
