# SQL Injection Vulnerability Fix - Camera Capability Queries

**Date**: 2025-11-11
**Priority**: CRITICAL
**Status**: FIXED ✅

## Summary

Fixed a critical SQL injection vulnerability in the camera capability query methods where user input was directly interpolated into SQL queries without proper sanitization.

## Vulnerability Details

### Location
- File: `/workspaces/AxisCameraUptime/server/storage-model-extension.ts`
- Lines: 296, 299
- Method: `getCamerasByCapability()`

### Vulnerable Code

```typescript
// ❌ VULNERABLE - User input directly in sql.raw()
whereClause = sql`json_extract(${cameras.capabilities}, '$.${sql.raw(capabilityName)}') = ${JSON.stringify(capabilityValue)}`;
whereClause = sql`json_extract(${cameras.capabilities}, '$.${sql.raw(capabilityName)}') IS NOT NULL`;
```

### Attack Vector

An attacker could inject malicious SQL by providing a crafted `capabilityName` parameter:

```javascript
// Malicious input example
getCamerasByCapability("ptz') OR 1=1 --", true)
// Would execute: json_extract(..., '$.ptz') OR 1=1 --') = true
// Bypassing security checks and potentially exposing all cameras
```

### CVSS Score
- **Base Score**: 8.1 (High)
- **Vector**: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N
- **Impact**: High confidentiality and integrity impact, potential unauthorized data access

## Fix Implementation

### Secure Code

```typescript
// ✅ SECURE - Sanitized input with whitelist validation
const jsonPath = `$.${capabilityName.replace(/[^a-zA-Z0-9_]/g, '_')}`;

if (capabilityValue !== undefined) {
  const valueParam = JSON.stringify(capabilityValue);
  whereClause = sql`json_extract(${cameras.capabilities}, ${jsonPath}) = ${valueParam}`;
} else {
  whereClause = sql`json_extract(${cameras.capabilities}, ${jsonPath}) IS NOT NULL`;
}
```

### Security Improvements

1. **Input Sanitization**: Capability names are sanitized using a whitelist regex that only allows alphanumeric characters and underscores
2. **Parameterized Values**: Capability values are properly JSON-stringified and passed as parameters
3. **No Raw SQL**: Removed `sql.raw()` usage with user input
4. **Defense in Depth**: Multiple layers of validation ensure malicious input is neutralized

## Integration Status

The fixed methods have been integrated into the main storage class:

### File: `/workspaces/AxisCameraUptime/server/storage.ts`

**Added Methods**:
1. ✅ `updateCameraModel()` - Update camera model information
2. ✅ `getCameraModel()` - Retrieve camera model info
3. ✅ `getCamerasWithoutModel()` - Find cameras needing model detection
4. ✅ `updateCameraCapabilities()` - Update camera capabilities with merge support
5. ✅ `getCamerasByModel()` - Query cameras by model name
6. ✅ `getCamerasByCapability()` - **FIXED** - Query cameras by capability (SQL injection fixed)

**Interface Updates**:
- Added method signatures to `IStorage` interface
- Added JSDoc comments for all methods
- Added type definitions: `CameraModelInfo`, `ModelUpdateData`

## Testing Recommendations

### Security Testing

1. **Test with malicious input**:
```typescript
// Should safely handle SQL injection attempts
await storage.getCamerasByCapability("ptz') OR 1=1 --", true);
await storage.getCamerasByCapability("'; DROP TABLE cameras; --", true);
await storage.getCamerasByCapability("ptz\"; SELECT * FROM users; --", true);
```

2. **Test with legitimate input**:
```typescript
// Should work correctly with valid capability names
await storage.getCamerasByCapability("ptz", true);
await storage.getCamerasByCapability("audio", true);
await storage.getCamerasByCapability("ir_illumination", false);
```

### Functional Testing

1. **Model operations**:
```typescript
// Update model
await storage.updateCameraModel("cam-123", {
  model: "AXIS M3046-V",
  capabilities: { ptz: false, audio: true }
});

// Get model
const model = await storage.getCameraModel("cam-123");
expect(model?.model).toBe("AXIS M3046-V");

// Find cameras without model
const needDetection = await storage.getCamerasWithoutModel();
```

2. **Capability operations**:
```typescript
// Update capabilities (merge)
await storage.updateCameraCapabilities("cam-123", { ir: true }, true);

// Query by capability
const ptzCameras = await storage.getCamerasByCapability("ptz", true);
const audioCameras = await storage.getCamerasByCapability("audio");
```

3. **Model queries**:
```typescript
// Query by model
const axisCameras = await storage.getCamerasByModel("AXIS M3046-V");
const userCameras = await storage.getCamerasByModel("AXIS M3046-V", "user-123");
```

## Migration Notes

### Breaking Changes
None - These are new methods being added to the storage interface.

### Database Requirements
The database schema must have the following fields on the `cameras` table:
- `model` (text, nullable)
- `modelDetectedAt` (timestamp, nullable)
- `capabilities` (json, nullable)

If these fields don't exist, run the schema migration first.

### Deprecation Notice
The standalone file `/workspaces/AxisCameraUptime/server/storage-model-extension.ts` should be considered deprecated now that methods are integrated into the main storage class.

## Security Best Practices Applied

1. ✅ **Input Validation**: Whitelist-based sanitization of user input
2. ✅ **Parameterized Queries**: All user input is parameterized, not concatenated
3. ✅ **No Raw SQL**: Eliminated `sql.raw()` usage with user-controlled data
4. ✅ **Least Privilege**: User ID filtering ensures users can only access their own cameras
5. ✅ **Error Handling**: Proper error messages that don't leak sensitive information
6. ✅ **Type Safety**: TypeScript types prevent type confusion attacks

## Validation Checklist

- [x] Vulnerability identified and analyzed
- [x] Secure fix implemented with input sanitization
- [x] Methods integrated into main storage class
- [x] Interface updated with type-safe signatures
- [x] Error handling verified
- [x] User filtering (authorization) maintained
- [x] Documentation updated
- [ ] Security testing completed (pending)
- [ ] Integration tests written (pending)
- [ ] Code review completed (pending)
- [ ] Deployed to production (pending)

## References

- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [CWE-89: SQL Injection](https://cwe.mitre.org/data/definitions/89.html)
- [Drizzle ORM Security Best Practices](https://orm.drizzle.team/docs/sql)

## Contact

For questions or concerns about this security fix, please contact the development team.
