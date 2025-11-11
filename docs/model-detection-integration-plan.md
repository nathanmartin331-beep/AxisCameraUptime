# Model Detection Integration Plan for Camera Monitor

## Current Status: BLOCKED - Waiting for Dependencies

### Required Dependencies (Must be completed first):

1. **Database Schema Update** (shared/schema.ts)
   - Add `model: text("model")` field to cameras table
   - Add `modelDetectedAt: integer("model_detected_at", { mode: "timestamp" })` field
   - Update migration to add these columns

2. **Detection Service** (server/services/cameraDetection.ts)
   - Must export: `detectCameraModel(ipAddress: string, username: string, password: string)`
   - Should return: `{ model: string, firmware: string, serialNumber?: string }`
   - Should handle errors gracefully with proper error types

3. **Storage Layer Extension** (server/storage.ts)
   - Add method: `updateCameraModel(id: string, modelInfo: DetectionResult): Promise<void>`
   - Update IStorage interface to include this method

### Integration Points in cameraMonitor.ts

Once dependencies are ready, the following changes will be made:

#### 1. Import Detection Service (Line 3)
```typescript
import { detectCameraModel } from "./services/cameraDetection";
```

#### 2. Add Model-Aware Video Endpoint Function (After checkVideoStream)
```typescript
/**
 * Get the appropriate video endpoint based on camera model
 * Falls back to standard JPEG endpoint for unknown models
 */
function getVideoEndpoint(camera: Camera): string {
  // Default endpoint works for most Axis cameras
  const defaultEndpoint = "/axis-cgi/jpg/image.cgi";

  if (!camera.model) {
    return defaultEndpoint;
  }

  // Model-specific endpoints can be added here
  // Example: Some older models might use different paths
  // if (camera.model.startsWith("M10")) {
  //   return "/axis-cgi/mjpg/image.cgi";
  // }

  return defaultEndpoint;
}
```

#### 3. Update checkVideoStream to Use Dynamic Endpoint (Line 28)
```typescript
// BEFORE:
const url = `http://${ipAddress}/axis-cgi/jpg/image.cgi`;

// AFTER (requires camera object to be passed):
const url = `http://${ipAddress}${endpoint}`;
```

This requires refactoring checkVideoStream signature:
```typescript
export async function checkVideoStream(
  ipAddress: string,
  username: string,
  password: string,
  endpoint: string = "/axis-cgi/jpg/image.cgi",  // Add endpoint parameter with default
  timeout: number = 5000
): Promise<VideoCheckResponse>
```

#### 4. Add Lazy Model Detection (After line 211, in checkAllCameras)
```typescript
// After successful systemready check and status update
// Add model detection if not already detected
if (!camera.model && result.systemReady) {
  // Lazy detection (non-blocking) - don't await
  detectCameraModel(camera.ipAddress, camera.username, decryptedPassword)
    .then(async (modelInfo) => {
      await storage.updateCameraModel(camera.id, modelInfo);
      console.log(
        `[Monitor] 🔍 Detected model for ${camera.name}: ${modelInfo.model} (${modelInfo.firmware})`
      );
    })
    .catch((err) => {
      console.warn(
        `[Monitor] ⚠️  Model detection failed for ${camera.name}: ${err.message}`
      );
      // Detection failure is non-critical, continue monitoring
    });
}
```

#### 5. Update Video Check to Use Dynamic Endpoint (Line 226-235)
```typescript
// BEFORE:
const videoCheck = await checkVideoStream(
  camera.ipAddress,
  camera.username,
  decryptedPassword,
  3000
);

// AFTER:
const videoEndpoint = getVideoEndpoint(camera);
const videoCheck = await checkVideoStream(
  camera.ipAddress,
  camera.username,
  decryptedPassword,
  videoEndpoint,
  3000
);
```

#### 6. Enhanced Logging (Multiple locations)
```typescript
// Update success log (line 237)
console.log(
  `[Monitor] ✓ ${camera.name} (${camera.ipAddress})${camera.model ? ` [${camera.model}]` : ""} - Online, Video OK ${rebooted ? "(REBOOTED)" : ""}`
);

// Update video failure log (line 243)
console.log(
  `[Monitor] ⚠ ${camera.name} (${camera.ipAddress})${camera.model ? ` [${camera.model}]` : ""} - Online but Video FAILED: ${videoError.message}`
);

// Update offline log (line 271)
console.log(
  `[Monitor] ✗ ${camera.name} (${camera.ipAddress})${camera.model ? ` [${camera.model}]` : ""} - Offline: ${error.message}`
);
```

### Testing Requirements

Once integration is complete:

1. **Test with camera that has no model**: Should detect and store model info
2. **Test with camera that already has model**: Should not re-detect (use cache)
3. **Test with unreachable camera**: Detection should fail gracefully
4. **Test video endpoint selection**: Verify correct endpoint is used based on model
5. **Test detection failure handling**: Should not break polling cycle

### Performance Considerations

- **Lazy detection**: Never blocks the main polling cycle
- **Caching**: Once detected, model info is stored and reused
- **Non-critical**: Detection failures don't affect uptime monitoring
- **Async execution**: Detection runs in background, doesn't impact response time

### Coordination Notes

This integration maintains backward compatibility:
- Works with cameras that don't have model info (falls back to defaults)
- Doesn't change existing polling behavior
- Adds model detection as an enhancement, not a requirement
- All changes are additive, no breaking changes

### Next Steps

1. ✅ Wait for backend developer to complete detection service
2. ✅ Wait for database schema migration with model field
3. ✅ Wait for storage layer extension with updateCameraModel method
4. 🔄 Implement integration points documented above
5. 🔄 Test thoroughly with various camera models
6. 🔄 Update documentation with model detection behavior
