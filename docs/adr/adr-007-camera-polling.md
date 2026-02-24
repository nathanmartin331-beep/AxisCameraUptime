# ADR-007: Camera Polling — Cron + Cohort Staggering + p-limit

## Status

Accepted

## Date

2025-01-01

## Context

The core function of the application is to periodically check the reachability and status of
every managed camera and record the result. At the target scale of 2500+ cameras, naively
firing all HTTP requests simultaneously would:

- Exhaust the Node.js event loop with thousands of concurrent TCP connections.
- Saturate the local network interface or a shared network segment.
- Produce a thundering-herd pattern of database writes all landing at the same moment.

The polling must be lightweight enough to run continuously in the same process as the HTTP API
without degrading API response times.

Evaluated alternatives:

- **Worker threads**: Could parallelize CPU-bound work, but camera polling is I/O-bound. Adding
  worker threads increases implementation complexity without addressing the thundering-herd issue.
- **Separate microservice**: Clean isolation, but requires inter-process communication (IPC,
  HTTP, or a message bus) and a more complex deployment and restart strategy.
- **Bull/BullMQ job queue**: Robust retry, dead-letter queues, and distributed workers. Adds
  Redis dependency and significantly more infrastructure for what is a single-process tool.

## Decision

Camera polling is implemented in **`server/cameraMonitor.ts`** using the following architecture:

**Scheduling**: `node-cron` fires a polling cycle every 5 minutes (`*/5 * * * *`).

**Cohort staggering**: Cameras are divided into cohorts of a configurable size (default 50).
Each cohort is dispatched with a stagger delay of `cohortIndex * staggerMs` (default 200 ms
between cohorts). This spreads the network load across the full inter-poll interval and
distributes database writes evenly over time rather than in a single burst.

**Concurrency control**: Within each cohort, `p-limit(25)` caps the number of simultaneously
in-flight HTTP requests to 25. This prevents socket exhaustion while keeping per-cohort
completion time reasonable.

**Protocol variant caching**: The VAPIX protocol variant (whether a camera requires Basic auth,
Digest auth, or supports specific firmware API versions) is cached in a bounded `Map<string,
ProtocolVariant>` keyed by camera IP address. The map is capped at 5000 entries with an LRU-like
eviction policy to prevent unbounded memory growth. This eliminates the need to re-negotiate the
auth protocol on every poll cycle after the first successful handshake.

**Batch database writes**: Instead of one `INSERT` per camera result, poll results are
accumulated in an array during the cohort execution and written in a single prepared-statement
loop after the cohort completes. This minimizes SQLite write transaction overhead.

## Consequences

### Positive

- Cohort staggering naturally distributes network and database load without requiring a job queue.
- `p-limit` provides a simple, zero-dependency concurrency cap that prevents socket exhaustion.
- Protocol variant caching eliminates redundant 401-then-retry round-trips on subsequent poll
  cycles, reducing per-camera poll latency after the first cycle.
- Batch writes reduce the number of SQLite transactions from one per camera to one per cohort.

### Negative

- All polling runs in the main Node.js process. A misbehaving camera (e.g., one that hangs for
  the full TCP timeout) occupies one of the 25 `p-limit` slots for that cohort until the
  request timeout fires.
- Request timeouts must be tuned carefully: too short causes false-offline reports; too long
  delays cohort completion and risks inter-cycle overlap.
- If the polling cycle takes longer than 5 minutes (e.g., because thousands of cameras all
  time out), `node-cron` will start a second overlapping cycle. An overlap guard flag is needed.

### Neutral

- The 5-minute poll interval is configurable but is not currently exposed via the UI. Changing
  it requires a server restart.
- The p-limit concurrency of 25 and cohort size of 50 are tuned empirically; they are
  configurable constants at the top of `cameraMonitor.ts`.

## Technical Debt

1. **`cameraMonitor.ts` exceeds 500-line limit**: At 1136 lines, the file substantially violates
   the project's file-size guideline. It should be split into:
   - `cameraMonitor.ts` — scheduling and cohort orchestration
   - `cameraPoll.ts` — single-camera poll execution
   - `protocolCache.ts` — VAPIX protocol variant cache
   - `pollWriter.ts` — batch database write logic
2. **No cycle overlap guard**: A boolean `isPolling` flag should prevent `node-cron` from
   starting a new cycle while the previous one is still running.
3. **Timeout configuration**: Request timeouts are not currently surfaced in settings or
   environment variables.

## Related

- ADR-002: Database — SQLite via better-sqlite3 + Drizzle ORM
- ADR-004: Repository Pattern — storage.ts as Data Access Layer
- ADR-008: VAPIX Auth — Custom HTTP Digest Implementation
- ADR-009: TLS Handling — Self-Signed Cert Acceptance + TOFU Pinning
