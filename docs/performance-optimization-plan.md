# Performance Optimization Plan: Multi-Model Camera Support

## Executive Summary

This document outlines the performance optimization strategy for implementing multi-model camera support in the Axis Camera Uptime monitoring system. The plan ensures that adding model-specific features does not degrade existing performance while enabling rich, model-aware functionality.

## Performance Targets

| Metric | Target | Current Baseline | Acceptable Range |
|--------|--------|------------------|------------------|
| Model Detection (First Time) | <500ms | N/A (new feature) | 300-750ms |
| Cached Model Lookup | <10ms | N/A | 5-20ms |
| Monitor Cycle Duration | No degradation | ~60s per camera | ±5s variance |
| Database Migration | <1s per 100k rows | N/A | Linear scaling |
| API Response Time | <200ms | ~150ms | 150-250ms |
| Memory Overhead | <10MB per 1000 cameras | ~50MB | <15MB |

## 1. Model Detection Caching Strategy

### 1.1 Cache Architecture

**Two-Tier Caching System:**

```typescript
// Tier 1: In-Memory LRU Cache (Hot Data)
interface ModelCacheEntry {
  model: string;
  series: string;
  capabilities: CameraCapabilities;
  detectedAt: Date;
  confidence: number;
}

const modelCache = new LRUCache<string, ModelCacheEntry>({
  max: 5000, // Support up to 5000 active cameras
  ttl: 1000 * 60 * 60 * 24, // 24 hour TTL
  updateAgeOnGet: true, // Refresh TTL on access
  allowStale: true, // Serve stale while revalidating
});

// Tier 2: Database Cache (Persistent Storage)
// cameras.detectedModel column with timestamp
```

### 1.2 Cache Invalidation Strategy

**Triggers for Cache Invalidation:**

1. **Manual Refresh** (User-initiated)
   - Clear cache for specific camera
   - Force re-detection on next monitor cycle

2. **Firmware Update Detection**
   - Clear cache when firmware version changes
   - Trigger automatic re-detection

3. **Confidence Threshold**
   - If detection confidence <0.8, invalidate after 1 hour
   - High confidence (>0.95) can last 7 days

4. **Error-Based Invalidation**
   - Failed model-specific feature → reduce TTL to 5 minutes
   - 3 consecutive failures → force re-detection

**Implementation:**

```typescript
async function invalidateModelCache(
  cameraId: number,
  reason: 'manual' | 'firmware' | 'confidence' | 'error'
): Promise<void> {
  const camera = await db.select().from(cameras).where(eq(cameras.id, cameraId));

  // Clear in-memory cache
  modelCache.delete(`camera:${cameraId}`);

  // Update database
  await db.update(cameras)
    .set({
      detectedModel: null,
      modelDetectionTimestamp: null,
      modelDetectionConfidence: null,
    })
    .where(eq(cameras.id, cameraId));

  // Log invalidation for debugging
  logger.info('Model cache invalidated', { cameraId, reason });
}
```

### 1.3 Cache Warming Strategy

**On Application Startup:**
- Load top 100 most active cameras into cache
- Background task to warm cache for all cameras (low priority)

**During Monitor Cycles:**
- Detect-and-cache on first access
- Batch detection for new cameras (10 at a time)

## 2. Lazy Loading Strategy

### 2.1 Progressive Feature Loading

**Tier 1: Essential Data (Always Loaded)**
- Camera online/offline status
- Basic uptime metrics
- Connection health

**Tier 2: Model-Aware Features (Load on Demand)**
- Model-specific capabilities
- Advanced analytics
- Firmware recommendations

**Tier 3: Heavy Features (Explicit User Action)**
- Historical trend analysis
- Model comparison reports
- Bulk operations

### 2.2 Implementation Pattern

