# SSL/HTTPS Implementation Plan for Axis Camera Monitoring

## Current Limitations

**What Works Now:**
- ✅ HTTP connections on port 80
- ✅ Unauthenticated VAPIX `systemready.cgi` endpoint
- ✅ Basic uptime monitoring

**What's Missing:**
- ❌ HTTPS support (port 443)
- ❌ Custom port configuration
- ❌ SSL certificate handling (self-signed certs)
- ❌ Authenticated VAPIX operations
- ❌ HTTP Digest/Basic authentication

## Architectural Impact Analysis

### 1. Database Schema Changes

**Current Schema:**
```typescript
cameras: {
  ipAddress: varchar("ip_address", { length: 45 })  // Just IP
}
```

**Proposed Schema:**
```typescript
cameras: {
  ipAddress: varchar("ip_address", { length: 45 }),    // Keep as-is
  protocol: varchar("protocol", { length: 5 })         // "http" or "https"
    .notNull()
    .default("http"),
  port: integer("port")                                // 80, 443, or custom
    .notNull()
    .default(80),
  useSSL: boolean("use_ssl")                          // Shorthand flag
    .notNull()
    .default(false),
  verifySslCert: boolean("verify_ssl_cert")           // Allow self-signed?
    .notNull()
    .default(false),
}
```

**Migration Strategy:**
```sql
-- Add new columns with safe defaults (all existing cameras default to HTTP:80)
ALTER TABLE cameras ADD COLUMN protocol VARCHAR(5) NOT NULL DEFAULT 'http';
ALTER TABLE cameras ADD COLUMN port INTEGER NOT NULL DEFAULT 80;
ALTER TABLE cameras ADD COLUMN use_ssl BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cameras ADD COLUMN verify_ssl_cert BOOLEAN NOT NULL DEFAULT false;

-- For cameras on known HTTPS setups, update:
-- UPDATE cameras SET protocol='https', port=443, use_ssl=true WHERE ...;
```

### 2. URL Construction Changes

**Current (Hardcoded):**
```typescript
const url = `http://${ipAddress}/axis-cgi/systemready.cgi`;
```

**Proposed (Dynamic):**
```typescript
function buildCameraURL(camera: Camera, endpoint: string): string {
  const protocol = camera.protocol || 'http';
  const port = camera.port || (protocol === 'https' ? 443 : 80);
  
  // Only include port in URL if non-standard
  const portSuffix = 
    (protocol === 'http' && port === 80) || 
    (protocol === 'https' && port === 443) 
      ? '' 
      : `:${port}`;
  
  return `${protocol}://${camera.ipAddress}${portSuffix}${endpoint}`;
}

// Usage:
const url = buildCameraURL(camera, '/axis-cgi/systemready.cgi');
// Results:
// - http://192.168.1.100/axis-cgi/systemready.cgi  (HTTP default)
// - https://192.168.1.100/axis-cgi/systemready.cgi (HTTPS default)
// - http://192.168.1.100:8080/axis-cgi/systemready.cgi (custom port)
```

### 3. HTTPS Agent Configuration

**Problem:** Axis cameras typically use **self-signed certificates**. Node.js fetch/HTTPS will reject these by default.

**Solution:** Create custom HTTPS agent that optionally accepts self-signed certificates:

```typescript
import https from 'https';

function createHTTPSAgent(verifyCert: boolean = false): https.Agent {
  return new https.Agent({
    rejectUnauthorized: verifyCert,  // false = accept self-signed
    timeout: 10000,
  });
}

// When fetching:
const agent = camera.useSSL 
  ? createHTTPSAgent(camera.verifySslCert) 
  : undefined;

const response = await fetch(url, {
  signal: controller.signal,
  agent,  // Only used for HTTPS
  headers: {
    "User-Agent": "AxisCameraMonitor/1.0",
  },
});
```

**Security Considerations:**
- Default `verifySslCert=false` for ease of use with self-signed certs
- Allow users to enable verification if they have proper CA-signed certs
- Log warning when accepting unverified certificates in production

### 4. VAPIX Authentication Support

Currently the system uses **unauthenticated** endpoints. For authenticated operations, Axis cameras support:

**Option A: HTTP Basic Authentication** (Simpler)
```typescript
const authHeader = Buffer.from(`${username}:${password}`).toString('base64');

