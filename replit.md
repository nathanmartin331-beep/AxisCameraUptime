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
- Dashboard (camera overview with video health metrics, uptime charts, tri-state status badges, filtering, and exports)
- **Customizable Dashboard** (drag-and-drop widget layout with reliability metrics for enterprise directors)
- Cameras page (camera management with manual add and CSV import)
- Network Scan page (subnet scanning for camera discovery)
- Camera detail views (individual camera analytics, reboot history, video health status)

**Dashboard Filtering & Reporting:**
- **Location-based filtering:** Dropdown populated from unique camera locations, filters all metrics and camera list
- **Video health filtering:** Filter by video status (all/ok/issues/unknown) to identify problematic cameras
- **Search filtering:** Real-time search across camera name, IP address, and location
- **Combined filtering:** All filters work together; metrics recalculate dynamically
- **Filter status indicator:** Shows active filters and filtered vs total camera counts
- **CSV Export:** Download filtered camera data with proper quote escaping and CSV injection protection
  - Columns: Camera Name, IP Address, Location, Status, Video Status, Uptime %, Last Seen
  - ISO timestamp in filename: `camera-report-2025-11-11_03-15-30.csv`
  - Sanitizes leading dangerous characters (=, +, -, @) to prevent formula injection
- **Executive Summary Export:** Text-based report for security directors
  - Includes: Generation timestamp, active filters, summary metrics, detailed camera sections
  - Professional format suitable for security reviews and audit trails
  - Filename format: `executive-summary-2025-11-11_03-15-30.txt`

**Video Health UI:**
- Tri-state status badges: Green (video_ok), Amber (video_failed), Neutral (unknown/offline)
- Icons: CheckCircle2 (healthy), AlertTriangle (video failed), standard status dot (system state)
- Dashboard "Video Issues" metric with amber accent when failures detected
- Tooltips with remediation guidance for video failures
- Video status displayed alongside system status in camera table

**Customizable Dashboard (NEW):**
- **Purpose:** Enterprise-grade analytics dashboard for security directors and reliability teams
- **Widget System:** 12 widget types including MTTR, MTBF, Network Uptime, Total Incidents, SLA Compliance, Video Health, Incident Leaderboard, Site Rankings, Active Incidents, Camera Status, MTTR Trend, and Uptime Distribution
- **Drag-and-Drop Layout:** Uses react-grid-layout for intuitive widget rearrangement and resizing
- **Persistence:** Layout saved to PostgreSQL (JSONB) per user with 1-second debounced saves
- **Widget Catalog:** Add/remove widgets from comprehensive catalog via modal dialog
- **Default Layout:** New users start with 7 pre-configured widgets (Network Uptime, MTTR, MTBF, Total Incidents, Camera Status, Incident Leaderboard, Site Rankings)
- **Responsive Grid:** Breakpoints for lg/md/sm/xs viewports with automatic reflowing
- **Real-time Metrics:** All widgets fetch live data from reliability metrics calculations
- **Multiple Instances:** Unique widget instance IDs allow multiple copies of same widget type
- **Server Validation:** Zod schemas enforce finite Y coordinates and prevent malformed layouts
- **Performance:** Debounced saves prevent API thrashing; Promise.all() for parallel metric calculations

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
- **`/api/dashboard/layout`** - Dashboard widget layout persistence (GET/POST)
- **`/api/metrics/network`** - Network-wide reliability metrics (MTTR, MTBF, uptime, incidents)
- **`/api/metrics/sla`** - SLA compliance calculations
- **`/api/metrics/sites`** - Per-site reliability rankings

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

**dashboardLayouts** - User customizable dashboard layouts
- id (serial primary key)
- userId (foreign key → users, unique constraint - one layout per user)
- layout (JSONB - stores widget array with coordinates)
  - Structure: `{ widgets: [{ id, type, x, y, w, h }, ...] }`
  - Server validates Y coordinates are finite and positive
- Timestamps: createdAt, updatedAt
- Cascade delete on user deletion

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
- **react-grid-layout:** Drag-and-drop grid system for customizable dashboard
- **react-resizable:** Widget resizing for dashboard grid

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