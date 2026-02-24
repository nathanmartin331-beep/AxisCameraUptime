# ADR-019: Security Hardening — Headers + Rate Limiting

## Status
Accepted

## Date
2025-01-01

## Context
The application is an Express server that serves both the React SPA and a JSON REST API. It handles user authentication (username/password login) and user registration. Without security hardening, the server is vulnerable to:

- **Clickjacking**: Embedding the app in a cross-origin iframe.
- **MIME sniffing**: Browsers incorrectly interpreting response content types.
- **Information disclosure**: `X-Powered-By: Express` header advertising the server stack.
- **Credential stuffing / brute force**: Unlimited login attempts.
- **Registration abuse**: Automated account creation.

The `helmet` npm package was installed as a dependency to provide standard security headers via Express middleware but was not wired up to the application.

## Decision

### HTTP Security Headers
Apply security headers **manually** via a custom Express middleware rather than relying on `helmet`. The following headers are set on every response:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking via iframe embedding |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter for older browsers |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer header leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables unused browser features |
| `X-Powered-By` | (removed) | Suppress Express version disclosure |

**HSTS** (`Strict-Transport-Security`) is applied **conditionally**: only when the `NODE_ENV=production` environment variable is set AND the server detects it is running behind HTTPS (either direct TLS or a trusted reverse proxy). This prevents HSTS breaking local development over HTTP.

```typescript
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production' && isHttps(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
```

### Rate Limiting
Apply rate limiting at the route level using `express-rate-limit`:

- **Login endpoint** (`POST /api/auth/login`): **5 attempts per 15 minutes** per IP address. Returns HTTP 429 with a `Retry-After` header after the limit is exceeded.
- **Registration endpoint** (`POST /api/auth/register`): **3 attempts per hour** per IP address.

```typescript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/auth/login', loginLimiter, loginHandler);
app.post('/api/auth/register', registrationLimiter, registrationHandler);
```

### Raw Body Capture
The raw request body is captured and stored on the request object for **all** incoming requests before the JSON body parser runs. This is a preparatory measure to support **webhook signature verification** in a future integration (e.g., Axis camera event push notifications via VAPIX event API).

```typescript
app.use((req, _res, next) => {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    (req as RequestWithRawBody).rawBody = data;
    next();
  });
});
```

## Consequences

### Positive
- Manually applied security headers are explicit and visible in code review; no hidden defaults or unexpected header values from a third-party package.
- Conditional HSTS prevents accidental HSTS preloading in non-production environments, which would break development workflows.
- Rate limiting on auth endpoints significantly raises the cost of credential-stuffing attacks with negligible impact on legitimate users.
- Raw body capture is zero-cost overhead during normal operation and enables future webhook signature verification without a refactor.

### Negative
- Manual header management means new security recommendations (e.g., `Cross-Origin-Opener-Policy`, Content Security Policy) must be explicitly added; `helmet` would provide these automatically as the package is updated.
- Rate limiting by IP address can incorrectly block legitimate users behind a NAT gateway sharing a single IP. A future implementation should consider rate limiting by username or device fingerprint for the login endpoint.
- The `express-rate-limit` in-memory store resets on process restart; a Redis-backed store would be needed for accurate rate limiting across multiple instances or restarts.

### Neutral
- A Content Security Policy (CSP) header is not included in this decision. CSP for a React SPA with inline scripts (Vite dev HMR) requires careful configuration to avoid breaking the development experience; it is deferred to a future security review.
- The `rawBody` capture adds the entire request body to memory before JSON parsing. For large file upload endpoints this would be a memory concern, but no such endpoints currently exist.

## Technical Debt
- **`helmet` is installed but unused.** The package appears in `package.json` as a dependency but is not wired into `app.ts`. This is confusing: maintainers may assume helmet is providing protection when it is not, or may not realise it needs to be connected. Either remove the dependency or wire it up and replace the manual header middleware.
- The raw body capture mechanism lacks a size limit guard. A `Content-Length` check or `express-body-parser` `limit` option should be applied to prevent memory exhaustion from maliciously large payloads.
- No Content Security Policy is in place. CSP is the most effective defence against XSS for a browser-rendered application and should be prioritised in the next security review cycle.

## Related
- [ADR-001: Runtime Stack](adr-001-runtime-stack.md)
- [ADR-012: Client Framework](adr-012-client-framework.md)
