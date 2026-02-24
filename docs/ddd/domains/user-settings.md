# Domain: User Settings

## Bounded Context

The User Settings domain owns the per-user configuration that controls the operational behaviour of the platform for each account. It manages the polling interval that governs how frequently the Uptime Monitoring domain probes cameras, the data retention window that controls how long uptime history is kept, and email notification preferences. It also exposes a manual data cleanup endpoint for admins.

This domain shares its primary UI surface with the IAM domain (`pages/Settings.tsx`), where self-service profile editing (handled by IAM) and operational settings (handled by this domain) appear together on the same page.

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **UserSettings** | A per-user record holding operational configuration values. One record per user. |
| **Polling Interval** | How frequently (in minutes) the uptime monitor checks each camera's status. Valid range: 1–60 minutes. Default: 5 minutes. |
| **Data Retention Days** | How many days of uptime event history to keep before automated or manual cleanup. Valid range: 7–365 days. Default: 90 days. |
| **Email Notifications** | Boolean flag indicating whether the system should send email alerts when cameras go offline. Default: false. |
| **Manual Cleanup** | An admin-triggered operation that immediately deletes uptime events older than the configured retention window. |
| **Retention Window** | The time period before the current date within which events are preserved. Events with timestamps before `now - dataRetentionDays` are eligible for deletion. |

---

## Aggregate Roots

### UserSettings
A single settings record per user.

| Field | Type | Notes |
|-------|------|-------|
| userId | string | Primary key / foreign key to User |
| pollingInterval | number | Minutes between polls; 1–60; default 5 |
| dataRetentionDays | number | Days of history to retain; 7–365; default 90 |
| emailNotifications | boolean | Whether to send offline alerts; default false |
| updatedAt | Date | |

---

## Value Objects

None. This domain operates on a single flat settings record with no nested value objects.

---

## Domain Events

| Event | Trigger | Effect |
|-------|---------|--------|
| `SettingsUpdated` | `PATCH /api/settings` | UserSettings record upserted in DB; polling interval change takes effect on next cron tick |
| `ManualCleanupTriggered` | `POST /api/admin/cleanup` | `storage.deleteOldUptimeEvents(beforeDate)` executes immediately |

---

## Anti-Corruption Layer

- **Zod schema enforcement**: All `PATCH /api/settings` payloads are validated against a schema that enforces integer types and min/max bounds before any persistence:
  - `pollingInterval`: integer, 1–60
  - `dataRetentionDays`: integer, 7–365
  - `emailNotifications`: boolean
- **Admin guard on writes**: `PATCH /api/settings` and `POST /api/admin/cleanup` both require `requireAdmin`. Reading settings requires only `requireAuth`.
- **No-op guard**: If no valid fields are present after Zod parsing, the route returns a 400 error rather than executing a no-op update.
- **Retention calculation isolation**: The manual cleanup endpoint reads `dataRetentionDays` from the settings record and computes `beforeDate` itself — the Uptime Monitoring domain's storage function (`deleteOldUptimeEvents`) receives only the cutoff date, not the retention policy.

---

## Server Files

| File | Responsibility |
|------|---------------|
| `server/routes/settingsRoutes.ts` | `GET /api/settings`, `PATCH /api/settings`, `POST /api/admin/cleanup` |

---

## Client Files

| File | Notes |
|------|-------|
| `client/src/pages/Settings.tsx` | Shared page with IAM domain. Contains two sections: (1) user profile editing and password change (owned by IAM); (2) operational settings: polling interval, data retention, email notification toggle, and manual cleanup button (owned by this domain). |

---

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/settings` | any | Return current user's settings record |
| PATCH | `/api/settings` | admin | Update one or more settings fields (pollingInterval, dataRetentionDays, emailNotifications) |
| POST | `/api/admin/cleanup` | admin | Immediately delete uptime events older than current `dataRetentionDays` setting; returns deleted count |

---

## Dependencies

### What this domain depends on
- **Uptime Monitoring** — `storage.deleteOldUptimeEvents(beforeDate)` called by the manual cleanup endpoint
- **IAM** — `requireAuth`/`requireAdmin` middleware on all endpoints
- `server/storage.ts` — `getUserSettings()`, `updateUserSettings()`

### What depends on this domain
- **Uptime Monitoring** — reads `pollingInterval` to configure the cron schedule frequency; reads `dataRetentionDays` for automated retention cleanup cron runs
