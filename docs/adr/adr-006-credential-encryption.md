# ADR-006: Credential Encryption — AES-256-GCM at Rest

## Status

Accepted

## Date

2025-01-01

## Context

Camera credentials (passwords used for VAPIX HTTP authentication) must be stored in the database
so the polling service can authenticate against cameras without prompting an operator each time.
Storing passwords as plaintext means a database file disclosure (backup exfiltration, directory
traversal, misconfigured file permissions) immediately exposes all camera credentials.

The system already requires a `SESSION_SECRET` environment variable for Express session signing.
Deriving an encryption key from this secret avoids introducing a second secret that operators
must manage.

## Decision

Camera passwords are encrypted with **AES-256-GCM** before storage and decrypted transparently
in `server/storage.ts` before being passed to the VAPIX HTTP client.

Implementation in `server/credentialEncryption.ts`:

1. **Key derivation**: `crypto.scryptSync(SESSION_SECRET, 'axis-camera-salt', 32)` produces a
   256-bit key deterministically from the session secret. The salt is a fixed application-level
   constant (not per-credential) because the scrypt cost parameters already make brute-force
   of the master secret infeasible.
2. **Encryption**: `crypto.createCipheriv('aes-256-gcm', key, iv)` with a fresh 16-byte
   random IV per encryption operation.
3. **Storage format**: The three components are concatenated as hex strings separated by colons:
   `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
4. **Decryption**: The stored string is split on `:`. If it does not contain exactly three
   colon-separated segments, it is treated as a legacy plaintext password and returned as-is
   (backward compatibility fallback).
5. **GCM authentication tag**: The 16-byte auth tag is verified on decryption; a tampered
   ciphertext raises an exception rather than returning garbage.

## Consequences

### Positive

- Credentials at rest are protected by authenticated encryption. An attacker who obtains the
  database file cannot read camera passwords without also knowing `SESSION_SECRET`.
- GCM authentication tag detects both accidental corruption and deliberate tampering.
- Per-encrypt random IV ensures that two cameras with the same password produce different
  ciphertexts.
- Transparent in `storage.ts` — route handlers and the camera monitor never see raw encrypted
  strings.

### Negative

- Key derivation is tied to `SESSION_SECRET`. Rotating the session secret (e.g., after a
  suspected compromise) invalidates all stored encrypted credentials — every camera password
  must be re-entered.
- The fixed salt (`'axis-camera-salt'`) means the derived key is deterministic for a given
  `SESSION_SECRET` value. There is no per-installation key hardening beyond the entropy of the
  secret itself.
- If `SESSION_SECRET` is lost (e.g., environment variable deleted), all encrypted credentials
  become permanently unrecoverable.

### Neutral

- The plaintext legacy fallback allows cameras added before encryption was introduced to
  continue working, but it means the system cannot distinguish between "old plaintext" and
  "accidentally stored plaintext". A one-time migration to encrypt all plaintext values should
  be run and the fallback removed.

## Technical Debt

1. **`SESSION_SECRET` dual use**: It serves as both the Express session signing secret and the
   root for credential key derivation. These concerns should ideally be separated into two
   distinct environment variables (`SESSION_SECRET` and `CREDENTIAL_ENCRYPTION_KEY`).
2. **Legacy plaintext fallback**: The fallback should be replaced with a one-time migration
   script that detects unencrypted values and re-encrypts them, after which the fallback path
   can be removed.
3. **No key rotation mechanism**: There is no tooling to re-encrypt all credentials when the
   master secret changes. A `scripts/rotate-credentials.ts` utility should be created.

## Related

- ADR-003: Schema Design — Shared schema.ts as Single Source of Truth
- ADR-005: Authentication — Passport Local + SQLite Sessions
- ADR-008: VAPIX Auth — Custom HTTP Digest Implementation
