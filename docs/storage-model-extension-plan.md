# Storage Model Extension Implementation Plan

## Status: Waiting for Backend Developer

The schema must be updated with model-related fields before storage methods can be implemented.

## Required Schema Changes (Backend Developer Task)

The `cameras` table in `shared/schema.ts` needs these additional fields:

```typescript
// Add to cameras table:
model: text("model"),                           // Camera model name (e.g., "AXIS M3046-V")
modelDetectedAt: integer("model_detected_at", { mode: "timestamp" }),
capabilities: text("capabilities", { mode: "json" }).$type<{
  ptz?: boolean;
  audio?: boolean;
  ir?: boolean;
  weatherproof?: boolean;
  resolution?: string;
  fps?: number;
  [key: string]: any;
}>(),
```

## Storage Methods to Implement

### 1. updateCameraModel
```typescript
async updateCameraModel(
  cameraId: string,
  modelData: {
    model: string;
    capabilities?: Record<string, any>;
  }
): Promise<Camera | undefined>
```

**Purpose**: Update camera model information after detection
**Logic**:
- Update model field
- Set modelDetectedAt to current timestamp
- Merge capabilities if provided
- Update updatedAt timestamp
- Return updated camera

### 2. getCameraModel
```typescript
async getCameraModel(cameraId: string): Promise<{
  model: string;
  modelDetectedAt: Date;
  capabilities: Record<string, any>;
} | null>
```

**Purpose**: Retrieve camera model information
**Logic**:
- Query camera by ID
- Return model, modelDetectedAt, capabilities
- Return null if camera not found or model not detected

### 3. getCamerasWithoutModel
```typescript
async getCamerasWithoutModel(userId?: string): Promise<Camera[]>
```

**Purpose**: Find cameras that need model detection
**Logic**:
- Query cameras where model is NULL
- Optionally filter by userId
- Order by createdAt (oldest first for batch processing)
- Return array of cameras

### 4. updateCameraCapabilities
```typescript
async updateCameraCapabilities(
  cameraId: string,
  capabilities: Record<string, any>,
  merge: boolean = true
): Promise<Camera | undefined>
```

**Purpose**: Update camera capabilities JSON field
**Logic**:
- If merge=true: Deep merge with existing capabilities
- If merge=false: Replace capabilities entirely
- Update updatedAt timestamp
- Return updated camera

### 5. getCamerasByModel
```typescript
async getCamerasByModel(
  modelName: string,
  userId?: string
): Promise<Camera[]>
```

**Purpose**: Query cameras by model name
**Logic**:
- Query cameras where model matches (case-insensitive)
- Optionally filter by userId
- Order by name
- Useful for analytics and reporting

### 6. getCamerasByCapability
```typescript
async getCamerasByCapability(
  capabilityName: string,
  capabilityValue?: any,
  userId?: string
): Promise<Camera[]>
```

**Purpose**: Find cameras with specific capability
**Logic**:
- Query cameras where capabilities JSON contains key
- Optionally check if value matches
- Examples:
  - `getCamerasByCapability("ptz", true)` - all PTZ cameras
  - `getCamerasByCapability("audio")` - all cameras with audio capability
- Filter by userId if provided
- Order by name

## Implementation Requirements

### Type Safety
- Use proper TypeScript types from schema
- Handle null/undefined gracefully
- Return type should match schema inference

### Error Handling
- Wrap in try-catch blocks
- Log errors with context
- Throw meaningful error messages
- Don't expose sensitive data in errors

### Performance
- Use Drizzle ORM efficiently
- Add proper indexes if needed
- Avoid N+1 queries
- Consider pagination for large result sets

### Transaction Safety
- Use transactions for multi-step operations
- Ensure atomic updates
- Handle rollback scenarios

### JSON Handling
- Deep merge for capabilities (use lodash merge or custom)
- Validate JSON structure
- Handle malformed JSON gracefully

## Testing Requirements

Create tests for:
1. Model detection and update
2. Capability merging
3. Querying by model
4. Querying by capability
5. Null/undefined handling
6. JSON edge cases

## Integration Points

- **Polling Service**: Will call `updateCameraModel()` after detection
- **API Routes**: Will expose model queries via REST endpoints
- **Frontend**: Will display model info in camera details
- **Reports**: Will use model queries for analytics

## Dependencies

- Wait for schema update in `shared/schema.ts`
- Coordinate with backend developer
- Test with actual Axis camera responses

## Next Steps

1. ✅ Document implementation plan
2. ⏳ Wait for schema update (Backend Developer)
3. ⏳ Implement storage methods
4. ⏳ Add unit tests
5. ⏳ Integration testing
6. ⏳ Update IStorage interface

---

**Status**: Ready to implement once schema is updated
**Created**: 2025-11-11
**Assignee**: Coder Agent
