# Axis Camera Uptime Monitoring System

## Overview

An enterprise-grade monitoring application for Axis security camera networks. The system provides real-time uptime tracking, reboot detection, and 365-day historical analytics for up to 300+ cameras. Built with a React frontend and Express backend, it leverages the VAPIX API for camera polling and maintains comprehensive uptime records.

**Core Capabilities:**
- Continuous camera health monitoring via VAPIX systemready endpoint
- Real-time status tracking (online/offline/warning states)
- Reboot detection through bootId comparison
- 365-day uptime percentage calculations
- Network scanning for camera discovery
- CSV import/export for bulk camera management

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework:** React 18 with TypeScript, built with Vite

**UI Component System:** Radix UI primitives with shadcn/ui components following Fluent Design principles for enterprise data visualization. Design emphasizes clarity and scannable layouts for monitoring 300+ cameras.

**Styling:** Tailwind CSS with custom design tokens defined in CSS variables. Theme supports light/dark modes with Fluent-inspired spacing (primarily 2, 4, 6, 8, 12, 16 units) and professional typography (Segoe UI primary, system-ui fallback).

**State Management:** TanStack Query (React Query) for server state with configured polling intervals. No global client state management - relies on server-driven data fetching.

**Routing:** Wouter for lightweight client-side routing with protected routes based on authentication status.

**Key Pages:**
- Landing page (unauthenticated users)
- Dashboard (camera overview, metrics, uptime charts)
- Camera detail views (individual camera analytics and reboot history)

### Backend Architecture

**Runtime:** Node.js with Express server

**API Design:** RESTful endpoints with session-based authentication. All camera operations scoped to authenticated user.

**Camera Monitoring System:**
- Cron-based polling service (`cameraMonitor.ts`) that runs on configurable intervals
- Polls cameras using VAPIX systemready.cgi endpoint (unauthenticated HTTP calls)
- Tracks camera status changes and bootId for reboot detection
- Creates uptime events for state transitions (online→offline, offline→online, reboot detected)

**Core Monitoring Logic:**
- Each poll checks `systemready=yes/no` and captures `bootId`
- Boot ID changes indicate reboots even if camera stays online
- Events stored as time-series data for uptime calculations
- Uptime percentage calculated by aggregating event durations over specified time windows

**Authentication Flow:** Replit Auth integration using OpenID Connect with Passport.js strategy. Session storage in PostgreSQL via connect-pg-simple.

**Data Access Layer:** Storage abstraction (`storage.ts`) provides CRUD operations for users, cameras, and uptime events. Drizzle ORM handles database operations with type-safe queries.

**Key API Endpoints:**
- `/api/auth/*` - Authentication (login/logout/user)
- `/api/cameras` - CRUD operations for camera management
- `/api/cameras/:id/events` - Uptime event history
- `/api/cameras/:id/uptime` - Calculated uptime percentages
- `/api/cameras/test` - Test camera credentials before saving

### Database Design

**ORM:** Drizzle ORM with PostgreSQL adapter (@neondatabase/serverless for connection pooling)

**Schema Structure:**

**sessions** - Express session storage for authentication
- sid (primary key), sess (JSON), expire timestamp

**users** - User accounts from Replit Auth
- id, email, firstName, lastName, profileImageUrl
- Timestamps: createdAt, updatedAt

**cameras** - Camera inventory and credentials
- id, userId (foreign key → users), name, ipAddress
- username, encryptedPassword (bcrypt hashed)
- location, notes (optional text fields)
- currentStatus, bootId, lastSeenAt
- Timestamps: createdAt, updatedAt
- Cascade delete on user deletion

**uptimeEvents** - Time-series uptime tracking
- id, cameraId (foreign key → cameras)
- eventType (enum: 'online', 'offline', 'reboot')
- timestamp, bootId, metadata (JSONB for extensibility)
- Indexed on cameraId + timestamp for efficient range queries

**Uptime Calculation Strategy:**
- Events create time windows between state changes
- Online duration = time between 'online' event and next 'offline'/'reboot' event
- Uptime % = (total online duration / total time window) × 100
- Handles edge cases: no events, ongoing states, first/last event boundaries

### External Dependencies

**Third-Party Services:**
- **Replit Auth:** OpenID Connect identity provider for user authentication
- **Neon Database:** Serverless PostgreSQL hosting (via @neondatabase/serverless with WebSocket connections)

**Camera Integration:**
- **Axis VAPIX API:** HTTP-based camera API for health checks
  - Endpoint: `http://{ip}/axis-cgi/systemready.cgi`
  - Response format: Key-value pairs (systemready, uptime, bootid)
  - No authentication required for systemready endpoint

**UI Component Libraries:**
- **Radix UI:** Headless accessible components (@radix-ui/react-*)
- **shadcn/ui:** Pre-styled component implementations
- **Recharts:** Data visualization for uptime charts
- **Lucide React:** Icon system

**Utility Libraries:**
- **bcryptjs:** Password hashing (though noted: current implementation stores credentials encrypted, not for digest auth)
- **node-cron:** Scheduled camera polling
- **date-fns:** Date formatting and calculations
- **Wouter:** Lightweight routing
- **Passport.js:** Authentication middleware with OpenID Client strategy

**Build Tools:**
- **Vite:** Frontend build and dev server with HMR
- **esbuild:** Backend bundling for production
- **TypeScript:** Type safety across full stack
- **Tailwind CSS + PostCSS:** Styling pipeline

**Development Dependencies:**
- **Drizzle Kit:** Database schema migrations and management
- **@replit plugins:** Runtime error overlay, cartographer (dev), dev banner (dev)