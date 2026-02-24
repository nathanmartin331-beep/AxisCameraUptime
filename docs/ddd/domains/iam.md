# Domain: Identity & Access

## Bounded Context

The Identity & Access (IAM) domain owns all concepts related to who is using the system and what they are permitted to do. It is the trust root of the platform: every other domain delegates access decisions to the middleware this context publishes.

This domain manages user registration, credential verification, session lifecycle, and role enforcement. It also owns the admin user management screen and the self-service profile/password change flows.

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **User** | A human operator with an email address, hashed password, first/last name, and a role. |
| **Session** | A server-side session (express-session) keyed by a session cookie. Contains the serialized user ID. |
| **Role** | One of `admin` or `viewer`. Admins can create, modify, and delete data. Viewers can only read. |
| **Authentication** | The act of verifying identity via email + password using Passport.js Local Strategy. |
| **Authorization** | Role-based decision enforced by `requireAuth` or `requireAdmin` middleware before any route handler executes. |
| **Rate Limiting** | A sliding-window counter that blocks brute-force login and registration attempts (5 attempts / 15 min for login; 3 / hour for registration). |
| **Safe User** | A `User` record with the `password` field stripped — the only form sent over the wire. |
| **Default User** | A seed admin account created on first run when no users exist, using credentials from environment variables. |

---

## Aggregate Roots

### User
The central aggregate of this domain. Owns identity data and role assignment.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| email | string | Unique, validated format |
| password | string | bcrypt hash (12 rounds), never returned to client |
| firstName | string \| null | |
| lastName | string \| null | |
| role | `"admin"` \| `"viewer"` | Default `"viewer"` |
| createdAt | Date | |

Invariants:
- At least one `admin` user must exist at all times (last-admin guard enforced on delete/demote).
- A user cannot delete or demote themselves.

### Session
Managed by `express-session` + `connect-sqlite3`. The domain serialises the user ID into the session store and deserialises it on each request via `passport.deserializeUser`.

---

## Value Objects

- **SafeUser** — `User` minus the `password` field. This is the shape sent to all API consumers and stored on `req.user`.
- **DefaultCredentials** — Email/password pair loaded from environment variables; used only for the seed admin account.

---

## Domain Events

| Event | Published by | Consumed by |
|-------|-------------|-------------|
| `UserRegistered` | `POST /register` | (implicit: session auto-login) |
| `UserLoggedIn` | `POST /login` | Session store |
| `UserLoggedOut` | `POST /logout` | Session store |
| `PasswordChanged` | `POST /change-password` | (implicit: bcrypt re-hash stored) |
| `UserCreatedByAdmin` | `POST /users` | (none — future: email notification) |
| `UserRoleChanged` | `PATCH /users/:id` | (none — future: audit log) |

These are not published to a message bus; they manifest as side-effects within the request handlers.

---

## Anti-Corruption Layer

- **Password hashing**: Plaintext passwords are hashed with bcrypt immediately on entry. They are never stored or logged in plaintext.
- **SafeUser projection**: The `sanitizeUser()` helper and `SafeUser` type ensure the `password` hash never crosses the domain boundary into API responses.
- **Middleware guards**: `requireAuth` and `requireAdmin` are the only entry points through which other domains interact with IAM. No other domain reads the `users` table directly.
- **Input validation**: All inbound payloads are parsed through Zod schemas before any persistence operation.
- **Development-only auto-login**: The `/auto-login` endpoint is unconditionally blocked unless `NODE_ENV === 'development'`, preventing accidental exposure in production.

---

## Server Files

| File | Responsibility |
|------|---------------|
| `server/auth.ts` | Passport Local Strategy configuration, `requireAuth`/`requireAdmin` middleware, `hashPassword`/`verifyPassword` helpers |
| `server/authRoutes.ts` | REST handlers: register, login, logout, /me, change-password, admin user management (list/create/update/delete) |
| `server/defaultUser.ts` | Seeds the default admin user on first boot from environment variables |
| `server/encryption.ts` | AES-256 encryption/decryption for camera passwords (shared with Camera Registry) |

---

## Client Files

| File | Responsibility |
|------|---------------|
| `client/src/pages/Users.tsx` | Admin user management UI (list, create, edit, delete users) |
| `client/src/pages/Settings.tsx` | Self-service profile edit and password change (shared with User Settings domain) |
| `client/src/hooks/useAuth.ts` | React Query hook: fetches current user from `GET /api/auth/me` |
| `client/src/hooks/useAuthMutation.ts` | React Query mutation hooks: login, logout, register |
| `client/src/lib/authUtils.ts` | Client-side helpers (role checks, redirect guards) |

---

## API Endpoints

All routes are mounted under `/api/auth/`.

| Method | Path | Auth Required | Role | Description |
|--------|------|--------------|------|-------------|
| POST | `/api/auth/register` | No | — | Register a new user (rate-limited: 3/hr) |
| POST | `/api/auth/login` | No | — | Authenticate with email + password (rate-limited: 5/15 min) |
| POST | `/api/auth/logout` | Yes | any | Destroy session |
| GET | `/api/auth/me` | Yes | any | Return current Safe User |
| POST | `/api/auth/change-password` | Yes | any | Verify old password and set new hash |
| PATCH | `/api/auth/me` | Yes | any | Update own first/last name |
| GET | `/api/auth/users` | Yes | admin | List all users |
| POST | `/api/auth/users` | Yes | admin | Create a new user with specified role |
| PATCH | `/api/auth/users/:id` | Yes | admin | Update user profile, email, role, or password |
| DELETE | `/api/auth/users/:id` | Yes | admin | Delete user (blocks last-admin deletion) |
| POST | `/api/auth/auto-login` | No | — | Development-only: create session for default user |

---

## Dependencies

### What this domain depends on
- `server/storage.ts` — User CRUD operations (`createUser`, `getUserByEmail`, `getSafeUser`, `updateUser`, `deleteUser`, `getAllUsers`)
- `bcryptjs` — Password hashing
- `passport` / `passport-local` — Authentication strategy
- `express-session` / `connect-sqlite3` — Session persistence
- `express-rate-limit` — Rate limiting

### What depends on this domain
All other domains consume `requireAuth` and/or `requireAdmin` middleware from `server/auth.ts`. No other domain is permitted to read user credentials directly.
