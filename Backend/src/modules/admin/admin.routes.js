const router = require("express").Router();
const adminController = require("./admin.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requireAdmin } = require("../../middleware/admin.middleware");

router.use(requireAuth, requireAdmin);

router.get("/dashboard", (req, res) => adminController.getDashboard(req, res));
router.get("/dashboard/summary", (req, res) => adminController.getDashboard(req, res));
router.get("/dashboard/sales", (req, res) => adminController.getSalesAnalytics(req, res));
router.get("/dashboard/orders", (req, res) => adminController.getOrdersAnalytics(req, res));
router.get("/dashboard/inventory", (req, res) => adminController.getInventoryAnalytics(req, res));
router.get("/reports/date-wise", (req, res) => adminController.getDateWiseReport(req, res));
router.get("/reports/date-wise/orders", (req, res) => adminController.getDateWiseOrders(req, res));
router.get("/reports/sales", (req, res) => adminController.getDateWiseReport(req, res));
router.get("/customers", (req, res) => adminController.listCustomers(req, res));

router.get("/customers/:id", (req, res) => adminController.getCustomerById(req, res));
router.patch("/customers/:id/status", (req, res) => adminController.updateCustomerStatus(req, res));
router.get("/inventory", (req, res) => adminController.getInventory(req, res));
router.get("/orders", (req, res) => adminController.listOrders(req, res));
router.patch("/products/:id/return-policy", (req, res) => adminController.updateProductReturnPolicy(req, res));
router.patch("/products/return-policy/bulk", (req, res) => adminController.bulkUpdateReturnPolicy(req, res));
router.get("/store-address", (req, res) => adminController.getStoreAddress(req, res));
router.put("/store-address", (req, res) => adminController.updateStoreAddress(req, res));
router.post("/store-address", (req, res) => adminController.updateStoreAddress(req, res));

module.exports = router;
