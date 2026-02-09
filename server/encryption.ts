import crypto from "crypto";

// AES-256-GCM requires a 32-byte key. Derive one from the session secret.
const SECRET = process.env.SESSION_SECRET || "your-secret-key-change-in-production";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Warn if SESSION_SECRET is not properly configured
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "your-secret-key-change-in-production") {
  console.warn("[SECURITY WARNING] SESSION_SECRET is not set or is using the default value. Camera passwords are NOT securely encrypted.");
}

// Cache the derived key so scryptSync is not called on every encrypt/decrypt
let _cachedKey: Buffer | null = null;
function deriveKey(secret: string): Buffer {
  if (!_cachedKey) {
    _cachedKey = crypto.scryptSync(secret, "axis-camera-salt", 32);
  }
  return _cachedKey;
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

export async function decryptPassword(encryptedPassword: string): Promise<string> {
  // Handle legacy unencrypted or bcrypt-hashed passwords
  // bcrypt hashes start with $2a$ or $2b$, and our format uses colons
  if (!encryptedPassword.includes(":")) {
    return encryptedPassword;
  }

  const parts = encryptedPassword.split(":");
  if (parts.length !== 3) {
    return encryptedPassword;
  }

  const [ivHex, authTagHex, ciphertext] = parts;

  const key = deriveKey(SECRET);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
