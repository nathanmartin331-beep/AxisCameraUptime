import { storage } from "../server/storage";
import bcrypt from "bcryptjs";

async function main() {
  const [email, password] = process.argv.slice(2);
  const user = await storage.getUserByEmail(email);
  if (!user) {
    console.log("NOT FOUND:", email);
    process.exit(1);
  }
  const ok = await bcrypt.compare(password, user.password);
  console.log({ id: user.id, email: user.email, role: user.role, passwordMatches: ok });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
