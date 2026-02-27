import crypto from "crypto";
import { db, sqlite } from "./db";
import { cameras } from "@shared/schema";
import { getSessionSecret } from "./sessionSecret";
import { encryptPassword } from "./encryption";

const ALGORITHM = "aes-256-gcm";
const LEGACY_SECRET = "your-secret-key-change-in-production";

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, "axis-camera-salt", 32);
}

function tryDecrypt(encryptedPassword: string, secret: string): string | null {
  try {
    const [ivHex, authTagHex, ciphertext] = encryptedPassword.split(":");
    const key = deriveKey(secret);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * One-time migration: re-encrypt camera passwords from the legacy hardcoded
 * key to the current session secret. Skips passwords that already decrypt
 * with the current key, and skips unencrypted/legacy plaintext passwords.
 */
export async function migrateEncryptionKeys(): Promise<void> {
  const currentSecret = getSessionSecret();

  // If the current secret IS the legacy secret, nothing to migrate
  if (currentSecret === LEGACY_SECRET) return;

  const allCameras = await db.select({
    id: cameras.id,
    encryptedPassword: cameras.encryptedPassword,
  }).from(cameras);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const cam of allCameras) {
    const ep = cam.encryptedPassword;

    // Skip unencrypted / non-AES passwords (no colons = plaintext or bcrypt)
    if (!ep.includes(":") || ep.split(":").length !== 3) {
      skipped++;
      continue;
    }

    // Try current key first — if it works, already migrated
    if (tryDecrypt(ep, currentSecret) !== null) {
      skipped++;
      continue;
    }

    // Try legacy key
    const plaintext = tryDecrypt(ep, LEGACY_SECRET);
    if (plaintext === null) {
      failed++;
      console.warn(`[Migration] Camera ${cam.id}: could not decrypt with current or legacy key`);
      continue;
    }

    // Re-encrypt with current key
    const newEncrypted = await encryptPassword(plaintext);
    sqlite.prepare("UPDATE cameras SET encrypted_password = ? WHERE id = ?")
      .run(newEncrypted, cam.id);
    migrated++;
  }

  if (migrated > 0) {
    console.log(`[Migration] Re-encrypted ${migrated} camera password(s) to new key`);
  }
  if (failed > 0) {
    console.warn(`[Migration] ${failed} camera(s) could not be migrated — re-add credentials manually`);
  }
  if (migrated === 0 && failed === 0) {
    console.log("[Migration] All camera passwords already using current key");
  }
}
