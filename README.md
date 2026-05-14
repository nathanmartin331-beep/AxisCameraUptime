# Axis Camera Uptime Monitor

> Self-hosted monitoring, analytics, and reporting for Axis network cameras: real-time uptime tracking, reliability metrics, people/occupancy analytics, scheduled email reports, and webhook delivery for downstream systems.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000.svg)](https://expressjs.com/)

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Building for Production](#building-for-production)
- [Deployment](#deployment)
  - [Windows Service (NSSM)](#windows-service-nssm)
  - [Linux systemd](#linux-systemd)
  - [HTTPS / TLS](#https--tls)
  - [Default Admin Credentials](#default-admin-credentials)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Email & SendGrid](#email--sendgrid)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

### Monitoring
- Real-time uptime tracking with per-user polling intervals
- VAPIX-based health checks (HTTP/HTTPS), TOFU certificate pinning, and per-camera cert validation modes (`none`, `pinned`, `ca`)
- ICMP/HTTP/TCP probes, response-time tracking, daily and hourly rollups for fleets of 2,500+ cameras
- Reliability metrics: MTBF, MTTR, availability %, failure rate

### Camera Management
- Manual entry, CSV import/export, bulk add (≤50 per request)
- Network discovery: subnet scan, CIDR scan, Bonjour, SSDP, HTTP probing
- Camera model auto-detection
- Camera groups with member rosters and admin-only mutations

### Analytics
- People-in / people-out / occupancy / line-crossing / average dwell time
- Per-scenario breakdowns and daily history
- Fleet-wide summary endpoint

### Reporting
- CSV export of cameras, uptime, and analytics
- On-demand emailed analytics report (`POST /api/reports/analytics/email`)
- **Scheduled email reports** (daily/weekly/monthly) per user, dispatched by a cron job at :05 every hour

### Integrations
- **SendGrid** for outbound email (API key stored encrypted in the database, configurable from the Settings UI)
- **API keys** (`X-API-Key`) for read-only programmatic access to cameras and analytics
- **Webhook subscriptions** with HMAC-signed deliveries for camera status and analytics events
- **Server-Sent Events** stream for live status changes (`GET /api/notifications/stream`)

### Security
- Local email/password auth via Passport.js, bcrypt password hashing
- SQLite-backed session store (avoids the Windows EPERM issues that file-based stores hit)
- Helmet-style security headers; HSTS automatically enabled when HTTPS is on
- Rate limiting on auth, scan, and bulk-add endpoints
- Role-based access (`admin`, `viewer`); admin-only routes for all destructive actions

## Tech Stack

### Frontend
- React 18.3 + TypeScript, Vite 5.4
- Wouter for routing, TanStack Query for server state
- Radix UI + Tailwind CSS, Recharts for charts, React Hook Form + Zod for forms

### Backend
- Node.js + TypeScript (ESM, esbuild bundle)
- Express 4.21, Passport.js (local strategy)
- SQLite via Drizzle ORM 0.39 and `better-sqlite3` (WAL mode, 256MB mmap, 64MB cache)
- `better-sqlite3-session-store` for sessions
- `@sendgrid/mail` for email, `node-cron` for the report scheduler

### Testing / Build
- Vitest 4.0 + Supertest
- TypeScript 5.6, esbuild for server, Vite for client

## Quick Start

### Prerequisites
- Node.js 18 or later
- npm

### Setup

```bash
git clone https://github.com/4S-Security-LLC/AxisUptimeUtility.git
cd AxisUptimeUtility
npm install
cp .env.example .env       # then edit .env (see Configuration below)
npm run db:push            # initialize schema in the SQLite file
npm run dev                # start dev server on http://localhost:5000
```

The first run creates a default admin user. In development the password is printed to the console; in production you **must** set `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` in `.env` or startup will fail (see [Default Admin Credentials](#default-admin-credentials)).

## Configuration

All configuration is via environment variables loaded from `.env` (which is gitignored — never commit it).

### Required

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `SESSION_SECRET` | Long random string used to sign session cookies. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DEFAULT_ADMIN_EMAIL` | **Required in production** — startup throws otherwise |
| `DEFAULT_ADMIN_PASSWORD` | **Required in production** — startup throws otherwise |

### Optional

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | TCP port to listen on (binds `0.0.0.0`) |
| `DATABASE_URL` | `./data/camera-uptime.db` | SQLite file path. Supports a `sqlite:` prefix which is stripped. |
| `DEFAULT_ADMIN_FIRSTNAME` | `Admin` | Default admin first name |
| `DEFAULT_ADMIN_LASTNAME` | `User` | Default admin last name |
| `SSL_CERT_PATH` | — | PEM certificate for HTTPS. If set together with `SSL_KEY_PATH`, the server starts in HTTPS mode and sets `secure` session cookies + HSTS. |
| `SSL_KEY_PATH` | — | PEM private key for HTTPS |
| `SSL_CA_PATH` | — | Optional CA bundle for intermediate certs |
| `POLL_CONCURRENCY` | `25` | Max concurrent camera polls |
| `ANALYTICS_POLL_INTERVAL` | `1` | Minutes between analytics polls |
| `CAMERA_CA_PATH` | — | CA bundle used to validate camera HTTPS endpoints when a camera uses `ca` cert validation mode |

> **Note:** A number of variables that appeared in older `.env.example` files (`DEFAULT_CHECK_INTERVAL`, `DEFAULT_TIMEOUT`, `BCRYPT_ROUNDS`, `RATE_LIMIT_*`, `SMTP_*`, `ENABLE_*`, `REPLIT_DOMAINS`, etc.) are **not** read by the current code. They have been removed from `.env.example`. SMTP is replaced by SendGrid configured via the Settings UI (see [Email & SendGrid](#email--sendgrid)).

## Building for Production

```bash
npm run build       # vite build (client) + esbuild bundle (server) → dist/
npm run check       # TypeScript type check
npm test            # Vitest run
npm start           # cross-env NODE_ENV=production node --env-file-if-exists=.env dist/index.js
```

The `start` script loads `.env` automatically via Node's `--env-file-if-exists` flag. The server binds `0.0.0.0:$PORT` (default `5000`).

## Deployment

### Windows Service (NSSM)

This is the recommended way to run the app persistently on Windows. [NSSM](https://nssm.cc/) (Non-Sucking Service Manager) wraps the Node process so it restarts on failure and starts at boot.

1. **Build the app** in your working directory:
   ```powershell
   npm run build
   ```

2. **Install NSSM** somewhere on disk (e.g. `C:\Tools\nssm\nssm-2.24\win64\nssm.exe`).

3. **Create the service from an elevated PowerShell:**
   ```powershell
   $nssm = "C:\Tools\nssm\nssm-2.24\win64\nssm.exe"
   $dir  = "C:\path\to\AxisUptimeUtility"
   $node = "C:\Program Files\nodejs\node.exe"   # or wherever node lives

   & $nssm install AxisCameraUptime $node "--env-file-if-exists=.env dist/index.js"
   & $nssm set AxisCameraUptime AppDirectory $dir
   & $nssm set AxisCameraUptime AppEnvironmentExtra "NODE_ENV=production"
   & $nssm set AxisCameraUptime AppStdout "$dir\logs\stdout.log"
   & $nssm set AxisCameraUptime AppStderr "$dir\logs\stderr.log"
   & $nssm set AxisCameraUptime Start SERVICE_AUTO_START
   & $nssm start AxisCameraUptime
   ```

4. **Verify it's running:**
   ```powershell
   sc.exe queryex AxisCameraUptime
   ```
   You want `STATE : 4 RUNNING`. If you see `7 PAUSED`, NSSM is throttling because the child keeps crashing — read `logs\stderr.log` for the actual error.

**Caveats:**
- NSSM sets `NODE_ENV=production` via `AppEnvironmentExtra`, which **overrides** any `NODE_ENV` in `.env`. The production-only check in `server/defaultUser.ts` fires under the service, so `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` must be set in `.env`.
- NSSM commands require an Administrator PowerShell. A non-elevated shell returns `OpenService(): Access is denied.`
- If you run `npm run dev` while the service is up, both will try to bind port 5000. Stop the service first (`nssm stop AxisCameraUptime`) or run dev on a different `PORT`.
- The service runs as `LocalSystem` by default. For tighter isolation, change the identity with `nssm set AxisCameraUptime ObjectName .\<user> <password>` and make sure that user can read the project directory.

### Linux systemd

```ini
# /etc/systemd/system/axis-camera-uptime.service
[Unit]
Description=Axis Camera Uptime Monitor
After=network.target

[Service]
Type=simple
User=axis
WorkingDirectory=/opt/AxisUptimeUtility
ExecStart=/usr/bin/node --env-file-if-exists=.env dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
StandardOutput=append:/var/log/axis-camera-uptime/stdout.log
StandardError=append:/var/log/axis-camera-uptime/stderr.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now axis-camera-uptime
sudo journalctl -u axis-camera-uptime -f
```

### HTTPS / TLS

Set `SSL_CERT_PATH` and `SSL_KEY_PATH` to PEM files in `.env`. Optionally set `SSL_CA_PATH` for intermediate certificates. When both cert and key are present and readable, the server starts an HTTPS listener (instead of HTTP), enables `Secure` session cookies, and emits an HSTS header.

```env
SSL_CERT_PATH=C:\certs\camera-uptime.crt
SSL_KEY_PATH=C:\certs\camera-uptime.key
SSL_CA_PATH=C:\certs\ca-bundle.crt
```

### Default Admin Credentials

On first startup, if no user exists with `DEFAULT_ADMIN_EMAIL`, the app creates one as an admin.

- **Development** (`NODE_ENV=development`): if `DEFAULT_ADMIN_PASSWORD` is unset, a random 16-byte hex password is generated and **printed to the console**. Watch the dev server output on first run.
- **Production** (`NODE_ENV=production`): startup **throws** with `SECURITY ERROR: DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set in production environment` if either variable is missing. Set both in `.env` before starting the service.

Change the password from the Settings page after first login. The default user's role is upgraded to `admin` automatically if it isn't already.

## Project Structure

```
AxisUptimeUtility/
├── client/                          # React + Vite frontend
│   ├── src/
│   │   ├── components/              # Reusable UI (Radix-based)
│   │   ├── pages/                   # Dashboard, Cameras, Groups, Reports, Settings, Users, etc.
│   │   ├── hooks/                   # Custom React hooks
│   │   └── main.tsx
│   └── index.html
├── server/                          # Express backend
│   ├── index.ts                     # Server entry, session/security middleware, service startup
│   ├── routes.ts                    # Route registrar + HTTP/HTTPS server creation
│   ├── routes/                      # Modular route files mounted by routes.ts
│   │   ├── cameraRoutes.ts          #   Camera CRUD, uptime events, manual checks, cert re-pin
│   │   ├── networkRoutes.ts         #   Subnet/CIDR scan, discovery, bulk add
│   │   ├── dashboardRoutes.ts       #   Fleet summary
│   │   ├── groupRoutes.ts           #   Camera groups + members
│   │   ├── analyticsRoutes.ts       #   People/occupancy analytics
│   │   ├── settingsRoutes.ts        #   User settings, API keys, webhooks, SendGrid config
│   │   ├── notificationRoutes.ts    #   SSE stream for live status
│   │   ├── reportsRoutes.ts         #   Analytics CSV/email exports + schedules
│   │   └── importExportRoutes.ts    #   CSV import/export
│   ├── authRoutes.ts                # /api/auth/* (login, register, profile, user mgmt)
│   ├── auth.ts                      # Passport config, requireAuth/requireAdmin/requireApiKeyOrAuth
│   ├── defaultUser.ts               # Seed/verify default admin on startup
│   ├── db.ts                        # SQLite connection + schema migrations + auto-column add
│   ├── cameraMonitor.ts             # Uptime polling
│   ├── networkScanner.ts            # Subnet/CIDR scanning
│   ├── cameraModelDetection.ts      # VAPIX model detection
│   ├── services/
│   │   ├── analyticsPoller.ts       # Pulls people/occupancy analytics
│   │   ├── dataRetention.ts         # Daily cleanup of old events
│   │   ├── dataAggregation.ts       # Hourly/daily rollups
│   │   ├── reportScheduler.ts       # node-cron job ("5 * * * *") that emails scheduled reports
│   │   ├── webhookDelivery.ts       # HMAC-signed webhook fan-out
│   │   └── email.ts                 # SendGrid client wrapper
│   └── __tests__/                   # Vitest suites + VAPIX fixtures
├── shared/
│   └── schema.ts                    # Drizzle ORM schema + Zod types shared with client
├── scripts/                         # createAdminUser, resetUserPassword, dedupe-cameras, etc.
├── drizzle.config.ts
├── vite.config.ts
└── package.json
```

## API Reference

All endpoints return JSON unless noted. Authenticated routes require a session cookie; routes marked **API key** also accept an `X-API-Key` header (see [API Keys](#api-keys-and-webhooks)).

### Authentication (`/api/auth`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new user (rate-limited 3/hr) | public |
| `POST` | `/api/auth/login` | Log in (rate-limited 5/15min) | public |
| `POST` | `/api/auth/logout` | End session | public |
| `POST` | `/api/auth/auto-login` | Dev-only auto-login | public, dev-only |
| `GET` | `/api/auth/me` | Get current user | user |
| `PATCH` | `/api/auth/me` | Update first/last name | user |
| `POST` | `/api/auth/change-password` | Change own password | user |
| `GET` | `/api/auth/users` | List users | admin |
| `POST` | `/api/auth/users` | Create user (with role) | admin |
| `PATCH` | `/api/auth/users/:id` | Update user | admin |
| `DELETE` | `/api/auth/users/:id` | Delete user | admin |

### Cameras

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/cameras` | List (filter by `model`, `hasPTZ`, `hasAudio`) | user or API key |
| `GET` | `/api/cameras/:id` | Single camera with provenance | user or API key |
| `POST` | `/api/cameras` | Create | admin |
| `PATCH` | `/api/cameras/:id` | Update | admin |
| `DELETE` | `/api/cameras/:id` | Delete | admin |
| `POST` | `/api/cameras/:id/check` | Manual probe | user |
| `POST` | `/api/cameras/:id/detect-model` | VAPIX model detection | admin |
| `POST` | `/api/cameras/:id/repin-cert` | Accept current TLS cert (TOFU) | admin |
| `GET` | `/api/cameras/:id/events` | Uptime events (?days=30) | user |
| `GET` | `/api/cameras/:id/uptime` | Uptime % | user |
| `GET` | `/api/cameras/uptime/batch` | Uptime % for all cameras | user |
| `GET` | `/api/uptime/events` | All uptime events fleet-wide | user |
| `GET` | `/api/uptime/daily` | Daily uptime chart data | user |

### Network Discovery

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/scan/subnet` | Octet-range scan (e.g. `192.168.1`, `1-254`) | admin |
| `POST` | `/api/cameras/scan` | CIDR scan (max `/8`) | admin |
| `POST` | `/api/cameras/discover` | Unified Bonjour + SSDP + HTTP probe | admin |
| `POST` | `/api/cameras/bulk-add` | Bulk add (≤50/request, rate-limited 20/5min) | admin |
| `POST` | `/api/cameras/:id/test-connection` | 10s connection test | user |
| `GET` | `/api/network/interfaces` | Local subnets | user |

### Groups

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/groups` | List user's groups | user |
| `POST` | `/api/groups` | Create | admin |
| `GET` | `/api/groups/:id` | Detail + members | user |
| `PATCH` | `/api/groups/:id` | Update | admin |
| `DELETE` | `/api/groups/:id` | Delete | admin |
| `POST` | `/api/groups/:id/members` | Add cameras (≤100) | admin |
| `DELETE` | `/api/groups/:id/members/:cameraId` | Remove camera | admin |

### Dashboard

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/dashboard/summary` | Fleet summary (cached 30s/user) | user |

### Analytics

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/analytics/summary` | Fleet-wide analytics | user or API key |
| `GET` | `/api/cameras/:id/analytics` | `?days=1&eventType=occupancy\|people_in\|people_out\|line_crossing\|avg_dwell_time` | user or API key |
| `GET` | `/api/cameras/:id/analytics/daily` | Daily history with per-scenario breakdown | user or API key |

### Reports

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/reports/analytics/export` | CSV download (`?range=1\|7\|30\|90\|365&cameraIds=…`) | user |
| `POST` | `/api/reports/analytics/email` | Email CSV to current user | user |
| `GET` | `/api/reports/schedules` | List own schedules | user |
| `POST` | `/api/reports/schedules` | Create schedule (daily/weekly/monthly) | user |
| `PATCH` | `/api/reports/schedules/:id` | Update | user |
| `DELETE` | `/api/reports/schedules/:id` | Delete | user |
| `POST` | `/api/reports/schedules/:id/run` | Run immediately | user |

The scheduler is a `node-cron` job running `5 * * * *` (one minute past every hour). It selects rows from `report_schedules` whose `next_run_at <= now` and `active = 1`, builds the report, and sends it via SendGrid.

### Settings, API Keys, Webhooks, Email

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/settings` | User settings (polling interval, retention, cert mode) | user |
| `PATCH` | `/api/settings` | Update user settings | admin |
| `POST` | `/api/admin/cleanup` | Manual data retention sweep | admin |
| `POST` | `/api/settings/api-keys` | Create API key (returns plaintext **once**) | user |
| `GET` | `/api/settings/api-keys` | List own API keys (prefix only) | user |
| `DELETE` | `/api/settings/api-keys/:id` | Revoke | user |
| `POST` | `/api/settings/webhooks` | Create webhook subscription | user |
| `GET` | `/api/settings/webhooks` | List (secret masked) | user |
| `DELETE` | `/api/settings/webhooks/:id` | Delete | user |
| `POST` | `/api/settings/webhooks/:id/test` | Send signed test payload | user |
| `GET` | `/api/settings/email` | Email config (API key masked) | admin |
| `PATCH` | `/api/settings/email` | Set SendGrid key, from address, enable | admin |
| `POST` | `/api/settings/email/test` | Send test email to current user | admin |

### Import / Export

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/cameras/import` | CSV import | admin |
| `GET` | `/api/cameras/export` | CSV export of cameras | user |
| `GET` | `/api/cameras/export/uptime` | 30-day uptime CSV | user |

### Live Notifications

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/notifications/stream` | Server-Sent Events for status changes (30s keepalive) | user |

### API Keys and Webhooks

API keys are created from the Settings page (or via `POST /api/settings/api-keys`). The plaintext key is returned **once** at creation and stored hashed thereafter. Use it as:

```
GET /api/cameras
X-API-Key: ax_<key>
```

Webhooks deliver events for camera status changes and analytics updates. Each subscription has a secret; deliveries include an HMAC-SHA256 signature in the `X-Webhook-Signature` header so receivers can verify authenticity. Failed deliveries are retried with backoff and after enough consecutive failures the subscription's `consecutive_failures` counter increments.

## Email & SendGrid

Outbound email (analytics report delivery, test emails, scheduled report dispatch) uses SendGrid. Configuration is **stored in the database**, not in environment variables.

1. Log in as an admin and go to **Settings → Email**.
2. Enter a SendGrid API key, the From email and name, and toggle "Enabled".
3. Click **Send Test Email** to verify delivery.

The API key is encrypted at rest. Only its prefix is shown back in the UI. To rotate, paste a new key and save.

If email is disabled or the API key is missing, the `POST /api/reports/analytics/email` and scheduled-report dispatch endpoints will mark the attempt with `last_error` rather than crashing.

## Development

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server + tsx-powered backend on `http://localhost:5000` |
| `npm run build` | Vite build (client) → `dist/public`; esbuild bundle (server) → `dist/index.js` |
| `npm start` | Run the production bundle (`dist/index.js`) with `NODE_ENV=production` |
| `npm run check` | TypeScript type check (`tsc --noEmit`) |
| `npm test` | Vitest run (single shot) |
| `npm run db:push` | Push Drizzle schema to SQLite |

### Database

The SQLite file is created on first run at `data/camera-uptime.db` (or wherever `DATABASE_URL` points). `server/db.ts` enables WAL mode, sets a 256 MB mmap and 64 MB cache, and auto-adds missing columns/indexes on startup so older databases stay compatible without explicit migrations.

To open the schema in Drizzle Studio:

```bash
npx drizzle-kit studio
```

### Useful scripts (in `scripts/`)

- `createAdminUser.ts` — seed an admin user
- `verifyAdminUser.ts` — confirm credentials match a stored hash
- `resetUserPassword.ts` — reset a user's password
- `dedupe-cameras.cjs` — collapse duplicate camera rows by IP
- `seedDemoData.ts` — populate demo data

Run any of them with `tsx`:

```bash
npx tsx scripts/createAdminUser.ts
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

1. Fork the repository
2. Create a feature branch
3. Make sure `npm run check` and `npm test` pass
4. Open a pull request

## License

MIT — see [LICENSE](LICENSE).
