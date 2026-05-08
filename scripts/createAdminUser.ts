/**
 * Create an admin user.
 * Usage: npx tsx scripts/createAdminUser.ts <email> <password> [firstName] [lastName]
 */

import { storage } from "../server/storage";
import bcrypt from "bcryptjs";

async function main() {
  const [email, password, firstName = "Admin", lastName = "User"] = process.argv.slice(2);

  if (!email || !password) {
    console.error("Usage: npx tsx scripts/createAdminUser.ts <email> <password> [firstName] [lastName]");
    process.exit(1);
  }

  const existing = await storage.getUserByEmail(email);
  if (existing) {
    if (existing.role !== "admin") {
      await storage.updateUser(existing.id, { role: "admin" });
      console.log(`Existing user ${email} promoted to admin.`);
    } else {
      console.log(`User ${email} already exists as admin. No changes made.`);
    }
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await storage.createUser({
    email,
    firstName,
    lastName,
    password: hashedPassword,
    role: "admin",
  });

  console.log(`Admin user created: ${user.email} (id=${user.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to create admin user:", err);
    process.exit(1);
  });
