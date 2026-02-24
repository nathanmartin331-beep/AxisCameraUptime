# ADR-005: Authentication — Passport Local + SQLite Sessions

## Status

Accepted

## Date

2025-01-01

## Context

The application needs to protect its API from unauthenticated access. The deployment model is a
single self-hosted instance on a private network, accessed by a small number of operations
personnel. There is no requirement for federated identity, social login, or per-user API keys.
The Replit scaffold installed several authentication packages that were not ultimately used:
`openid-client` (for Replit Auth via OIDC), `session-file-store`, `memorystore`, and
`connect-pg-simple`.

Evaluated alternatives:

- **JWT (stateless)**: Eliminates the need for a session store. However, implementing token
  revocation cleanly (for logout) requires either a denylist (database) or short expiry +
  refresh tokens, which adds complexity that is unnecessary for a small internal tool.
- **Replit Auth (OIDC via `openid-client`)**: Suitable when the application is hosted on
  Replit and users have Replit accounts. Not viable for self-hosted deployments where users
  have no Replit accounts.
- **Firebase / Auth0**: Managed identity providers. Introduce external dependencies,
  per-seat costs, and outage risk for what is an entirely self-contained tool.

## Decision

Use **`passport-local`** strategy with **`bcrypt`** (cost factor 12) for password hashing and
**`better-sqlite3-session-store`** (SQLite-backed) for server-side session storage.

Two roles are defined:

- **`admin`**: Full CRUD access to cameras, users, settings, and credentials. Can create and
  delete user accounts.
- **`viewer`**: Read-only access to camera status, uptime history, and analytics dashboards.
  Cannot access credential endpoints or user management.

Role enforcement is implemented via middleware (`requireAuth`, `requireAdmin`) applied at the
router level in `server/routes/`.

Session configuration:

- Cookie `httpOnly: true`, `sameSite: 'lax'`, `secure: true` when `NODE_ENV=production`.
- Session secret sourced from `SESSION_SECRET` environment variable.
- Sessions expire after a configurable idle timeout (default 24 hours).

The initial admin account is seeded at startup if no users exist in the database.

## Consequences

### Positive

- Entirely self-contained — no external identity provider, no network dependency for
  authentication.
- SQLite session store means sessions persist across server restarts; no session invalidation
  on deploy.
- Passport's pluggable strategy interface means adding LDAP or SAML later requires adding a
  strategy without rewriting the auth middleware.
- bcrypt cost factor 12 provides strong resistance to offline brute-force on the stored hashes.

### Negative

- Cookie-session approach requires CSRF protection for state-changing requests. Express's
  default cookie handling does not include CSRF tokens out of the box; this must be enforced via
  `sameSite: 'lax'` and origin validation.
- Role model is coarse-grained (two roles). Fine-grained per-camera or per-location permissions
  are not supported without a more elaborate RBAC implementation.
- No account lockout after repeated failed login attempts is currently implemented, which allows
  online brute-force against the login endpoint.

### Neutral

- The session store uses the same SQLite database file as the application data, so a single
  backup captures both.
- For a future multi-instance deployment, the SQLite session store would need to be replaced
  with Redis or PostgreSQL to allow shared session state.

## Technical Debt

1. **Dead authentication dependencies**: `openid-client`, `session-file-store`, `memorystore`,
   and `connect-pg-simple` are installed but unused. They should be removed from `package.json`
   to reduce supply chain risk and install size.
2. **No brute-force protection**: An account lockout or rate-limiting mechanism on
   `POST /api/auth/login` should be added.
3. **No CSRF token implementation**: The application relies solely on `sameSite=lax` for CSRF
   mitigation. An explicit CSRF token (e.g., via `csurf` or a double-submit cookie) should be
   evaluated for higher-assurance deployments.

## Related

- ADR-001: Runtime Stack — Node.js + Express (ESM)
- ADR-006: Credential Encryption — AES-256-GCM at Rest
- ADR-011: Routing — Module-Per-Domain Router
