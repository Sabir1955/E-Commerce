const router = require("express").Router();
const Address = require("../models/Address");
const { requireAuth } = require("../middleware/auth");
const { pagination, isValidIndianMobile } = require("../utils/request");

router.use(requireAuth);

router.get("/", async (req, res) => {
  const page = pagination(req.query);
  if (page.error) return res.status(400).json({ message: page.error });
  const filter = { user: req.user._id };
  const [addresses, total] = await Promise.all([
    Address.find(filter).sort({ isDefault: -1, createdAt: -1 }).skip(page.skip).limit(page.limit),
    Address.countDocuments(filter)
  ]);
  res.json({ addresses, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
});

router.post("/", async (req, res) => {
  const required = ["fullName", "address", "city", "state", "postalCode", "country"];
  if (required.some((field) => !req.body[field])) {
    return res.status(400).json({ message: "All delivery address fields except mobile are required" });
  }
  if (required.some((field) => typeof req.body[field] !== "string" || !req.body[field].trim() || req.body[field].trim().length > ({ fullName: 100, address: 500, city: 100, state: 100, postalCode: 12, country: 100 }[field]))) {
    return res.status(400).json({ message: "Address fields must be text and within their allowed lengths" });
  }
  const useRegisteredMobile = req.body.useRegisteredMobile !== false;
  const mobile = useRegisteredMobile ? req.user.mobile : req.body.mobile;
  if (!mobile) {
    return res.status(400).json({
      message: "Provide a different mobile number or add a registered mobile number to your profile"
    });
  }
  if (!isValidIndianMobile(mobile)) return res.status(400).json({ message: "Enter a valid Indian mobile number" });
  const isDefault = Boolean(req.body.isDefault);
  if (isDefault) await Address.updateMany({ user: req.user._id }, { isDefault: false });
  const address = await Address.create({
    fullName: req.body.fullName,
    mobile,
    useRegisteredMobile,
    address: req.body.address,
    city: req.body.city,
    state: req.body.state,
    postalCode: req.body.postalCode,
    country: req.body.country,
    isDefault,
    user: req.user._id
  });
  res.status(201).json(address);
});

router.patch("/:id", async (req, res) => {
  const allowedFields = ["fullName", "address", "city", "state", "postalCode", "country"];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (req.body.useRegisteredMobile !== undefined) {
    if (typeof req.body.useRegisteredMobile !== "boolean") return res.status(400).json({ message: "useRegisteredMobile must be a boolean" });
    updates.useRegisteredMobile = req.body.useRegisteredMobile;
    updates.mobile = updates.useRegisteredMobile ? req.user.mobile : req.body.mobile;
    if (!updates.mobile) {
      return res.status(400).json({ message: "Provide a different mobile number when useRegisteredMobile is false" });
    }
  } else if (req.body.mobile !== undefined) {
    updates.useRegisteredMobile = false;
    updates.mobile = req.body.mobile;
  }
  if (updates.mobile && !isValidIndianMobile(updates.mobile)) return res.status(400).json({ message: "Enter a valid Indian mobile number" });
  for (const [field, value] of Object.entries(updates)) {
    const max = { fullName: 100, address: 500, city: 100, state: 100, postalCode: 12, country: 100 }[field];
    if (max && (typeof value !== "string" || !value.trim() || value.trim().length > max)) {
      return res.status(400).json({ message: `${field} must be non-empty text of at most ${max} characters` });
    }
  }
  if (req.body.isDefault === true) {
    if (!await Address.exists({ _id: req.params.id, user: req.user._id })) return res.status(404).json({ message: "Address not found" });
    await Address.updateMany({ user: req.user._id }, { isDefault: false });
    updates.isDefault = true;
  }
  const address = await Address.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    updates,
    { new: true, runValidators: true }
  );
  if (!address) return res.status(404).json({ message: "Address not found" });
  res.json(address);
});

router.delete("/:id", async (req, res) => {
  const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!address) return res.status(404).json({ message: "Address not found" });
  res.json({ message: "Address deleted" });
});

module.exports = router;
