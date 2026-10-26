const router = require("express").Router();
const PickupLocation = require("../models/PickupLocation");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", requireAdmin, async (req, res) => {
  const locations = await PickupLocation.find({ active: true }).sort({ isDefault: -1, name: 1 });
  res.json({ locations });
});

router.post("/", requireAdmin, async (req, res) => {
  const required = ["name", "contactName", "phone", "address", "city", "state", "postalCode"];
  if (required.some((field) => !req.body[field])) {
    return res.status(400).json({ message: "All pickup location fields are required" });
  }
  if (req.body.isDefault) await PickupLocation.updateMany({}, { isDefault: false });
  const location = await PickupLocation.create(req.body);
  res.status(201).json(location);
});

router.patch("/:id", requireAdmin, async (req, res) => {
  if (req.body.isDefault) await PickupLocation.updateMany({ _id: { $ne: req.params.id } }, { isDefault: false });
  const location = await PickupLocation.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  if (!location) return res.status(404).json({ message: "Pickup location not found" });
  res.json(location);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  if (req.query.soft === "true") {
    const location = await PickupLocation.findByIdAndUpdate(req.params.id, { active: false, isDefault: false }, { new: true });
    if (!location) return res.status(404).json({ message: "Pickup location not found" });
    return res.json({ message: "Pickup location archived" });
  }
  const location = await PickupLocation.findByIdAndDelete(req.params.id);
  if (!location) return res.status(404).json({ message: "Pickup location not found" });
  res.json({ message: "Pickup location deleted successfully" });
});

module.exports = router;
