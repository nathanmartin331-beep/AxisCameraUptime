import { storage } from "./storage";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// Generate secure default credentials from environment or generate random ones
function getSecureDefaultUser() {
  const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@local";
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');

  // In production, ensure credentials are set via environment variables
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.DEFAULT_ADMIN_EMAIL || !process.env.DEFAULT_ADMIN_PASSWORD) {
      throw new Error(
        'SECURITY ERROR: DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set in production environment'
      );
    }
  }

  return {
    email: defaultEmail,
    firstName: process.env.DEFAULT_ADMIN_FIRSTNAME || "Admin",
    lastName: process.env.DEFAULT_ADMIN_LASTNAME || "User",
    password: defaultPassword,
  };
}

export async function ensureDefaultUser() {
  try {
    const DEFAULT_USER = getSecureDefaultUser();
    const existingUser = await storage.getUserByEmail(DEFAULT_USER.email);

    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(DEFAULT_USER.password, 12);
      await storage.createUser({
        email: DEFAULT_USER.email,
        firstName: DEFAULT_USER.firstName,
        lastName: DEFAULT_USER.lastName,
        password: hashedPassword,
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Setup] Default user created: ${DEFAULT_USER.email}`);
        console.log(`[Setup] Generated password: ${DEFAULT_USER.password}`);
        console.log("[Setup] You can change these credentials in Settings");
      } else {
        console.log("[Setup] Default admin user created successfully");
      }
    }
  } catch (error) {
    console.error("[Setup] Error creating default user:", error);
    if (process.env.NODE_ENV === 'production') {
      throw error; // Fail fast in production
    }
  }
}

export function getDefaultCredentials() {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Getting default credentials is not allowed in production');
  }

  return getSecureDefaultUser();
}
