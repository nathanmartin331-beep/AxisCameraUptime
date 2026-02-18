# Storage Model Extension - Integration Guide

## Prerequisites Checklist

Before integrating the model storage methods, ensure:

- [ ] Schema updated in `shared/schema.ts` with:
  - [ ] `model: text("model")` field
  - [ ] `modelDetectedAt: integer("model_detected_at", { mode: "timestamp" })` field
  - [ ] `capabilities: text("capabilities", { mode: "json" })` field
- [ ] Database migrated with new fields
- [ ] Types exported from schema
- [ ] Tests passing

## Integration Steps

### Step 1: Update IStorage Interface

Add new method signatures to `IStorage` interface in `server/storage.ts`:

```typescript
export interface IStorage {
  // ... existing methods ...

  // Model-related operations
  updateCameraModel(
    cameraId: string,
    modelData: {
      model: string;
      capabilities?: Record<string, any>;
    }
  ): Promise<Camera | undefined>;

  getCameraModel(cameraId: string): Promise<{
    model: string;
    modelDetectedAt: Date;
    capabilities: Record<string, any>;
  } | null>;

  getCamerasWithoutModel(userId?: string): Promise<Camera[]>;

  updateCameraCapabilities(
    cameraId: string,
    capabilities: Record<string, any>,
    merge?: boolean
  ): Promise<Camera | undefined>;

  getCamerasByModel(
    modelName: string,
    userId?: string
  ): Promise<Camera[]>;

  getCamerasByCapability(
    capabilityName: string,
    capabilityValue?: any,
    userId?: string
  ): Promise<Camera[]>;
}
```

### Step 2: Add Helper Function

Add the deep merge helper at the top of `DatabaseStorage` class:

```typescript
export class DatabaseStorage implements IStorage {
  /**
   * Deep merge two objects (for capability merging)
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        output[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }

    return output;
  }

  // ... existing methods ...
}
```

### Step 3: Copy Methods from storage-model-extension.ts

Copy all six methods from `server/storage-model-extension.ts` into the `DatabaseStorage` class:

1. `updateCameraModel()`
2. `getCameraModel()`
3. `getCamerasWithoutModel()`
4. `updateCameraCapabilities()`
5. `getCamerasByModel()`
6. `getCamerasByCapability()`

Place them after the existing camera methods but before the uptime event methods.

### Step 4: Update Imports

Ensure the following imports are present at the top of `server/storage.ts`:

```typescript
import { eq, and, desc, gte, lte, sql, isNull } from "drizzle-orm";
```

### Step 5: Run Tests

```bash
# Run storage tests
npm test -- storage.test.ts

# Run model extension tests
npm test -- storage-model-extension.test.ts

# Run all tests
npm test
```

### Step 6: Verify Integration

Check that:

1. All tests pass
2. TypeScript compilation succeeds
3. No type errors in storage.ts
4. Export of `storage` singleton works

## Usage Examples

### After Integration

```typescript
import { storage } from './server/storage';

// Update camera model after detection
await storage.updateCameraModel('cam-123', {
  model: 'AXIS M3046-V',
  capabilities: {
    ptz: false,
    audio: true,
    resolution: '1920x1080',
    fps: 30
  }
});

// Get model info
const modelInfo = await storage.getCameraModel('cam-123');
if (modelInfo) {
  console.log(`Model: ${modelInfo.model}`);
  console.log(`Detected: ${modelInfo.modelDetectedAt}`);
}

// Find cameras needing detection
const needDetection = await storage.getCamerasWithoutModel();
console.log(`${needDetection.length} cameras need model detection`);

// Update capabilities (merge)
await storage.updateCameraCapabilities('cam-123', {
  ir: true,
  weatherproof: true
}, true);

// Query by model
const axisCameras = await storage.getCamerasByModel('AXIS M3046-V');

// Query by capability
const ptzCameras = await storage.getCamerasByCapability('ptz', true);
const audioCameras = await storage.getCamerasByCapability('audio');
```

## API Integration

Update API routes to expose new functionality:

### GET /api/cameras/:id/model

```typescript
app.get('/api/cameras/:id/model', async (req, res) => {
  const modelInfo = await storage.getCameraModel(req.params.id);
  if (!modelInfo) {
    return res.status(404).json({ error: 'Model not detected' });
  }
  res.json(modelInfo);
});
```

### POST /api/cameras/:id/detect-model

```typescript
app.post('/api/cameras/:id/detect-model', async (req, res) => {
  // Model detection logic here
  const detectedModel = await detectCameraModel(camera);

  const updated = await storage.updateCameraModel(req.params.id, {
    model: detectedModel.name,
    capabilities: detectedModel.capabilities
  });

  res.json(updated);
});
```

### GET /api/cameras/by-model/:model

```typescript
app.get('/api/cameras/by-model/:model', async (req, res) => {
  const cameras = await storage.getCamerasByModel(req.params.model);
  res.json(cameras);
});
```

### GET /api/cameras/by-capability/:capability

```typescript
app.get('/api/cameras/by-capability/:capability', async (req, res) => {
  const { value } = req.query;
  const cameras = await storage.getCamerasByCapability(
    req.params.capability,
    value
  );
  res.json(cameras);
});
```

## Performance Considerations

### Indexing

Add indexes for frequently queried fields:

```sql
-- In migration file
CREATE INDEX idx_cameras_model ON cameras(model);
CREATE INDEX idx_cameras_model_detected_at ON cameras(model_detected_at);
```

### Query Optimization

- Use `EXPLAIN QUERY PLAN` to analyze query performance
- Consider caching frequently accessed model info
- Batch model detection for multiple cameras
- Use pagination for large result sets

## Monitoring

Track these metrics:

- Number of cameras with detected models
- Model detection success rate
- Query performance for model/capability searches
- Capability update frequency

## Rollback Plan

If issues arise:

1. Revert schema changes
2. Remove new methods from storage.ts
3. Restore from backup if needed
4. Investigate and fix issues
5. Re-apply when ready

## Files Created

- ✅ `docs/storage-model-extension-plan.md` - Implementation plan
- ✅ `server/storage-model-extension.ts` - Method implementations
- ✅ `server/__tests__/storage-model-extension.test.ts` - Unit tests
- ✅ `docs/storage-integration-guide.md` - This file

## User Management Methods

The storage layer also includes user management methods added for RBAC support:

```typescript
export interface IStorage {
  // ... existing methods ...

  // User management
  getAllUsers(): Promise<SafeUser[]>;
  deleteUser(id: string): Promise<void>;
  updateUser(id: string, data: Partial<User>): Promise<SafeUser>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getSafeUser(id: string): Promise<SafeUser | undefined>;
}
```

The `SafeUser` type is `Omit<User, 'password'>` — it strips the password field from all user objects returned to API consumers.

---

**Status**: Integrated and operational
**Schema**: Updated with `role` column and model detection fields
**Migration**: Run `npx drizzle-kit push` to apply schema changes