const response = await fetch(url, {
  headers: {
    "Authorization": `Basic ${authHeader}`,
    "User-Agent": "AxisCameraMonitor/1.0",
  },
});
```

**Option B: HTTP Digest Authentication** (More Secure)
Requires handling WWW-Authenticate challenge-response:
```typescript
// Install: npm install digest-fetch
import DigestFetch from 'digest-fetch';

const client = new DigestFetch(username, password);
const response = await client.fetch(url);
```

**Recommendation:** Start with Basic Auth (simpler), add Digest Auth later if needed.

### 5. Frontend Changes

**Add Camera Modal Updates:**
```tsx
<FormField name="protocol">
  <Select defaultValue="http">
    <SelectItem value="http">HTTP</SelectItem>
    <SelectItem value="https">HTTPS</SelectItem>
  </Select>
</FormField>

<FormField name="port">
  <Input type="number" placeholder="80" />
  <p className="text-xs text-muted-foreground">
    Default: 80 for HTTP, 443 for HTTPS
  </p>
</FormField>

<FormField name="verifySslCert">
  <Checkbox />
  <Label>Verify SSL Certificate (disable for self-signed)</Label>
</FormField>
```

### 6. CSV Import Format Update

**Current Format:**
```csv
Camera Name,IP Address,Location,Username,Password
```

**Proposed Format:**
```csv
Camera Name,IP Address,Port,Protocol,Location,Username,Password,Verify SSL
Front Cam,192.168.1.100,80,http,Lobby,admin,pass123,false
Secure Cam,192.168.1.101,443,https,Server Room,admin,pass456,false
Custom Port,192.168.1.102,8443,https,Entrance,admin,pass789,true
```

**Backward Compatibility:** If Port/Protocol columns missing, default to HTTP:80

## Implementation Phases

### Phase 1: Foundation (Required for SSL)
**Priority:** HIGH  
**Effort:** 4-6 hours

1. ✅ Add schema columns (protocol, port, useSSL, verifySslCert)
2. ✅ Run database migration
3. ✅ Update `insertCameraSchema` in shared/schema.ts
4. ✅ Create `buildCameraURL()` helper function
5. ✅ Create `createHTTPSAgent()` helper function
6. ✅ Update all URL construction (cameraMonitor, networkScanner, routes)

**Testing:** Verify HTTP cameras still work, add test HTTPS camera

### Phase 2: Frontend Support
**Priority:** HIGH  
**Effort:** 2-3 hours

1. ✅ Update AddCameraModal with protocol/port fields
2. ✅ Update CSV import to support new columns
3. ✅ Add UI hints for SSL certificate warnings
4. ✅ Update camera detail views to show protocol/port

**Testing:** Add camera via UI with HTTPS, test CSV import

### Phase 3: Authenticated Endpoints
**Priority:** MEDIUM  
**Effort:** 3-4 hours

1. ✅ Implement HTTP Basic Auth in pollCamera
2. ✅ Add authentication toggle to camera settings
3. ✅ Update test endpoint to show auth results
4. ⏸️ Optional: Add HTTP Digest Auth support

**Testing:** Test authenticated VAPIX endpoints

### Phase 4: Network Scanner SSL Support
**Priority:** LOW  
**Effort:** 1-2 hours

1. ✅ Update scanner to try both HTTP and HTTPS
2. ✅ Detect which protocol each camera supports
3. ✅ Return protocol info in scan results

## Dependencies Required

### NPM Packages

**None required immediately** - Node.js built-in `https` module handles SSL.

**Optional (for Digest Auth):**
```bash
npm install digest-fetch
npm install @types/digest-fetch --save-dev
```

### Environment Variables

**Optional:**
```bash
# Force strict SSL verification in production
STRICT_SSL_VERIFICATION=true

