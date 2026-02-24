# ADR-020: Model Detection — Fire-and-Forget Background

## Status
Accepted

## Date
2025-01-01

## Context
Axis produces hundreds of camera models across multiple product lines. Knowing the specific model of each monitored camera enables two important features:

1. **End-of-Life (EOL) status**: Axis publishes lifecycle data indicating when a model reaches end-of-life. Operators need to be alerted when cameras are running on EOL hardware.
2. **Capability metadata**: Different models have different supported analytics applications, maximum resolution, supported protocols, and firmware update paths. This metadata informs recommendations shown on the camera detail page.

Model detection requires a VAPIX API call to the camera (`/axis-cgi/param.cgi?action=list&group=Brand`) which introduces network latency. Performing this synchronously during camera registration would add noticeable delay to the "Add Camera" flow.

Model information is also relatively static — a camera's model does not change — so aggressive caching is appropriate.

## Decision
- Model detection runs as a **fire-and-forget background task** triggered during the **first successful poll** of a newly added camera.
- Detection results are cached **in-memory** with a **24-hour TTL** using a `Map<cameraId, CachedModelResult>` structure. On cache hit the stored result is returned immediately without a VAPIX call.
- EOL status is determined by looking up the detected model string in a local copy of the **Axis product lifecycle data** (a JSON file bundled with the server, updated as part of the release process).
- Detected model information and EOL status are persisted to a `capabilities` **JSON column** on the `cameras` table so that results survive server restarts and cache expiry.

```typescript
interface ModelDetectionResult {
  model: string;
  productShortName: string;
  serialNumber: string;
  firmwareVersion: string;
  isEol: boolean;
  eolDate?: string;
  capabilities: CameraCapabilities;
  detectedAt: Date;
}

// In-memory cache with TTL
const modelCache = new Map<number, {
  result: ModelDetectionResult;
  expiresAt: number;
}>();

const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getModelInfo(cameraId: number, ipAddress: string): Promise<ModelDetectionResult> {
  const cached = modelCache.get(cameraId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const result = await detectModelFromVapix(ipAddress);
  modelCache.set(cameraId, { result, expiresAt: Date.now() + MODEL_CACHE_TTL_MS });
  await persistCapabilities(cameraId, result);
  return result;
}
```

```typescript
// Fire-and-forget during first poll
async function onFirstSuccessfulPoll(camera: Camera): Promise<void> {
  // Do not await — detection runs in background
  getModelInfo(camera.id, camera.ipAddress).catch((err) => {
    logger.warn('Model detection failed', { cameraId: camera.id, err });
  });
}
```

## Consequences

### Positive
- Camera registration is not blocked by model detection; the "Add Camera" flow returns immediately.
- Subsequent requests for model information are served from memory with zero network overhead during the 24-hour cache window.
- Persistence to the `capabilities` JSON column means model data survives process restarts without re-querying the camera.
- EOL detection from a local lifecycle data file has no external dependency and works in air-gapped deployments.

### Negative
- Fire-and-forget means failures in model detection are not surfaced to the user during the add-camera flow; the operator may not realise detection failed until they check the camera detail page.
- In-memory cache is lost on server restart; a cold restart triggers a VAPIX round-trip per camera on the next poll cycle, which could produce a brief spike in outbound camera requests for large deployments.
- The local Axis lifecycle data file becomes stale between releases; new model EOL announcements will not be reflected until the application is updated and redeployed.

### Neutral
- The `capabilities` JSON column is a flexible catch-all for model metadata; it avoids a separate `capabilities` table but has the same JSON-in-SQL tradeoffs noted in ADR-016.
- Model information is considered immutable for a given camera; there is no automatic re-detection when the model field in `capabilities` is already populated.
- Detection failures are logged at `WARN` level and do not affect the uptime monitoring core loop.

## Technical Debt
- **In-memory cache is not suitable for multi-instance deployments.** A comment in the codebase explicitly notes: "Future: swap with Redis for multi-instance." Until that swap is made, running multiple application instances will produce redundant VAPIX model-detection calls per camera and will not share EOL computation results.
- The Axis product lifecycle JSON file has no automated update mechanism. A scheduled CI job or a VAPIX-based EOL API call would keep the data current without requiring a full application release.
- The fire-and-forget pattern with a silent `.catch()` logger may mask systematic detection failures (e.g., a firmware update that changes the VAPIX parameter group name). An alerting mechanism or retry-with-backoff strategy is recommended for production deployments.

## Related
- [ADR-016: Analytics Data Model](adr-016-analytics-data-model.md)
- [ADR-017: Network Discovery](adr-017-network-discovery.md)
- [ADR-001: Runtime Stack](adr-001-runtime-stack.md)
