# ADR-008: VAPIX Auth — Custom HTTP Digest Implementation

## Status

Accepted

## Date

2025-01-01

## Context

Axis cameras expose their management API (VAPIX) over HTTP/HTTPS. Depending on firmware version
and configuration, individual cameras require either **HTTP Basic** or **HTTP Digest**
authentication. Some older firmware versions present a `WWW-Authenticate: Basic` header, while
newer firmware and security-hardened configurations require Digest.

The polling service needs to authenticate against each camera using whichever scheme the camera
requires, ideally without making a separate unauthenticated probe request before every poll.
After the first successful authentication, the scheme for a given camera is cached (see ADR-007)
so subsequent polls can use it directly.

Evaluated npm packages:

- **`axios-digest-auth`**: Digest-only, built on Axios. Does not handle the Basic-first strategy
  and does not support the `undici.Agent` dispatcher needed for custom TLS handling
  (see ADR-009).
- **`node-http-digest`**: Unmaintained, no TypeScript types, incompatible with `undici`.
- **`axios` / `node-fetch` with manual retry**: Would require implementing the Digest challenge
  parsing and response computation manually anyway, without a reusable abstraction.

## Decision

Implement a custom Digest authentication module in **`server/digestAuth.ts`** that:

1. Sends the initial request with **Basic auth credentials** in the `Authorization` header.
2. If the response is `401` with `WWW-Authenticate: Digest ...`, parses the challenge
   (`realm`, `nonce`, `qop`, `opaque`, `algorithm`) and computes the Digest response per
   RFC 7616 using Node.js `crypto.createHash`.
3. Retries the request with the computed `Authorization: Digest ...` header.
4. Returns the final response (or throws on a second 401).

All HTTP requests use **`undici`** (Node.js's built-in HTTP client since Node 18) rather than
the legacy `http`/`https` modules. `undici` supports a custom `Agent` (dispatcher) that can
override TLS behaviour — specifically, the self-signed certificate acceptance required for
cameras with factory-default or self-issued TLS certificates (see ADR-009).

The `digestAuth` function signature is:

```typescript
digestAuth(
  url: string,
  username: string,
  password: string,
  options?: { dispatcher?: undici.Dispatcher; method?: string; body?: string }
): Promise<undici.Response>
```

## Consequences

### Positive

- A single function handles both Basic and Digest, eliminating the need for per-camera
  scheme branching in the caller.
- Built on `undici` means TLS customisation (custom `Agent` with `rejectUnauthorized: false`
  or a certificate fingerprint checker) is passed through naturally via the `dispatcher` option.
- The implementation is self-contained and testable in isolation: a mock HTTP server can
  respond with a 401 Digest challenge and the unit test can verify the correct response header
  is computed.
- No additional npm dependency beyond `undici` (which ships with Node 18+).

### Negative

- Maintaining a custom Digest implementation means owning the correctness of RFC 7616 edge
  cases: `auth-int` qop (request body hashing), `algorithm=SHA-256`, session nonces, and
  `nc` (nonce count) incrementing for persistent connections. Currently only `MD5`/`MD5-sess`
  with `auth` qop is implemented, which covers the Axis firmware versions in the field.
- If Axis introduces a new auth scheme (e.g., Digest with SHA-512), the implementation must
  be extended manually.

### Neutral

- The Basic-first strategy means cameras that only support Basic auth incur no extra round-trip.
  Cameras that require Digest incur one extra request (the initial Basic attempt that receives
  the 401 challenge) only on the first poll; subsequent polls use the cached scheme.

## Technical Debt

1. **`auth-int` qop not implemented**: If Axis firmware is configured to require body integrity
   protection (`qop=auth-int`), authentication will fail. This should be detected and a clear
   error logged.
2. **SHA-256 Digest algorithm not implemented**: RFC 7616 mandates SHA-256 support. The current
   implementation only handles MD5 variants. This should be added.
3. **Nonce count (`nc`) tracking**: The implementation resets `nc` to `00000001` on every
   request rather than incrementing it across requests on the same connection. This is correct
   for short-lived connections but should be addressed if persistent connections are introduced.

## Related

- ADR-007: Camera Polling — Cron + Cohort Staggering + p-limit
- ADR-009: TLS Handling — Self-Signed Cert Acceptance + TOFU Pinning