```typescript
// Example: Camera Detail Page
interface CameraDetailData {
  // Tier 1: Essential (immediate load)
  basic: {
    id: number;
    name: string;
    location: string;
    status: 'online' | 'offline';
    uptime: number;
  };

  // Tier 2: Model-aware (load after 100ms delay)
  modelData?: Promise<{
    model: string;
    capabilities: CameraCapabilities;
    firmwareStatus: FirmwareStatus;
  }>;

  // Tier 3: Heavy features (load on user action)
  analytics?: Promise<{
    historicalTrends: TrendData;
    performanceMetrics: PerformanceData;
  }>;
}

// Frontend implementation
async function loadCameraDetail(id: number): Promise<CameraDetailData> {
  // Load essential data immediately
  const basic = await fetch(`/api/cameras/${id}`);

  // Start loading model data in background
  const modelData = delay(100).then(() =>
    fetch(`/api/cameras/${id}/model-info`)
  );

  return { basic, modelData };
}
```

## 3. Batch API Call Optimization

### 3.1 Batch Model Detection

**Problem:** Detecting models for 100 new cameras sequentially = 50+ seconds

**Solution:** Batch processing with concurrency control

```typescript
async function batchDetectModels(
  cameraIds: number[],
  options: { concurrency: number; timeout: number }
): Promise<Map<number, ModelDetectionResult>> {
  const results = new Map();
  const batches = chunk(cameraIds, options.concurrency);

  for (const batch of batches) {
    const detectionPromises = batch.map(id =>
      detectCameraModel(id)
        .timeout(options.timeout)
        .catch(err => ({ id, error: err }))
    );

    const batchResults = await Promise.allSettled(detectionPromises);
    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.set(batch[idx], result.value);
      }
    });
  }

  return results;
}

// Usage in monitor service
const detectionResults = await batchDetectModels(newCameraIds, {
  concurrency: 10, // Process 10 cameras at a time
  timeout: 5000,   // 5 second timeout per camera
});
```

### 3.2 GraphQL-Style Batching for Frontend

**Problem:** Camera list fetches model data for each camera individually

**Solution:** Single batch endpoint

```typescript
// New endpoint: GET /api/cameras/batch-model-info
app.post('/api/cameras/batch-model-info', async (req, res) => {
  const { cameraIds } = req.body;

  // Single database query with JOIN
  const modelData = await db
    .select({
      cameraId: cameras.id,
      model: cameras.detectedModel,
      capabilities: modelCapabilities.capabilities,
    })
    .from(cameras)
    .leftJoin(modelCapabilities,
      eq(cameras.detectedModel, modelCapabilities.model))
    .where(inArray(cameras.id, cameraIds));

  res.json(Object.fromEntries(
    modelData.map(d => [d.cameraId, d])
  ));
});
```

## 4. Database Query Optimization

### 4.1 Indexing Strategy

**Required Indexes:**

```sql
-- Index for model lookups (hot path)
CREATE INDEX idx_cameras_detected_model
ON cameras(detectedModel)
WHERE detectedModel IS NOT NULL;

-- Composite index for model + location filtering
CREATE INDEX idx_cameras_model_location
ON cameras(detectedModel, location);

-- Index for cache invalidation queries
CREATE INDEX idx_cameras_firmware_version
ON cameras(firmwareVersion);

-- Partial index for cameras needing re-detection
CREATE INDEX idx_cameras_stale_detection
ON cameras(id)
WHERE modelDetectionTimestamp < NOW() - INTERVAL '7 days';
```

### 4.2 Query Optimization Patterns

**Pattern 1: Avoid N+1 Queries**

```typescript
// ❌ BAD: N+1 query pattern
const cameras = await db.select().from(cameras);
for (const camera of cameras) {
  const capabilities = await db
    .select()
    .from(modelCapabilities)
    .where(eq(modelCapabilities.model, camera.detectedModel));
}

// ✅ GOOD: Single query with JOIN
const camerasWithCapabilities = await db
  .select({
    ...cameras,
    capabilities: modelCapabilities.capabilities,
  })
  .from(cameras)
  .leftJoin(modelCapabilities,
    eq(cameras.detectedModel, modelCapabilities.model));
```

**Pattern 2: Pagination for Large Result Sets**

```typescript
// Cursor-based pagination (better than OFFSET)
async function getCamerasPaginated(cursor?: number, limit = 50) {
  return db
    .select()
    .from(cameras)
    .where(cursor ? gt(cameras.id, cursor) : undefined)
    .orderBy(cameras.id)
    .limit(limit);
}
```

