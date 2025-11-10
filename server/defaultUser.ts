import { storage } from "./storage";
import bcrypt from "bcryptjs";

const DEFAULT_USER = {
  email: "admin@local",
  firstName: "Admin",
  lastName: "User",
  password: "admin123",
};

export async function ensureDefaultUser() {
  try {
    const existingUser = await storage.getUserByEmail(DEFAULT_USER.email);
    
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(DEFAULT_USER.password, 12);
      await storage.createUser({
        email: DEFAULT_USER.email,
        firstName: DEFAULT_USER.firstName,
        lastName: DEFAULT_USER.lastName,
        password: hashedPassword,
      });
      console.log("[Setup] Default user created: admin@local / admin123");
      console.log("[Setup] You can change these credentials in Settings");
    }
  } catch (error) {
    console.error("[Setup] Error creating default user:", error);
  }
}

export function getDefaultCredentials() {
  return {
    email: DEFAULT_USER.email,
    password: DEFAULT_USER.password,
  };
}
