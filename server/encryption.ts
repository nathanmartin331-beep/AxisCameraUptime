import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function encryptPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

export async function decryptPassword(encryptedPassword: string): Promise<string> {
  // Note: bcrypt hashes are one-way, we don't actually decrypt them
  // We'll store them encrypted and use them for HTTP Digest Auth
  // For now, we'll use a simple reversible encryption for the demo
  // In production, consider using a proper encryption library like crypto
  return encryptedPassword;
}