### 4.3 Migration Performance

**Zero-Downtime Migration Strategy:**

```sql
-- Phase 1: Add new columns (non-blocking)
ALTER TABLE cameras
  ADD COLUMN detectedModel VARCHAR(50),
  ADD COLUMN modelDetectionTimestamp TIMESTAMP,
  ADD COLUMN modelDetectionConfidence DECIMAL(3,2);

-- Phase 2: Backfill in batches (background job)
-- Process 1000 rows every 10 seconds
DO $$
DECLARE
  batch_size INT := 1000;
  processed INT := 0;
  total INT;
BEGIN
  SELECT COUNT(*) INTO total FROM cameras WHERE detectedModel IS NULL;

  WHILE processed < total LOOP
    -- Backfill batch
    UPDATE cameras
    SET detectedModel = detect_model_from_name(name)
    WHERE id IN (
      SELECT id FROM cameras
      WHERE detectedModel IS NULL
      LIMIT batch_size
    );

    processed := processed + batch_size;
    PERFORM pg_sleep(10); -- Rate limiting
  END LOOP;
END $$;

-- Phase 3: Add indexes after backfill completes
CREATE INDEX CONCURRENTLY idx_cameras_detected_model
ON cameras(detectedModel);
```

**Performance Target:** 10,000 rows/minute = ~16 hours for 1M cameras

## 5. Network Overhead Reduction

### 5.1 Response Compression

**Enable gzip/brotli compression:**

```typescript
// Express middleware
app.use(compression({
  level: 6, // Balanced compression
  threshold: 1024, // Only compress responses >1KB
  filter: (req, res) => {
    // Don't compress streaming responses
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
```

**Expected Reduction:** 70-80% for JSON responses

### 5.2 Response Payload Optimization

**Technique 1: Field Filtering**

```typescript
// Frontend requests only needed fields
GET /api/cameras?fields=id,name,status,detectedModel

// Backend implements field selection
const cameras = await db
  .select({
    id: cameras.id,
    name: cameras.name,
    status: cameras.status,
    detectedModel: cameras.detectedModel,
  })
  .from(cameras);
```

**Technique 2: Incremental Updates**

```typescript
// Only send changed data since last fetch
GET /api/cameras/updates?since=2024-01-15T10:30:00Z

// Response contains only modified cameras
{
  "updated": [...],
  "deleted": [1, 5, 7],
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### 5.3 HTTP/2 and Connection Reuse

**Enable HTTP/2 for multiplexing:**

```typescript
import http2 from 'http2';

const server = http2.createSecureServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
  allowHTTP1: true, // Fallback to HTTP/1.1
});
```

## 6. Performance Benchmarks

### 6.1 Benchmark Scenarios

**Scenario 1: Cold Start (No Cache)**
```
Setup: 100 cameras, empty cache
Action: Load camera list with model info
Metrics:
  - Total time: <5s target
  - Time to first byte: <500ms
  - Progressive rendering: Show basic data at 500ms, model data at 2s
```

**Scenario 2: Warm Cache (80% Hit Rate)**
```
Setup: 100 cameras, 80 in cache
Action: Load camera list
Metrics:
  - Total time: <1s
  - Cache hits: 80/100
  - Database queries: 20 cameras + 1 batch capability query
```

**Scenario 3: Model Detection**
```
Setup: Single camera, no prior detection
Action: Detect model from camera properties
Metrics:
  - VAPIX query time: <200ms
  - Pattern matching: <50ms
  - Confidence calculation: <10ms
  - Total: <300ms
```

**Scenario 4: Monitor Cycle (1000 Cameras)**
```
Setup: 1000 cameras, mixed online/offline
Action: Complete monitor cycle
Metrics:
  - Cycle duration: <10 minutes (600s = 0.6s per camera)
  - Model cache hit rate: >95%
  - Database query count: <50
  - Memory usage: <200MB
