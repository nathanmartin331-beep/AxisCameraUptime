# Network Scanner Enhancement - Real Model Detection

## Overview

Enhanced the network scanner to detect real Axis camera models during subnet scanning using the VAPIX param.cgi API.

## Implementation Summary

### 1. Created Camera Model Detection Service
**File**: `/workspaces/AxisCameraUptime/server/cameraModelDetection.ts`

**Key Functions**:
- `detectCameraModel()` - Detects camera model via VAPIX param.cgi API
- `parseCameraModel()` - Parses model strings (e.g., "AXIS M3027-PVE")
- `extractFeatures()` - Extracts features from model variants
- `parseVapixResponse()` - Parses VAPIX param.cgi response format

**Capabilities**:
- Supports all major Axis camera series (P, Q, M, F)
- Extracts variant information (outdoor, vandal-resistant, low-light, etc.)
- Identifies camera type (fixed-dome, box, PTZ, modular)
- Detects capabilities (PTZ, audio, resolution)
- Configurable timeout (default: 5s)
- Optional authentication support

### 2. Enhanced Network Scanner
**File**: `/workspaces/AxisCameraUptime/server/networkScanner.ts`

**Changes**:

#### Updated ScanResult Interface
```typescript
export interface ScanResult {
  ipAddress: string;
  isAxis: boolean;
  model?: string;        // NEW: Real model name
  series?: string;       // NEW: P, Q, M, F
  capabilities?: {       // NEW: Camera capabilities
    hasPTZ?: boolean;
    hasAudio?: boolean;
    resolution?: string;
  };
  error?: string;
}
```

#### Model Detection Integration
- After confirming Axis camera via `systemready.cgi`
- Attempts model detection via `param.cgi`
- Uses shorter timeout (2s vs 5s) for scanner performance
- Falls back to "Axis Camera" if detection fails
- Doesn't fail scan on detection errors

#### Performance Optimization
- Fast detection: 2-second timeout per camera
- Batch processing: 20 IPs at a time (maintained)
- Non-blocking: Detection errors don't break scan
- Efficient: Only detects after confirming Axis camera

### 3. Error Handling

**Graceful Degradation**:
- Model detection failure → Falls back to "Axis Camera"
- Network timeout → Returns minimal info
- Authentication failure (401) → Returns "Unknown Axis Camera"
- Malformed response → Returns partial information

**Logging**:
- Warning logged on detection failure
- Scan continues regardless of errors
- Partial information always returned

## API Response Format

### VAPIX param.cgi Response
```
root.Brand.Brand=AXIS
root.Properties.ProdFullName=AXIS M3027-PVE Network Camera
root.Properties.ProdNbr=M3027-PVE
root.Properties.ProdType=Network Camera
```

### Parsed Result
```typescript
{
  fullName: "AXIS M3027-PVE Network Camera",
  model: "3027",
  series: "M",
  variant: "PVE",
  type: "fixed-dome",
  features: ["outdoor", "vandal-resistant"],
  capabilities: {
    hasPTZ: false
  }
}
```

## Camera Series Support

| Series | Type | Example | Features |
|--------|------|---------|----------|
| **M** | Fixed Dome/Box | M3027-PVE | Compact, versatile |
| **P** | Box Camera | P1365 | Traditional box form |
| **Q** | PTZ | Q6155-E | Pan/Tilt/Zoom |
| **F** | Modular | F34 | Flexible installation |

## Variant Codes

| Code | Meaning | Example |
|------|---------|---------|
| **E** | Outdoor | M3027-**E** |
| **V** | Vandal-resistant | M3027-P**V**E |
| **L** | Low-light | P1448-**L**E |
| **P** | Power over Ethernet+ | M3027-**P**VE |

## Performance Characteristics

- **Scanner timeout**: 3 seconds (systemready check)
- **Detection timeout**: 2 seconds (param.cgi)
- **Total time per IP**: ~5 seconds max
- **Batch size**: 20 IPs concurrently
- **Scan speed**: ~240 IPs per minute

## Backward Compatibility

✅ **Fully backward compatible**:
- `model`, `series`, `capabilities` are optional fields
- Existing code without model info continues to work
- UI can display model when available
- Falls back to "Axis Camera" when not available

## Testing

**Test File**: `/workspaces/AxisCameraUptime/server/__tests__/networkScanner.test.ts`

**Test Coverage**:
- ScanResult interface validation
- Performance characteristics
- Model detection integration
- Error handling scenarios
- Backward compatibility

## Usage Example

### Before
```typescript
{
  ipAddress: "192.168.1.100",
  isAxis: true,
  model: "Axis Camera" // Generic hardcoded
}
```

### After
```typescript
{
  ipAddress: "192.168.1.100",
  isAxis: true,
  model: "AXIS M3027-PVE",
  series: "M",
  capabilities: {
    hasPTZ: false,
    hasAudio: true
  }
}
```

## Integration Points

### For UI Components
```typescript
// Display real model name
<CameraCard
  model={camera.model || "Axis Camera"}
  series={camera.series}
  hasPTZ={camera.capabilities?.hasPTZ}
/>

// Filter by series
cameras.filter(c => c.series === "M") // M-series only
```

### For Database Storage
```typescript
// Store enhanced information
await db.cameras.insert({
  ipAddress: scanResult.ipAddress,
  model: scanResult.model,
  series: scanResult.series,
  capabilities: scanResult.capabilities
});
```

## Next Steps

1. **UI Integration**: Update camera cards to display real model info
2. **Database Migration**: Add series and capabilities columns
3. **Testing**: Add integration tests with mock VAPIX responses
4. **Documentation**: Update API docs with new ScanResult format
5. **Monitoring**: Track detection success rates

## Related Files

- `/workspaces/AxisCameraUptime/server/cameraModelDetection.ts` - Detection service
- `/workspaces/AxisCameraUptime/server/networkScanner.ts` - Enhanced scanner
- `/workspaces/AxisCameraUptime/server/__tests__/cameraModelDetection.test.ts` - Detection tests
- `/workspaces/AxisCameraUptime/server/__tests__/networkScanner.test.ts` - Scanner tests

## Coordination

**Memory Namespace**: `swarm/coder/scanner-enhancement`

**Notified Agents**:
- Backend developer: For API integration
- Frontend developer: For UI updates
- Database developer: For schema changes
- Tester: For test implementation

---

**Implemented by**: Coder Agent
**Date**: 2025-11-11
**Status**: ✅ Complete
