# ADR-010: Real-Time Push — SSE over WebSocket

## Status

Accepted

## Date

2025-01-01

## Context

The dashboard needs to reflect camera status changes (online/offline transitions) and live
analytics counts without the operator having to manually refresh the page. Two broad approaches
were considered:

- **Polling from the client**: The browser periodically calls a REST endpoint (e.g., every
  5–10 seconds). Simple to implement but introduces unnecessary latency (updates visible only
  after the next poll) and steady background traffic even when nothing has changed.
- **Server-initiated push**: The server sends updates as events occur. Eliminates polling
  latency and reduces traffic to events-only.

For server-initiated push, two main protocols were available:

- **WebSocket (`ws`)**: Full-duplex, binary-capable, works with any message shape. The `ws`
  package is already installed in the project but exclusively for Vite's HMR (hot module
  replacement) dev server — it is not available as an application-level primitive at runtime.
  Adding a WebSocket server alongside the Express HTTP server requires careful integration
  with the `http.Server` instance and adds protocol upgrade complexity.
- **Server-Sent Events (SSE)**: A unidirectional HTTP/1.1 protocol where the server streams
  `text/event-stream` responses. Natively supported by browsers via the `EventSource` API.
  Auto-reconnect is handled by the browser. Works through standard HTTP middleware, load
  balancers, and reverse proxies without upgrade negotiation.

## Decision

Use **Server-Sent Events (SSE)** for all real-time push to browser clients.

Two broadcaster implementations exist in **`server/statusBroadcaster.ts`** and
**`server/analyticsEventBroadcaster.ts`**:

**`StatusBroadcaster`**:
- Maintains a `Set<(data: string) => void>` of active client callbacks.
- Exposes `subscribe(callback)` / `unsubscribe(callback)` for the SSE route handler.
- `broadcast(event)` serializes the event and calls every registered callback.
- Used by `cameraMonitor.ts` to push camera online/offline status changes as they occur.

**`AnalyticsEventBroadcaster`**:
- Maintains a `Map<cameraId, Set<(data: string) => void>>` — per-camera subscriber sets.
- Allows the analytics dashboard to subscribe to a specific camera's event stream rather than
  receiving all events.
- Used by the analytics routes to stream live counting data from VAPIX event subscriptions.

**SSE route pattern** (applied in `server/routes/events.ts`):

```
GET /api/events/status
GET /api/events/analytics/:cameraId
```

Each route sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
`Connection: keep-alive`, and writes a comment line (`: keepalive`) every 30 seconds to
prevent proxy timeout disconnection. On client disconnect (`req.on('close', ...)`) the
callback is removed from the broadcaster set.

## Consequences

### Positive

- SSE is HTTP/1.1-native — no protocol upgrade, no special WebSocket proxy configuration, and
  it works through standard load balancers and reverse proxies (nginx `proxy_buffering off`).
- `EventSource` in the browser handles reconnection automatically with exponential backoff,
  including re-sending the `Last-Event-ID` header if event IDs are set.
- Unidirectional push matches the actual use case: the server pushes status updates; the
  browser never needs to push events back over the same channel (user actions go through
  normal REST calls).
- Per-camera subscription in `AnalyticsEventBroadcaster` avoids flooding all clients with
  analytics events for cameras they are not currently viewing.

### Negative

- SSE is HTTP/1.1 text-only. Binary payloads require base64 encoding. This is not a concern
  for the current JSON event payloads but would be limiting for video thumbnail streaming.
- HTTP/1.1 has a browser limit of 6 concurrent connections per origin. Each open SSE stream
  consumes one connection slot. If the dashboard opens multiple simultaneous SSE streams
  (status + per-camera analytics), it may approach this limit. HTTP/2 eliminates this
  constraint via multiplexing.
- The `Set<Callback>` approach holds references to response-write callbacks in memory. A
  memory leak occurs if a client disconnects without the `close` event firing (e.g., abrupt
  network cut). The 30-second keepalive comment helps detect dead connections.

### Neutral

- `ws` remains installed as a dependency for Vite HMR during development. It is not used by
  the application server at runtime and should not be confused with an application-level
  WebSocket implementation.
- If bidirectional communication is needed in the future (e.g., live PTZ control feedback),
  WebSocket would be the appropriate upgrade path. The broadcaster pattern is isolatable —
  the route handler implementation can be swapped without changing the broadcaster interface.

## Technical Debt

1. **HTTP/1.1 connection limit**: If the dashboard adds more SSE stream types, consider
   multiplexing them into a single SSE stream with an `event:` type field, or enable HTTP/2
   on the application server.
2. **Dead connection detection**: The keepalive comment detects dead connections only when a
   write fails. An explicit write-error handler should call `unsubscribe` to remove the dead
   callback from the broadcaster set.

## Related

- ADR-001: Runtime Stack — Node.js + Express (ESM)
- ADR-007: Camera Polling — Cron + Cohort Staggering + p-limit
- ADR-011: Routing — Module-Per-Domain Router
