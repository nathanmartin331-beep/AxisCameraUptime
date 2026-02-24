# ADR-009: TLS Handling — Self-Signed Cert Acceptance + TOFU Pinning

## Status

Accepted

## Date

2025-01-01

## Context

Axis cameras ship from the factory with self-signed TLS certificates. In a typical enterprise
deployment, cameras are not issued certificates from a trusted CA, because:

- Cameras are on isolated VLANs not reachable by public ACME/Let's Encrypt validation.
- IT departments rarely operate an internal CA for embedded devices.
- Certificate management for 2500+ cameras is operationally complex.

Standard TLS verification (`rejectUnauthorized: true`) would cause every camera poll to fail
with a certificate error. Disabling verification entirely (`rejectUnauthorized: false`) is
simple but eliminates protection against man-in-the-middle attacks if a camera's IP is
spoofed or if a rogue device is inserted into the network.

The application also needs to optionally expose its own management HTTPS endpoint when deployed
with a trusted certificate, while gracefully falling back to HTTP for development and simple
deployments.

## Decision

**Camera-side TLS** (outbound to cameras):

Use **Trust On First Use (TOFU) certificate pinning** implemented in `server/certPinning.ts`.

On the first successful TLS connection to a camera IP address:

1. Extract the SHA-256 fingerprint of the leaf certificate presented by the camera.
2. Store the fingerprint in the `camera_certs` table, associated with the camera's IP address
   and a timestamp.
3. On subsequent connections, verify that the certificate fingerprint matches the stored pin.

**Certificate change behaviour:**

- **Change detected without server reboot** (pin differs from stored value, camera was
  previously reachable): Log a warning — `"Certificate change detected for <ip> without reboot;
  possible MITM"`. The poll result is still recorded but the warning is emitted to the
  application log and surfaced in the `statusBroadcaster` event stream.
- **Change detected after server reboot** (pin differs, but the application has just started):
  Silently re-pin. This covers legitimate firmware upgrades that rotate the self-signed cert.

All outbound camera HTTP requests use an `undici.Agent` constructed with
`connect: { rejectUnauthorized: false }` plus a custom `checkServerIdentity` callback that
performs the TOFU fingerprint check.

**Server-side TLS** (inbound to the application):

When `SSL_CERT_PATH` and `SSL_KEY_PATH` environment variables are set, the Express server is
started with `https.createServer({ cert, key }, app)`. When these variables are absent, the
server binds to plain HTTP. This allows the application to terminate TLS directly (e.g., with
a Let's Encrypt certificate for the management host) without requiring a reverse proxy.

## Consequences

### Positive

- TOFU pinning provides meaningful protection against device substitution attacks after the
  first connection, which is the most realistic threat on a managed camera network.
- Silent re-pin after reboot accommodates the most common legitimate cert change scenario
  (firmware upgrade) without operator intervention.
- The optional server TLS means simple deployments can run over HTTP on a trusted LAN while
  production deployments can use HTTPS without a separate nginx/caddy layer.

### Negative

- TOFU provides no protection against MITM on the *first* connection to a new camera. If a
  rogue device is in place before the first poll, its certificate is pinned.
- The warning for in-session certificate changes is **log-only** — there is no UI alert, no
  email notification, and no automatic camera quarantine. An operator must be actively watching
  logs to notice it.
- `rejectUnauthorized: false` is set globally for all outbound camera connections; there is no
  per-camera opt-in for full CA validation even if a camera has a trusted certificate.

### Neutral

- The `camera_certs` table stores one fingerprint per camera IP. If a camera is reassigned to
  a new device, its old pin must be manually cleared via the API or database.
- Server-side TLS termination in Node.js is acceptable for low-to-moderate traffic; for high
  concurrency, a reverse proxy (nginx, Caddy) should terminate TLS.

## Technical Debt

1. **TOFU warning is log-only**: A UI notification (e.g., a banner on the dashboard or an
   entry in an alerts table) should be added so operators are informed of potential MITM
   events without tailing logs.
2. **No per-camera CA validation option**: A future enhancement should allow operators to
   upload a CA certificate bundle and enable strict validation for cameras that have trusted
   certificates, on a per-camera basis.
3. **No automatic quarantine on cert change**: A detected in-session cert change should
   optionally suspend polling for the affected camera and require manual operator re-approval.

## Related

- ADR-007: Camera Polling — Cron + Cohort Staggering + p-limit
- ADR-008: VAPIX Auth — Custom HTTP Digest Implementation
