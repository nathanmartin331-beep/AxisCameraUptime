# Axis Camera Uptime Monitoring System

## Overview

An enterprise-grade monitoring application for Axis security camera networks. The system provides real-time uptime tracking, reboot detection, and 365-day historical analytics for up to 300+ cameras. Built with a React frontend and Express backend, it leverages the VAPIX API for camera polling and maintains comprehensive uptime records.

**Core Capabilities:**
- Continuous camera health monitoring via VAPIX systemready endpoint
- **Video stream health detection** - Validates video encoder functionality (detects cameras that are online but not delivering video)
- Real-time status tracking (online/offline/warning states)
- Tri-state video health indicators (video_ok/video_failed/unknown)
- Reboot detection through bootId comparison
- 365-day uptime percentage calculations with video health history
- Network scanning for camera discovery (supports all network classes: Class A 10.x.x.x, Class B 172.16-31.x.x, Class C 192.168.x.x)
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
- Dashboard (camera overview with video health metrics, uptime charts, tri-state status badges)
- Cameras page (camera management with manual add and CSV import)
- Network Scan page (subnet scanning for camera discovery)
- Camera detail views (individual camera analytics, reboot history, video health status)

**Video Health UI:**
- Tri-state status badges: Green (video_ok), Amber (video_failed), Neutral (unknown/offline)
- Icons: CheckCircle2 (healthy), AlertTriangle (video failed), standard status dot (system state)
- Dashboard "Video Issues" metric with amber accent when failures detected
- Tooltips with remediation guidance for video failures
- Video status displayed alongside system status in camera table

### Backend Architecture

**Runtime:** Node.js with Express server

**API Design:** RESTful endpoints with session-based authentication. All camera operations scoped to authenticated user.

**Camera Monitoring System:**
- Cron-based polling service (`cameraMonitor.ts`) that runs on configurable intervals
- Two-tier health validation:
  1. System health check via VAPIX systemready.cgi (unauthenticated)
  2. **Video stream validation** via `/axis-cgi/jpg/image.cgi` (authenticated with HTTP Basic Auth)
- Tracks camera status changes and bootId for reboot detection
- Creates uptime events for state transitions (online→offline, offline→online, reboot detected)
- Records video health status in both camera records and uptime events

**Core Monitoring Logic:**
- Each poll checks `systemready=yes/no` and captures `bootId`
- For online cameras, performs authenticated video stream check with 3-second timeout
- Video check fetches JPEG snapshot to verify encoder functionality
- Three-state video status: `video_ok` (streaming), `video_failed` (encoder issue), `unknown` (not checked/offline)
- Boot ID changes indicate reboots even if camera stays online
- Events stored as time-series data for uptime calculations
- Uptime percentage calculated by aggregating event durations over specified time windows

**Authentication Flow:** Replit Auth integration using OpenID Connect with Passport.js strategy. Session storage in PostgreSQL via connect-pg-simple.

**Data Access Layer:** Storage abstraction (`storage.ts`) provides CRUD operations for users, cameras, and uptime events. Drizzle ORM handles database operations with type-safe queries.

**Key API Endpoints:**
- `/api/auth/*` - Authentication (login/logout/user)
- `/api/cameras` - CRUD operations for camera management (POST accepts plain password, encrypts server-side)
- `/api/cameras/import` - CSV bulk import with deduplication
- `/api/cameras/scan` - Network scanning with CIDR notation
  - Supports all private network classes (10.x.x.x/8, 172.16-31.x.x/12, 192.168.x.x/16)
  - Accepts CIDR notation from /8 to /30 (e.g., "172.16.0.0/16", "10.5.20.0/24")
  - Properly calculates network ranges across multiple octets
  - Maximum 10,000 hosts per scan for performance
- `/api/cameras/:id/events` - Uptime event history
- `/api/cameras/:id/uptime` - Calculated uptime percentages
- `/api/cameras/test` - Test camera credentials before saving

**Security Implementation:**
- Plain passwords accepted from frontend, encrypted immediately server-side using bcryptjs
- userId derived from authenticated session (requireAuth middleware), never from request body
- Plaintext passwords never stored in database or returned to frontend
- All camera operations scoped to authenticated user via session

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
- **videoStatus, lastVideoCheck** (video stream health tracking)
- Timestamps: createdAt, updatedAt
- Cascade delete on user deletion

**uptimeEvents** - Time-series uptime tracking
- id, cameraId (foreign key → cameras)
- eventType (enum: 'online', 'offline', 'reboot')
- **videoStatus** (captures video health at time of event)
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
  - System health endpoint: `http://{ip}/axis-cgi/systemready.cgi` (unauthenticated)
  - Response format: Key-value pairs (systemready, uptime, bootid)
  - **Video validation endpoint:** `http://{ip}/axis-cgi/jpg/image.cgi` (HTTP Basic Auth required)
  - Video check validates encoder by fetching JPEG snapshot with content-type verification
  - 5-second timeout for system checks, 3-second timeout for video checks

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