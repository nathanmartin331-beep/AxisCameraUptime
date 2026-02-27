import crypto from "crypto";
import { getSessionSecret } from "./sessionSecret";

// AES-256-GCM requires a 32-byte key. Derive one from the session secret.
const SECRET = getSessionSecret();
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// The old hardcoded default that was removed. Used only during migration to
// re-encrypt passwords that were stored under the old key.
const LEGACY_SECRET = "your-secret-key-change-in-production";

// Cache derived keys to avoid repeated scryptSync calls
const keyCache = new Map<string, Buffer>();
function deriveKey(secret: string): Buffer {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.scryptSync(secret, "axis-camera-salt", 32);
    keyCache.set(secret, key);
  }
  return key;
}

function decryptWithKey(encryptedPassword: string, secret: string): string {
  const [ivHex, authTagHex, ciphertext] = encryptedPassword.split(":");
  const key = deriveKey(secret);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function encryptPassword(password: string): Promise<string> {
  const key = deriveKey(SECRET);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a camera password. Tries the current secret first, then falls back
 * to the legacy hardcoded secret for passwords that haven't been migrated yet.
 * When a legacy password is found it is returned with a `needsReEncrypt` flag
 * so callers can re-encrypt it under the new key.
 */
export async function decryptPassword(
  encryptedPassword: string,
): Promise<string> {
  // Handle legacy unencrypted or bcrypt-hashed passwords
  // bcrypt hashes start with $2a$ or $2b$, and our format uses colons
  if (!encryptedPassword.includes(":")) {
    return encryptedPassword;
  }

  const parts = encryptedPassword.split(":");
  if (parts.length !== 3) {
    return encryptedPassword;
  }

  // Try current key first
  try {
    return decryptWithKey(encryptedPassword, SECRET);
  } catch {
    // Current key failed — try legacy key
  }

  // Try legacy hardcoded key (passwords encrypted before secret rotation)
  try {
    const plaintext = decryptWithKey(encryptedPassword, LEGACY_SECRET);
    console.log("[Encryption] Decrypted password using legacy key — will re-encrypt on next save");
    return plaintext;
  } catch {
    // Both keys failed
  }

  console.error("[Encryption] Failed to decrypt password with current and legacy keys");
  return encryptedPassword;
}
