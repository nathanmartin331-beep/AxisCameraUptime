# Axis Camera Uptime Monitoring System - Design Guidelines

## Design Approach

**System Selected**: Fluent Design System
**Rationale**: Data-intensive enterprise monitoring application requiring clarity, efficiency, and professional presentation. Fluent Design excels at productivity tools with strong information hierarchy and clean data visualization.

## Core Design Principles

1. **Data-First Clarity**: Every element serves to surface critical camera status information quickly
2. **Professional Efficiency**: Minimize visual noise, maximize information density without overwhelming
3. **Status-Driven Design**: Visual hierarchy based on operational states (online, offline, warning)
4. **Scannable Layouts**: Enable rapid assessment of 300+ cameras at a glance

---

## Typography

**Font Family**: Segoe UI (primary), system-ui fallback
- **Headings**: Semibold (600) - Page titles (24px), Section headers (18px)
- **Body**: Regular (400) - Primary content (14px), Small text (12px)
- **Data/Metrics**: Medium (500) - Statistics, uptime percentages (16-20px)
- **Monospace**: For IP addresses, camera IDs (Consolas, 13px)

---

## Layout System

**Spacing Units**: Tailwind scale - primarily 2, 4, 6, 8, 12, 16 units
- Card padding: p-6
- Section spacing: space-y-8
- Compact lists: space-y-2
- Dashboard grid gaps: gap-6

**Grid Structure**:
- Dashboard: 3-column grid on desktop (grid-cols-3), 1-column mobile
- Camera list: Full-width table with fixed header
- Detail views: 2-column layout (grid-cols-2) for stats + visualization

---

## Component Library

### Navigation
**Top Navigation Bar**:
- Full-width header with logo/app name left, user profile/logout right
- Height: h-16, fixed positioning
- Navigation links: Dashboard, Cameras, Network Scan, Reports, Settings
- Current camera count badge and overall system health indicator

### Dashboard Layout
**Overview Cards** (3-column grid):
- Total Cameras | Online Cameras | System Uptime %
- Large metric display (32px), label below (12px)
- Status-based accent borders (green/red/amber)

**Camera Status Table**:
- Sticky header with sort controls
- Columns: Status Indicator, Camera Name, IP Address, Location, Current Uptime, Last Seen, Actions
- Row height: h-14 for comfortable scanning
- Alternating subtle row backgrounds for readability
- Status dot indicators (8px) with color coding

**Visualizations Section**:
- Uptime trend chart (line graph) showing 7/30/90/365 day views with tab selector
- Downtime events timeline
- Top offline cameras list (ranked by downtime)

### Camera Management
**Camera List View**:
- Action toolbar: Add Camera, Import CSV, Export Report, Scan Network buttons
- Search/filter bar with status dropdown, location filter
- Bulk action checkboxes for multi-camera operations

**Camera Detail Page**:
- Header: Camera name, IP, edit/delete buttons
- Left column: Camera info card (credentials masked, location, added date)
- Right column: Real-time status, uptime statistics
- Full-width uptime visualization below
- Reboot history table with timestamps and Boot IDs

**Add/Edit Camera Form**:
- Modal overlay (max-w-2xl)
- Form fields: Camera Name, IP Address, Username, Password (type=password), Location, Notes
- Test Connection button before saving
- Clear validation states

**CSV Import**:
- Modal with file drop zone
- Template download link
- Preview table before confirmation
- Error handling for invalid entries

### Network Scanner
**Scanner Interface**:
- IP range input (CIDR notation) with subnet calculator helper
- Scan button (primary, prominent)
- Progress indicator during scan
- Results table: IP, MAC, Open Ports, Detected Type, Add to Cameras action
- Bulk select to add multiple discovered cameras

### Data Visualizations
**Chart Components**:
- Library: Chart.js or Recharts
- Line charts for uptime trends with grid lines
- Bar charts for downtime comparison
- Donut chart for overall system health percentage
- Tooltip overlays with detailed timestamp data
- Responsive sizing, min-height to prevent cramping

### Status Indicators
**Visual Language**:
- Online: Green dot/badge (bg-green-500)
- Offline: Red dot/badge (bg-red-500)  
- Warning/Stale Data: Amber dot/badge (bg-amber-500)
- Unknown/First Scan: Gray dot/badge (bg-gray-400)

### Forms & Inputs
- Input fields: border, rounded-md, focus:ring-2 for accessibility
- Labels: mb-2, font-medium
- Required field markers
- Inline validation messages
- Password fields with show/hide toggle icon

### Buttons
**Hierarchy**:
- Primary: Filled, prominent for main actions (Add Camera, Start Scan, Save)
- Secondary: Outlined for alternative actions (Cancel, Export CSV)
- Tertiary: Ghost/text for minor actions (Edit, Delete in tables)
- Icon buttons: For compact actions in table rows (size-8)

---

## Accessibility

- Consistent focus indicators (ring-2 ring-blue-500)
- ARIA labels for icon-only buttons
- Keyboard navigation for all tables and forms
- Color contrast ratio ≥ 4.5:1 for all text
- Status not conveyed by color alone (use icons + text labels)

---

## Images

**No hero images required** - This is a utility application, not a marketing site. 

**Iconography**:
- Use Heroicons (outline style) via CDN for UI icons
- Status icons: check-circle (online), x-circle (offline), exclamation-triangle (warning)
- Navigation icons: view-grid (dashboard), video-camera (cameras), wifi (network scan), document-report (reports), cog (settings)

---

## Page-Specific Guidelines

### Login Page
- Centered card (max-w-md), company logo above
- Replit Auth integration for secure authentication
- Minimal decoration, focus on functionality

### Dashboard (Home)
- Dense information display optimized for quick scanning
- Metrics cards at top, main camera table below
- Visualization section collapsible for users who want pure table view

### Camera Detail
- All information for single camera in comprehensive view
- Historical uptime graph prominent
- Reboot detection events clearly marked on timeline

### Reports
- Date range selector (last 7/30/90/365 days or custom range)
- Export to CSV button
- Filterable by camera, location, or status
- Preview before download