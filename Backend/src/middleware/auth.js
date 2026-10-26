const { requireAuth, optionalAuth } = require("./auth.middleware");
const { requireAdmin } = require("./admin.middleware");

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin
};
