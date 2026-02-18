# Axis Camera Uptime Monitor

> A comprehensive monitoring and reporting system for Axis network cameras with real-time uptime tracking, reliability metrics, and intelligent alerting.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000.svg)](https://expressjs.com/)

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [API Documentation](#-api-documentation)
- [Development](#-development)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

### Core Functionality
- **Real-Time Monitoring** - Continuous camera uptime tracking with configurable check intervals
- **Multi-Camera Dashboard** - Monitor multiple Axis cameras from a centralized interface
- **Reliability Metrics** - MTBF, MTTR, availability percentage, and failure rate analysis
- **Location-Based Filtering** - Organize and filter cameras by physical location
- **Network Discovery** - Automatic camera detection via network scanning
- **CSV Import/Export** - Bulk camera management and data export capabilities

### Advanced Features
- **Intelligent Alerting** - Automated notifications for camera downtime and failures
- **Historical Reporting** - Detailed uptime reports with customizable date ranges
- **Camera Model Detection** - Automatic identification of Axis camera models
- **Product Lifecycle Tracking** - EOL/EOS status from Axis Communications
- **Customizable Dashboard** - Drag-and-drop widget arrangement with grid layout
- **Camera Groups** - Organize cameras into logical groups
- **Dark Mode** - Full dark mode support with theme persistence
- **User Management** - Role-based access control with Admin and Viewer roles
- **Session Management** - Secure local authentication with Passport.js

### Monitoring Capabilities
- **Ping Monitoring** - ICMP-based health checks
- **HTTP/HTTPS Monitoring** - Application-level availability testing
- **Response Time Tracking** - Latency and performance metrics
- **Uptime Percentage** - Calculate and display availability over time
- **Status History** - Track camera status changes and patterns

## 🛠 Tech Stack

### Frontend
- **Framework**: React 18.3 with TypeScript
- **Build Tool**: Vite 5.4
- **Routing**: Wouter 3.3
- **State Management**: TanStack Query 5.60
- **UI Components**: Radix UI primitives
- **Styling**: Tailwind CSS 3.4 with custom animations
- **Charts**: Recharts 2.15
- **Forms**: React Hook Form 7.55 with Zod validation

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express 4.21
- **Database**: SQLite with Drizzle ORM 0.39
- **Authentication**: Passport.js with Local Strategy (email/password)
- **Session Store**: SQLite-based sessions with express-session
- **Security**: Helmet, bcrypt for password hashing, rate limiting

### Development & Quality
- **Testing**: Vitest 4.0 with UI
- **Type Checking**: TypeScript 5.6
- **Code Quality**: ESLint + Prettier

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/<your-username>/AxisCameraUptime.git
   cd AxisCameraUptime
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Initialize the database**
   ```bash
   npm run db:push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Access the application**
   ```
   Open http://localhost:5000 in your browser
   ```

## 📖 Usage

### Adding Cameras

**Manual Entry**:
1. Navigate to Cameras page
2. Click "Add Camera" button
3. Enter camera details (IP, name, location, model)
4. Save and start monitoring

**Network Scan**:
1. Go to Network Scan page
2. Enter IP range (e.g., 192.168.1.0/24)
3. Click "Scan Network"
4. Select discovered cameras to add

**CSV Import**:
1. Prepare CSV file with columns: name, ip_address, location, model
2. Click "Import CSV" on Cameras page
3. Upload file and review cameras
4. Confirm import

### Monitoring Dashboard

The dashboard provides real-time overview of all cameras:
- **Overall Uptime** - Aggregated availability percentage
- **Active Cameras** - Currently online camera count
- **Alerts** - Recent downtime incidents
- **Uptime Trend** - 7-day uptime chart

### Viewing Camera Details

Click on any camera to view:
- Current status and response time
- Uptime history chart
- Reliability metrics (MTBF, MTTR, failure rate)
- Recent status changes
- Configuration details

### Generating Reports

1. Navigate to Reports page
2. Select date range
3. Choose cameras (or all)
4. Filter by location (optional)
5. Export as CSV or view in-app

### Configuration

Access Settings page to configure:
- **Profile** - Update your name (first/last)
- **Password** - Change your account password
- **Monitoring Interval** - How often to check cameras (default: 5 minutes)
- **Email Notifications** - Toggle downtime alerts
- **Data Retention** - How long to keep historical data

### User Management (Admin Only)

Navigate to the Users page to:
- View all registered users
- Create new users with Admin or Viewer roles
- Edit user details and change roles
- Delete users (with confirmation)

**Roles**:
- **Admin** - Full access: manage cameras, groups, users, settings, and scans
- **Viewer** - Read-only access: view dashboards, cameras, and reports

## 📁 Project Structure

```
AxisCameraUptime/
├── client/                    # Frontend React application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/          # Base UI components (Radix)
│   │   │   ├── AddCameraModal.tsx
│   │   │   ├── CameraTable.tsx
│   │   │   ├── CameraDetailView.tsx
│   │   │   ├── CSVImportModal.tsx
│   │   │   └── UptimeChart.tsx
│   │   ├── pages/           # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── CustomizableDashboard.tsx
│   │   │   ├── Cameras.tsx
│   │   │   ├── CameraDetail.tsx
│   │   │   ├── Groups.tsx
│   │   │   ├── GroupDetail.tsx
│   │   │   ├── NetworkScan.tsx
│   │   │   ├── Reports.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Users.tsx
│   │   ├── lib/             # Utilities and helpers
│   │   ├── hooks/           # Custom React hooks
│   │   └── main.tsx         # Application entry point
│   └── index.html
├── server/                   # Backend Express application
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # API route definitions
│   ├── auth.ts              # Authentication logic
│   ├── authRoutes.ts        # Auth endpoints
│   ├── storage.ts           # Database operations
│   ├── cameraMonitor.ts     # Camera monitoring service
│   ├── networkScanner.ts    # Network discovery
│   ├── reliabilityMetrics.ts # MTBF/MTTR calculations
│   ├── cameraModelDetection.ts
│   └── db.ts                # Database configuration
├── shared/                   # Shared code between client/server
│   └── schema.ts            # Database schema & types
├── config/                   # Configuration files
│   └── hive-mind.json       # AI swarm configuration
├── docs/                     # Documentation
│   └── hive-mind/           # Hive Mind system docs
├── .agentic-qe/             # QE Fleet configuration
│   ├── config/              # Agent configurations
│   └── data/                # Learning and state data
├── drizzle.config.ts        # Drizzle ORM configuration
├── vite.config.ts           # Vite build configuration
├── tailwind.config.js       # Tailwind CSS configuration
└── package.json
```

## 🔌 API Documentation

### Authentication

#### POST `/api/auth/register`
Register a new user account.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response**: `201 Created`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### POST `/api/auth/login`
Authenticate user and create session.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response**: `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "viewer"
}
```

#### POST `/api/auth/logout`
End the current session.

#### GET `/api/auth/me`
Get the currently authenticated user. Requires authentication.

#### POST `/api/auth/change-password`
Change the current user's password. Requires authentication.

#### PATCH `/api/auth/me`
Update the current user's profile (firstName, lastName). Requires authentication.

#### GET `/api/auth/users` (Admin only)
List all users.

#### POST `/api/auth/users` (Admin only)
Create a new user with email, password, firstName, lastName, and role.

#### PATCH `/api/auth/users/:id` (Admin only)
Update a user's details (name, email, role, password).

#### DELETE `/api/auth/users/:id` (Admin only)
Delete a user. Returns 204 on success.

### Cameras

#### GET `/api/cameras`
Retrieve all cameras.

**Query Parameters**:
- `location` (optional) - Filter by location

**Response**: `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "Front Entrance Camera",
    "ipAddress": "192.168.1.100",
    "location": "Building A - Entrance",
    "model": "AXIS P3375-LV",
    "status": "online",
    "uptime": 99.8,
    "lastCheck": "2025-11-11T12:00:00Z",
    "responseTime": 45
  }
]
```

#### POST `/api/cameras` (Admin only)
Add a new camera to monitoring.

**Request Body**:
```json
{
  "name": "Front Entrance Camera",
  "ipAddress": "192.168.1.100",
  "location": "Building A - Entrance",
  "model": "AXIS P3375-LV",
  "checkInterval": 300
}
```

**Response**: `201 Created`

#### GET `/api/cameras/:id`
Get detailed information about a specific camera.

**Response**: `200 OK`
```json
{
  "id": "uuid",
  "name": "Front Entrance Camera",
  "ipAddress": "192.168.1.100",
  "location": "Building A - Entrance",
  "model": "AXIS P3375-LV",
  "status": "online",
  "uptime": 99.8,
  "lastCheck": "2025-11-11T12:00:00Z",
  "responseTime": 45,
  "reliability": {
    "mtbf": 720.5,
    "mttr": 15.2,
    "availabilityPercentage": 99.8,
    "failureRate": 0.002
  }
}
```

#### PUT `/api/cameras/:id` (Admin only)
Update camera configuration.

#### DELETE `/api/cameras/:id` (Admin only)
Remove camera from monitoring.

### Camera Status

#### GET `/api/cameras/:id/status-history`
Get historical status data for a camera.

**Query Parameters**:
- `startDate` (optional) - Start of date range
- `endDate` (optional) - End of date range
- `limit` (optional) - Maximum records to return

**Response**: `200 OK`
```json
[
  {
    "timestamp": "2025-11-11T12:00:00Z",
    "status": "online",
    "responseTime": 45
  },
  {
    "timestamp": "2025-11-11T11:55:00Z",
    "status": "online",
    "responseTime": 42
  }
]
```

### Reports

#### GET `/api/reports`
Generate uptime report.

**Query Parameters**:
- `startDate` - Report start date (required)
- `endDate` - Report end date (required)
- `cameraIds` (optional) - Comma-separated camera IDs
- `location` (optional) - Filter by location
- `format` (optional) - `json` or `csv` (default: json)

**Response**: `200 OK`
```json
{
  "period": {
    "start": "2025-11-01T00:00:00Z",
    "end": "2025-11-11T23:59:59Z"
  },
  "summary": {
    "totalCameras": 10,
    "averageUptime": 99.2,
    "totalDowntime": 120
  },
  "cameras": [
    {
      "id": "uuid",
      "name": "Front Entrance Camera",
      "uptime": 99.8,
      "downtime": 5,
      "incidents": 2
    }
  ]
}
```

### Network Scanning

#### POST `/api/network/scan` (Admin only)
Scan network for Axis cameras.

**Request Body**:
```json
{
  "ipRange": "192.168.1.0/24",
  "timeout": 5000
}
```

**Response**: `200 OK`
```json
{
  "discovered": [
    {
      "ipAddress": "192.168.1.100",
      "model": "AXIS P3375-LV",
      "hostname": "camera-01",
      "responseTime": 45
    }
  ],
  "scannedIps": 254,
  "duration": 45000
}
```

## 🔧 Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run coverage
npm run test:coverage
```

