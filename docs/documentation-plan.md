# Documentation Index

## Overview

This document tracks the project's documentation files and their current status.

## Existing Documentation

| File | Description | Status |
|------|-------------|--------|
| `README.md` | Project overview, quick start, API reference, deployment guide | Current |
| `docs/api-model-endpoints.md` | Camera model detection API endpoints | Current |
| `docs/backend-implementation-summary.md` | Backend architecture for multi-model camera support | Current |
| `docs/storage-integration-guide.md` | Storage layer integration guide for model extension | Current |
| `docs/documentation-plan.md` | This file | Current |

## Key Features Documented

- Camera monitoring and uptime tracking
- Network scanning and camera discovery
- Camera model detection via VAPIX API
- Product lifecycle (EOL/EOS) tracking
- Role-based access control (Admin/Viewer)
- User management (CRUD)
- Camera groups
- Customizable dashboard
- CSV import/export
- Reliability metrics (MTBF, MTTR)

## Architecture Summary

- **Frontend**: React 18 + TypeScript, Vite, Wouter routing, TanStack Query, shadcn/ui
- **Backend**: Express 4, Passport.js local auth, SQLite + Drizzle ORM
- **Auth**: Session-based with bcrypt password hashing, rate limiting
- **Roles**: `admin` (full access) and `viewer` (read-only)
- **Default user**: `admin@local` / `admin123` (created on first startup)

---

**Last Updated:** 2026-02-18
