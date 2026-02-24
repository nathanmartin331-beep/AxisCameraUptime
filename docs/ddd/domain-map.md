# AxisCameraUptime — Domain Map

## Overview

AxisCameraUptime is organised around nine bounded contexts. Each context owns a distinct slice of the domain, exposes a clear API surface, and protects its internal model from direct cross-context access. The contexts communicate through shared identifiers (camera ID, user ID, group ID), REST APIs, and Server-Sent Events (SSE) streams.

---

## Context Map

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         AxisCameraUptime Platform                            │
│                                                                              │
│   ┌─────────────────────────┐                                                │
│   │   Identity & Access     │  ◄── auth middleware consumed by ALL domains  │
│   │        (IAM)            │                                                │
│   └────────────┬────────────┘                                                │
│                │ requireAuth / requireAdmin                                  │
│                ▼                                                              │
│   ┌─────────────────────────┐      ┌──────────────────────────┐             │
│   │    Camera Registry      │◄─────│   Network Discovery      │             │
│   │  (camera-registry)      │      │  (network-discovery)     │             │
│   └────────┬────────────────┘      └──────────────────────────┘             │
│            │  camera data / status                                           │
│       ┌────┴──────┬────────────────────┐                                    │
│       ▼           ▼                    ▼                                     │
│  ┌──────────┐ ┌──────────┐  ┌──────────────────┐                           │
│  │  Uptime  │ │Analytics │  │  Camera Groups   │                           │
│  │Monitoring│ │          │  │  (camera-groups) │                           │
│  └────┬─────┘ └────┬─────┘  └────────┬─────────┘                          │
│       │            │                  │                                      │
│       │            └──────────────────┘                                     │
│       │                     │                                                │
│       ▼                     ▼                                                │
│   ┌─────────────────────────────────────┐                                   │
│   │     Dashboard & Observability       │  (read-only consumer of all data) │
│   └─────────────────────────────────────┘                                   │
│                                                                              │
│   ┌──────────────────────────┐   ┌──────────────────────────┐              │
│   │     Import / Export      │   │      User Settings       │              │
│   │   (import-export)        │   │    (user-settings)       │              │
│   └──────────────────────────┘   └──────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Dependency Arrows

```
Identity & Access
    └── provides auth middleware ──► ALL other domains

Network Discovery
    └── creates cameras ──► Camera Registry

Camera Registry
    ├── provides camera list/status ──► Uptime Monitoring
    ├── provides capabilities ──────► Analytics
    ├── provides camera list ────────► Camera Groups
    └── provides camera data ────────► Import / Export

Uptime Monitoring
    ├── provides retention config ◄── User Settings
    └── provides uptime data ────────► Dashboard & Observability

Analytics
    ├── reads cameras ◄──────────── Camera Registry
    ├── reads groups ◄───────────── Camera Groups
    └── provides analytics data ──► Dashboard & Observability

Camera Groups
    ├── reads cameras ◄──────────── Camera Registry
    └── provides group analytics ──► Dashboard & Observability

Dashboard & Observability
    └── reads all data domains (read-only)

Import / Export
    ├── reads/writes cameras ◄────── Camera Registry
    └── reads uptime data ◄──────── Uptime Monitoring

User Settings
    └── configures retention ──────► Uptime Monitoring
```

---

## Bounded Context Summary

| # | Context | Short Name | Aggregate Root(s) | Primary Concern |
|---|---------|-----------|-------------------|-----------------|
| 1 | Identity & Access | IAM | User | Authentication, session management, role-based access control |
| 2 | Camera Registry | camera-registry | Camera | CRUD for cameras, model detection, capabilities, lifecycle, analytics config |
| 3 | Uptime Monitoring | uptime-monitoring | UptimeEvent | Scheduled polling, status tracking, uptime calculation, MTTR/MTBF |
| 4 | Analytics | analytics | AnalyticsEvent | VAPIX analytics polling, SSE streaming, scenario aggregation |
| 5 | Network Discovery | network-discovery | — (value objects) | HTTP/Bonjour/SSDP/CIDR scanning, bulk-add, CSV import |
| 6 | Camera Groups | camera-groups | CameraGroup | Group CRUD, membership management, aggregate occupancy |
| 7 | Dashboard & Observability | dashboard | DashboardLayout | Summary metrics, widget system, reliability metrics |
| 8 | Import / Export | import-export | — (value objects) | CSV import/export for cameras and uptime reports |
| 9 | User Settings | user-settings | UserSettings | Polling interval, data retention, email notifications |

---

## Cross-Cutting Concerns

- **Authentication**: Every domain requires a valid session. `requireAuth` and `requireAdmin` middleware from the IAM domain guards all API routes.
- **Data isolation**: All queries are scoped by `userId`. No user can access another user's cameras, groups, or analytics.
- **Encryption**: Camera passwords are encrypted at rest using AES-256 via `server/encryption.ts`. Plaintext passwords never leave the IAM/Registry boundary.
- **Transport**: All real-time updates flow via SSE streams. Polling and browser state are loosely coupled through these streams.
- **Storage**: A single SQLite database (via Drizzle ORM) is shared across all domains. Domain boundaries are enforced at the application layer, not the database layer.

---

## Individual Domain Files

- [Identity & Access](domains/iam.md)
- [Camera Registry](domains/camera-registry.md)
- [Uptime Monitoring](domains/uptime-monitoring.md)
- [Analytics](domains/analytics.md)
- [Network Discovery](domains/network-discovery.md)
- [Camera Groups](domains/camera-groups.md)
- [Dashboard & Observability](domains/dashboard.md)
- [Import / Export](domains/import-export.md)
- [User Settings](domains/user-settings.md)
