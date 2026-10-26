const router = require("express").Router();
const horoscopeController = require("./horoscope.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");

// Public Customer Routes
router.get("/signs", (req, res) => horoscopeController.getZodiacSigns(req, res));
router.get("/today", (req, res) => horoscopeController.getTodayHoroscopes(req, res));

// Admin CMS Routes
router.get("/admin/all", requireAuth, requireAdmin, (req, res) => horoscopeController.getAdminHoroscopes(req, res));
router.post("/admin", requireAuth, requireAdmin, (req, res) => horoscopeController.saveHoroscope(req, res));
router.put("/admin/:id", requireAuth, requireAdmin, (req, res) => horoscopeController.updateHoroscope(req, res));
router.patch("/admin/:id/status", requireAuth, requireAdmin, (req, res) => horoscopeController.updateStatus(req, res));
router.delete("/admin/:id", requireAuth, requireAdmin, (req, res) => horoscopeController.deleteHoroscope(req, res));

module.exports = router;
