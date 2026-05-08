/**
 * Reset a user's password.
 * Usage: npx tsx scripts/resetUserPassword.ts <email> <newPassword>
 */

import { storage } from "../server/storage";
import bcrypt from "bcryptjs";

async function main() {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.error("Usage: npx tsx scripts/resetUserPassword.ts <email> <newPassword>");
    process.exit(1);
  }

  const user = await storage.getUserByEmail(email);
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await storage.updateUser(user.id, { password: hashed });
  console.log(`Password reset for ${email} (id=${user.id}).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
