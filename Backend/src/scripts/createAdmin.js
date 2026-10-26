require("dotenv").config();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { connectDatabase, disconnectDatabase } = require("../config/database");

async function createAdmin() {
  const { ADMIN_NAME = "Store Admin", ADMIN_EMAIL = "admin@example.com", ADMIN_MOBILE = "+919876543210", ADMIN_PASSWORD = "Admin@12345" } = process.env;
  if (ADMIN_PASSWORD.length < 6) throw new Error("ADMIN_PASSWORD must be at least 6 characters");

  await connectDatabase();
  const password = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await User.findOneAndUpdate(
    { email: ADMIN_EMAIL.toLowerCase() },
    {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL.toLowerCase(),
      mobile: ADMIN_MOBILE,
      password,
      role: "admin",
      active: true
    },
    { new: true, upsert: true }
  );
  console.log(`Admin account ready in PostgreSQL: ${admin.email}`);
  await disconnectDatabase();
}

createAdmin().catch(async (error) => {
  console.error("Unable to create admin:", error.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