### Database Migrations

```bash
# Generate migration
npx drizzle-kit generate

# Push schema changes
npm run db:push

# View database in Drizzle Studio
npx drizzle-kit studio
```

### Building for Production

```bash
# Build client and server
npm run build

# Start production server
npm start
```

### Code Quality

```bash
# Type checking
npm run check

# Lint code
npm run lint

# Format code
npm run format
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=./data.db

# Server
NODE_ENV=development
PORT=5000

# Authentication
SESSION_SECRET=your-secret-key-here

# Monitoring
DEFAULT_CHECK_INTERVAL=300000
DEFAULT_TIMEOUT=5000
```

## 🌐 Deployment

### Default Credentials

On first startup, a default admin user is created:
- **Email**: `admin@local`
- **Password**: `admin123`

Change these immediately after first login via the Settings page.

### Docker

```bash
# Build image
docker build -t axis-camera-uptime .

# Run container
docker run -p 5000:5000 -v $(pwd)/data:/app/data axis-camera-uptime
```

### Manual Deployment

```bash
# Build the application
npm run build

# Set environment to production
export NODE_ENV=production

# Start server
npm start
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Update documentation
- Follow the existing code style
- Use meaningful commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Axis Communications](https://www.axis.com/) - For excellent network camera products
- [Radix UI](https://www.radix-ui.com/) - For accessible UI components
- [Recharts](https://recharts.org/) - For beautiful data visualization
- [Drizzle ORM](https://orm.drizzle.team/) - For type-safe database operations

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/<your-username>/AxisCameraUptime/issues)
- **Discussions**: [GitHub Discussions](https://github.com/<your-username>/AxisCameraUptime/discussions)