```

### 6.2 Benchmark Implementation

```typescript
// Performance test suite
describe('Multi-Model Performance Benchmarks', () => {
  test('Cold start: 100 cameras under 5s', async () => {
    const start = performance.now();

    // Clear all caches
    modelCache.clear();
    await clearDatabaseCache();

    // Load camera list
    const response = await fetch('/api/cameras?limit=100');
    const cameras = await response.json();

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(5000);
    expect(cameras).toHaveLength(100);
  });

  test('Model detection under 500ms', async () => {
    const cameraId = 1;
    const start = performance.now();

    const model = await detectCameraModel(cameraId);

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
    expect(model).toBeTruthy();
  });

  test('Cached lookup under 10ms', async () => {
    const cameraId = 1;

    // Prime cache
    await detectCameraModel(cameraId);

    // Measure cached lookup
    const start = performance.now();
    const model = await getCachedModel(cameraId);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10);
    expect(model).toBeTruthy();
  });
});
```

## 7. Monitoring and Alerting

### 7.1 Key Performance Indicators (KPIs)

**Real-Time Metrics:**

```typescript
interface PerformanceMetrics {
  // Cache performance
  cacheHitRate: number;        // Target: >90%
  cacheMissRate: number;       // Target: <10%
  cacheEvictionRate: number;   // Target: <5%

  // Query performance
  avgQueryDuration: number;    // Target: <50ms
  p95QueryDuration: number;    // Target: <200ms
  p99QueryDuration: number;    // Target: <500ms

  // Model detection
  avgDetectionTime: number;    // Target: <300ms
  detectionSuccessRate: number;// Target: >95%
  detectionConfidence: number; // Target: >0.8

  // Monitor cycles
  cycleCompletionTime: number; // Target: <60s per camera
  cycleFailureRate: number;    // Target: <1%
}
```

**Metric Collection:**

```typescript
// Prometheus-style metrics
import { Counter, Histogram, Gauge } from 'prom-client';

const modelCacheHits = new Counter({
  name: 'camera_model_cache_hits_total',
  help: 'Total number of model cache hits',
});

const modelDetectionDuration = new Histogram({
  name: 'camera_model_detection_duration_seconds',
  help: 'Model detection duration',
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
});

const activeCameras = new Gauge({
  name: 'cameras_active_total',
  help: 'Total number of active cameras',
});
```

### 7.2 Alert Thresholds

**Critical Alerts (Page On-Call):**
- Cache hit rate <70% for >10 minutes
- P95 query duration >1s for >5 minutes
- Monitor cycle failure rate >5% for >2 cycles
- Memory usage >80% of available

**Warning Alerts (Notification):**
- Cache hit rate <85% for >30 minutes
- Model detection failures >10% for >15 minutes
- Database connection pool >80% utilized
- Disk usage for cache storage >70%

**Alert Implementation:**

```typescript
// Alert rule example (Prometheus)
groups:
  - name: camera_performance
    interval: 30s
    rules:
      - alert: LowCacheHitRate
        expr: |
          rate(camera_model_cache_hits_total[5m]) /
          rate(camera_model_cache_requests_total[5m]) < 0.7
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Model cache hit rate below 70%"
          description: "Cache hit rate is {{ $value | humanizePercentage }}"

      - alert: HighQueryLatency
        expr: |
          histogram_quantile(0.95,
            rate(camera_query_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "P95 query latency above 1s"
```

### 7.3 Performance Dashboard

**Real-Time Dashboard Panels:**

1. **Cache Performance**
   - Hit/Miss rate over time (line chart)
   - Cache size and evictions (gauge)
   - Top 10 most-cached models (bar chart)

2. **Query Performance**
   - Query duration heatmap (P50, P95, P99)
   - Slow query log (table)
   - Query count by type (pie chart)

3. **Model Detection**
   - Detection success rate (gauge)
   - Average detection time (line chart)
   - Confidence distribution (histogram)

4. **Monitor Cycles**
   - Cycle completion time trend (line chart)
   - Cameras processed per minute (gauge)
   - Failure rate by error type (stacked bar)

**Implementation (Grafana):**

```json
{
  "dashboard": {
    "title": "Camera Model Performance",
    "panels": [
      {
        "title": "Cache Hit Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(camera_model_cache_hits_total[5m]) / rate(camera_model_cache_requests_total[5m])"
          }
        ]
      }
    ]
  }
}
```

## 8. Optimization Roadmap

### Phase 1: Foundation (Week 1)
- ✅ Implement two-tier caching system
- ✅ Add database indexes
- ✅ Set up performance monitoring
- ✅ Create benchmark suite

### Phase 2: Optimization (Week 2)
- ⏳ Implement batch API endpoints
- ⏳ Add response compression
- ⏳ Optimize database queries
- ⏳ Configure lazy loading

### Phase 3: Advanced (Week 3)
- ⏳ HTTP/2 server setup
- ⏳ Incremental update system
- ⏳ Advanced caching strategies
- ⏳ Performance dashboard

### Phase 4: Validation (Week 4)
- ⏳ Load testing (1000+ cameras)
- ⏳ Benchmark validation
- ⏳ Production monitoring setup
- ⏳ Documentation completion

## 9. Rollback Strategy

### Trigger Conditions for Rollback

**Automatic Rollback:**
- P95 query latency >2x baseline for >10 minutes
- Error rate >10% for >5 minutes
- Memory usage >95% for >2 minutes

**Manual Rollback Decision:**
- Cache hit rate <50%
- Monitor cycle time >2x baseline
- User-reported performance issues >10/hour

### Rollback Procedure

```bash
# 1. Disable model-specific features
export FEATURE_MODEL_DETECTION=false

