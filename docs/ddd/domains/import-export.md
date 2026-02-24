# Domain: Import / Export

## Bounded Context

The Import / Export domain handles bulk data exchange between the platform and external systems via CSV files. It supports two inbound operations (camera import, which lives semantically in Network Discovery but is implemented here) and two outbound operations (camera list export, uptime report export).

This domain owns the CSV parsing and generation utilities. It has no persistent state of its own — it reads from and writes to the Camera Registry and Uptime Monitoring domains.

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **CameraCSVRow** | A single row in a camera import or export file. Represents one camera's basic connection data. |
| **CSV Import** | Parsing an uploaded CSV string into camera records and creating them in the database, with duplicate detection and row-level error reporting. |
| **CSV Export** | Serialising the current user's camera list into a downloadable CSV file. |
| **Uptime Report** | A CSV export containing each camera's name, IP address, and 30-day uptime percentage. |
| **Skipped Row** | An import row that was not created because the IP address already exists (either in the database or earlier in the same file). Returned in the import response for user review. |
| **Error Row** | An import row that failed Zod validation or another integrity check. Returned in the import response with a human-readable error message. |
| **Duplicate IP Guard** | Logic that normalises IP addresses to lowercase and checks against both existing database records and rows already processed in the current import batch. |

---

## Aggregate Roots

This domain has no persistent aggregate roots. All operations are stateless transformations that delegate to other domains.

---

## Value Objects

- **CameraCSVRow** — A parsed row from an import file:
  - `name: string`
  - `ipAddress: string`
  - `username: string`
  - `password: string`
  - `location: string | null`
  - `notes: string | null`
  - `protocol: "http" | "https" | undefined`
  - `port: number | undefined`
  - `verifySslCert: boolean | undefined`

- **ImportResult** — The response from a CSV import operation:
  - `message: string`
  - `count: number` — cameras successfully imported
  - `imported: number`
  - `skipped: number`
  - `errors: number`
  - `details.skippedRows: SkippedRow[]`
  - `details.errorRows: ErrorRow[]`

---

## Domain Events

This domain publishes no domain events of its own. The following side-effects occur when records are successfully created:

| Operation | Side Effect | Handled by |
|-----------|------------|------------|
| CSV import creates cameras | `checkAllCameras()` called after 2 s | Uptime Monitoring (cameraMonitor) |
| Cameras created during import | Dashboard cache invalidated | Camera Registry route |

---

## Anti-Corruption Layer

- **CSV size cap**: Rejects import payloads larger than 1 MB to prevent denial-of-service via oversized files.
- **Row-level validation**: Each row is independently validated through `createCameraSchema` (Zod). Validation failures are collected and returned as `errorRows` rather than aborting the entire import.
- **IP normalisation**: IPs are normalised to lowercase and trimmed before duplicate comparison, preventing case-sensitivity bypasses.
- **In-batch deduplication**: `processedIPs` tracks IPs already created in the current batch so a file with repeated rows does not create duplicates.
- **Password encryption at the boundary**: Passwords read from CSV are encrypted immediately with `encryptPassword()` before `storage.createCamera()` is called. Plaintext passwords are never stored.
- **Admin-only import**: `POST /api/cameras/import` requires `requireAdmin`. Export endpoints require only `requireAuth`.

---

## Server Files

| File | Responsibility |
|------|---------------|
| `server/routes/importExportRoutes.ts` | CSV import (`POST /api/cameras/import`), camera list export (`GET /api/cameras/export`), uptime report export (`GET /api/cameras/export/uptime`) |
| `server/csvUtils.ts` | `parseCSV()` — parses CSV string into `CameraCSVRow[]`; `generateCameraCSV()` — serialises camera list to CSV string; `generateUptimeReportCSV()` — serialises uptime data to CSV string |

---

## Client Files

This domain has no dedicated client pages. The UI entry points are:

| File | Notes |
|------|-------|
| `client/src/components/CSVImportModal.tsx` | Modal dialog that accepts a CSV file, previews parsed rows, and calls `POST /api/cameras/import` |
| `client/src/pages/Cameras.tsx` | Contains the export button that triggers `GET /api/cameras/export` |
| `client/src/pages/Reports.tsx` | Contains the uptime report export button that triggers `GET /api/cameras/export/uptime` |

---

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/cameras/import` | admin | Accept CSV string in request body; create camera records; return import summary with skipped/error rows |
| GET | `/api/cameras/export` | any | Stream camera list as `cameras.csv` attachment (passwords excluded) |
| GET | `/api/cameras/export/uptime` | any | Stream uptime report as `uptime-report.csv` attachment (name, IP, 30-day uptime %) |

---

## Dependencies

### What this domain depends on
- **Camera Registry** — `storage.createCamera()` to persist imported cameras; `storage.getCamerasByUserId()` to check for existing IPs and generate export data; `createCameraSchema` for row validation
- **Uptime Monitoring** — `storage.calculateUptimePercentage()` to compute per-camera uptime for the uptime report CSV
- `server/encryption.ts` — `encryptPassword()` called for each imported camera password
- `server/cameraMonitor.ts` — `checkAllCameras()` triggered after a successful import
- **IAM** — `requireAuth`/`requireAdmin` middleware on all endpoints

### What depends on this domain
Nothing depends on this domain at runtime. It is a pure consumer that delegates all outputs to Camera Registry and triggers Uptime Monitoring side-effects.
