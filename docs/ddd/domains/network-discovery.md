# Domain: Network Discovery

## Bounded Context

The Network Discovery domain is responsible for finding Axis cameras that are present on the local network but not yet registered in the system. It provides multiple discovery strategies (HTTP subnet scan, CIDR scan, Bonjour/mDNS multicast, SSDP multicast) and allows an admin to bulk-add discovered devices directly into the Camera Registry.

This domain also owns the CSV import pathway, which allows cameras to be registered from a pre-prepared spreadsheet rather than live network discovery.

This domain produces no persistent state of its own — it generates transient discovery results (value objects) and delegates creation of permanent records to the Camera Registry.

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **ScanResult** | A transient value object describing a device found during a network scan: `ipAddress`, `isAxis`, `model`, `serial`, `firmware`, `series`, `discoveryMethod`, `detectedProtocol`. |
| **NetworkInterface** | A local network interface record with IP address, subnet, and CIDR notation — used to pre-fill the scan form. |
| **Subnet Scan** | HTTP probe of a sequential range of IP addresses within a `/24` subnet (e.g. `192.168.1.1–254`). |
| **CIDR Scan** | IP range scan derived from CIDR notation (e.g. `192.168.1.0/24`). Capped at 10,000 hosts. |
| **Bonjour / mDNS** | Apple/Avahi multicast DNS discovery: listens for `_axis-video._tcp` service announcements on the local LAN. |
| **SSDP** | Simple Service Discovery Protocol multicast: discovers Axis cameras announcing themselves via UPnP/SSDP. |
| **Unified Discovery** | Combined discovery run: optionally runs Bonjour, SSDP, and HTTP scan in parallel and merges results. |
| **Bulk Add** | An operation that takes a list of discovered `ipAddress` + credential pairs and creates Camera records for each non-duplicate entry. |
| **CSV Import** | Parsing a comma-separated file of camera definitions and creating Camera records in bulk. |
| **Already Added** | A flag on a discovery result indicating the IP is already registered by the current user, used to prevent duplicate addition. |
| **Discovery Method** | How a device was found: `"http"`, `"bonjour"`, `"ssdp"`, or `"cidr"`. |

---

## Aggregate Roots

This domain has no persistent aggregate roots. All discovered results are value objects that exist only within the scope of a single API request/response cycle. Persistence happens in the Camera Registry when the user confirms an add.

---

## Value Objects

- **ScanResult** — Transient scan output per device:
  - `ipAddress: string`
  - `isAxis: boolean`
  - `model: string | null`
  - `serial: string | null`
  - `firmware: string | null`
  - `series: string | null`
  - `discoveryMethod: string`
  - `detectedProtocol: "http" | "https"`
  - `alreadyAdded: boolean` (added at API layer by comparing against the user's existing cameras)

- **NetworkInterface** — Local network interface descriptor:
  - `name: string`
  - `address: string`
  - `cidr: string`
  - `subnet: string`

---

## Domain Events

This domain publishes no persistent events. The only side-effect of discovery is delegation to the Camera Registry:

| Operation | Trigger | Delegated to |
|-----------|---------|-------------|
| Camera records created | `POST /api/cameras/bulk-add` | Camera Registry `storage.createCamera()` |
| Camera records created | `POST /api/cameras/import` (CSV) | Camera Registry `storage.createCamera()` |
| Initial status check | After bulk-add or CSV import | `checkAllCameras()` in Uptime Monitoring (2 s delay) |

---

## Anti-Corruption Layer

- **CIDR size guard**: The CIDR scan rejects requests for more than 10,000 hosts, preventing accidental large network scans from overloading the server.
- **Subnet format validation**: Subnet scan validates the regex pattern `^\d{1,3}\.\d{1,3}\.\d{1,3}$` before processing.
- **Duplicate IP guard**: Bulk-add and CSV import compare against `existingIPs` (normalised to lowercase) before attempting any camera creation, producing a `skipped` list instead of a duplicate record.
- **IP uniqueness within import file**: CSV import additionally tracks `processedIPs` during the batch to reject duplicates that appear multiple times within the same file.
- **CSV size limit**: CSV import rejects payloads larger than 1 MB.
- **Bulk-add size limit**: The bulk-add endpoint caps requests at 50 cameras per call.
- **Ownership isolation**: Discovered cameras are flagged `alreadyAdded` relative to the requesting user's list only; other users' cameras do not affect the result.
- **Admin-only writes**: All endpoints that modify state (bulk-add, CSV import) require the `admin` role. Discovery/scan endpoints also require admin.

---

## Server Files

| File | Responsibility |
|------|---------------|
| `server/networkScanner.ts` | `scanSubnet()`, `scanIPRange()`, `discoverCameras()`, `getLocalSubnets()`: implements all scan strategies (HTTP ping, Bonjour, SSDP, CIDR enumeration) |
| `server/routes/networkRoutes.ts` | REST endpoints: subnet scan, CIDR scan, network interfaces, unified discovery, bulk-add, test-connection |

---

## Client Files

| File | Responsibility |
|------|---------------|
| `client/src/pages/NetworkScan.tsx` | Main network discovery page: interface selector, scan mode tabs (subnet / CIDR / unified), results table with bulk-add controls |
| `client/src/components/NetworkScanModal.tsx` | Modal dialog for initiating a network scan from within the Cameras page |
| `client/src/components/CSVImportModal.tsx` | Modal dialog for uploading and previewing a CSV file before import |

---

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/scan/subnet` | admin | Scan a subnet by `{ subnet, startRange, endRange }` (legacy format) |
| POST | `/api/cameras/scan` | admin | Scan a CIDR range (e.g. `192.168.1.0/24`), returns Axis-only results |
| GET | `/api/network/interfaces` | any | Return list of local network interfaces with subnet/CIDR info |
| POST | `/api/cameras/discover` | admin | Unified discovery: combines Bonjour, SSDP, and optional HTTP scan. Returns results with `alreadyAdded` flag |
| POST | `/api/cameras/bulk-add` | admin | Create camera records for a list of `{ ipAddress, username, password, ... }` objects |
| POST | `/api/cameras/import` | admin | Parse CSV content string and create camera records in bulk |
| GET | `/api/cameras/export` | any | Export all cameras as CSV (lives in Import/Export domain but route is nearby) |
| POST | `/api/cameras/:id/test-connection` | any | Test VAPIX connectivity to an existing camera and return diagnostic info |

---

## Dependencies

### What this domain depends on
- **Camera Registry** — `storage.createCamera()` called for each successfully added device; `storage.getCamerasByUserId()` used to populate the `alreadyAdded` flag
- `server/encryption.ts` — Encrypts credentials before camera creation during bulk-add
- `server/cameraMonitor.ts` — `checkAllCameras()` triggered after successful adds
- `server/services/cameraUrl.ts` — `buildCameraUrl()`, `getCameraDispatcher()`, `getConnectionInfo()` for test-connection
- **IAM** — `requireAuth`/`requireAdmin` middleware on all endpoints

### What depends on this domain
Nothing depends on this domain at runtime. It is a pure producer that delegates all outputs to Camera Registry.