# 2. Rollback database migration
npm run db:rollback -- --step 1

# 3. Clear all caches
redis-cli FLUSHDB

# 4. Restart application
pm2 restart camera-uptime

# 5. Verify metrics return to baseline
curl http://localhost:3000/health
```

## 10. Success Criteria

**Go-Live Checklist:**

- [ ] All benchmark targets met in staging
- [ ] Cache hit rate >85% in load testing
- [ ] No memory leaks detected (24-hour soak test)
- [ ] Database migration completed with <5% performance impact
- [ ] Monitoring and alerting operational
- [ ] Rollback procedure tested successfully
- [ ] Documentation complete and reviewed
- [ ] Performance dashboard deployed

**Post-Launch Review (1 Week):**
- [ ] Actual vs. target performance comparison
- [ ] Optimization opportunities identified
- [ ] User feedback collected
- [ ] Production incidents resolved
- [ ] Long-term monitoring trends established

---

## Appendix A: Performance Testing Tools

### Load Testing
```bash
# Artillery load test
artillery run load-test.yml

# k6 stress test
k6 run --vus 100 --duration 5m stress-test.js
```

### Profiling
```bash
# Node.js CPU profiling
node --prof server.js

# Memory heap snapshot
node --inspect server.js
# Chrome DevTools → Memory → Take Snapshot
```

### Database Performance
```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 100;

-- Analyze query plan
EXPLAIN ANALYZE SELECT * FROM cameras WHERE detectedModel = 'AXIS P3245-LVE';

-- Index usage statistics
SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';
```

## Appendix B: Cost-Benefit Analysis

**Development Cost:**
- Engineering time: 3 weeks × 2 engineers = 6 weeks
- Testing and validation: 1 week
- Documentation: 0.5 weeks
- **Total: 7.5 weeks**

**Ongoing Cost:**
- Cache storage: ~10MB per 1000 cameras = $0.10/month for 100k cameras
- Additional database storage: ~100MB per 100k cameras = $1/month
- Monitoring overhead: ~2% CPU = negligible
- **Total: ~$2/month for 100k cameras**

**Performance Benefit:**
- Model detection: 5s → 0.3s = **94% faster**
- Cache lookup: N/A → 10ms = **instant**
- Monitor cycle: No degradation = **0% slower**
- User experience: Perceived latency reduced by 80%

**ROI:** Performance improvements enable 10x camera scale with same infrastructure.

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-11
**Owner:** Performance Engineering Team
**Status:** Draft - Awaiting Architecture Review