# Default protocol for new cameras
DEFAULT_CAMERA_PROTOCOL=https
```

## Backward Compatibility

**Existing Cameras:**
- All existing cameras default to `http://` on port `80`
- No behavior change unless user updates camera settings
- Migration adds columns with safe defaults

**Existing Code:**
- `buildCameraURL()` helper maintains existing behavior when protocol/port are null
- Frontend forms show default values (http, 80)

## Security Best Practices

### 1. SSL Certificate Warnings
```typescript
if (camera.useSSL && !camera.verifySslCert) {
  console.warn(
    `[Security] Camera ${camera.name} uses HTTPS with unverified certificates. ` +
    `This is vulnerable to man-in-the-middle attacks.`
  );
}
```

### 2. Production Recommendations
- Enable `verifySslCert` for production deployments
- Use proper CA-signed certificates on cameras when possible
- Log all SSL verification bypasses for audit

### 3. Credential Protection
- Current: ✅ Already encrypting passwords with bcryptjs
- HTTPS: ✅ Credentials transmitted securely when using SSL
- HTTP: ⚠️ Warn users that HTTP transmits credentials in plaintext

## Testing Strategy

### Unit Tests
```typescript
describe('buildCameraURL', () => {
  test('HTTP default port', () => {
    expect(buildCameraURL({ ipAddress: '192.168.1.100', protocol: 'http', port: 80 }, '/test'))
      .toBe('http://192.168.1.100/test');
  });
  
  test('HTTPS default port', () => {
    expect(buildCameraURL({ ipAddress: '192.168.1.100', protocol: 'https', port: 443 }, '/test'))
      .toBe('https://192.168.1.100/test');
  });
  
  test('Custom port', () => {
    expect(buildCameraURL({ ipAddress: '192.168.1.100', protocol: 'https', port: 8443 }, '/test'))
      .toBe('https://192.168.1.100:8443/test');
  });
});
```

### Integration Tests
1. Test HTTP camera connection (port 80)
2. Test HTTPS camera connection (port 443) with self-signed cert
3. Test custom port (e.g., 8080, 8443)
4. Test authentication (Basic Auth)
5. Test SSL verification toggle

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Self-signed cert rejection | HIGH | Default `verifySslCert=false`, user can enable |
| Port conflicts | MEDIUM | Allow custom ports, validate input |
| Auth credential exposure | HIGH | Use HTTPS, warn on HTTP, encrypt storage |
| Backward compatibility break | MEDIUM | Safe defaults, migration with existing data |
| Network scanner slowdown | LOW | Scanner tries HTTP first (faster), HTTPS second |

## Timeline Estimate

**Phase 1 (Foundation):** 1 day  
**Phase 2 (Frontend):** 0.5 day  
**Phase 3 (Auth):** 0.5 day  
**Phase 4 (Scanner):** 0.25 day  

**Total:** ~2.5 days for complete implementation

## Questions for Consideration

1. **Default Protocol:** Should new cameras default to HTTP or HTTPS?
   - Recommendation: HTTP (wider compatibility), let user choose HTTPS

2. **SSL Verification:** Default to strict or permissive?
   - Recommendation: Permissive (accept self-signed), with warnings

3. **Authentication Requirement:** Make credentials optional for unauthenticated endpoints?
   - Current: Credentials required but not used for systemready
   - Recommendation: Keep required (needed for future authenticated operations)

4. **Network Scanner:** Try both HTTP and HTTPS (slower) or just one?
   - Recommendation: Try HTTP first, optionally try HTTPS on failure

5. **Migration Timing:** Implement all phases at once or incrementally?
   - Recommendation: Incremental (Phase 1 + 2 first, then 3 + 4)

## Next Steps

**Ready to implement?** Let me know if you want to:
1. Start with Phase 1 (database + core SSL support)
2. Implement all phases at once
3. Make any adjustments to this plan first

This plan ensures your system can handle:
- ✅ HTTP cameras (port 80)
- ✅ HTTPS cameras (port 443)
- ✅ Self-signed certificates
- ✅ Custom ports
- ✅ Authenticated VAPIX operations
- ✅ Both private and public IP addresses
