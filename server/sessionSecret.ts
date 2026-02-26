import crypto from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SECRET_FILE = join(__dirname, "..", "data", ".session-secret");

/**
 * Get or generate a stable session secret.
 *
 * Priority:
 * 1. SESSION_SECRET env var (explicit override — recommended for production)
 * 2. Persisted secret in data/.session-secret (auto-generated on first run)
 *
 * The hardcoded default "your-secret-key-change-in-production" is never used.
 */
export function getSessionSecret(): string {
  // 1. Env var takes priority
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && envSecret !== "your-secret-key-change-in-production") {
    return envSecret;
  }

  // 2. Read persisted secret from disk
  try {
    const stored = readFileSync(SECRET_FILE, "utf-8").trim();
    if (stored.length >= 32) {
      return stored;
    }
  } catch {
    // File doesn't exist yet — generate below
  }

  // 3. Generate a cryptographically strong secret and persist it
  const generated = crypto.randomBytes(48).toString("base64url");

  try {
    mkdirSync(dirname(SECRET_FILE), { recursive: true });
    writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
    console.log("[Security] Generated and saved session secret to data/.session-secret");
  } catch (err) {
    console.warn("[Security] Could not persist session secret to disk:", err);
    console.warn("[Security] Secret will be regenerated on next restart — sessions and encrypted passwords will be invalidated.");
  }

  return generated;
}
