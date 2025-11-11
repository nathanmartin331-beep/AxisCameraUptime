# User Documentation Plan: Multi-Model Camera Support

## Executive Summary

This document outlines the comprehensive documentation strategy for the multi-model camera support feature. The documentation will be created in multiple phases, with user-facing docs prioritized first, followed by developer and operational documentation.

## Documentation Structure

```
docs/
├── SUPPORTED_CAMERAS.md          # End-user: Camera compatibility
├── ADDING_NEW_MODELS.md          # Developer: Model registry extension
├── MIGRATION_GUIDE.md            # Operations: Upgrade instructions
├── API_REFERENCE.md              # Developer: API documentation
├── TROUBLESHOOTING.md            # Support: Common issues
├── ARCHITECTURE.md               # Developer: System design
└── performance-optimization-plan.md  # Operations: Performance guide
```

## Phase 1: End-User Documentation

### Document 1: SUPPORTED_CAMERAS.md

**Target Audience:** End users, camera operators, system administrators

**Structure:**

```markdown
# Axis Camera Models - Compatibility Guide

## Overview
- What model detection means
- Benefits of model-aware features
- How the system determines camera models

## Supported Camera Series

### Fixed Cameras
- P Series (Professional)
- Q Series (Quick Install)
- M Series (Modular)
- F Series (Fixed)

### PTZ Cameras
- PTZ Series

### Specialty Cameras
- Thermal Cameras
- Explosion-Protected Cameras
- Body-Worn Cameras

## Detailed Model Specifications

[Organized by series with expandable sections]

### P Series - Professional Fixed Cameras
#### AXIS P3245-LVE Network Camera
- **Series:** P32xx
- **Form Factor:** Dome
- **Resolution:** 2MP (1920×1080)
- **Key Features:**
  - Lightfinder technology
  - Forensic WDR
  - OptimizedIR
  - IK10 vandal resistance
  - IP66/67 weather protection
- **Supported Features in System:**
  - ✅ Uptime monitoring
  - ✅ Health checks
  - ✅ Firmware update detection
  - ✅ Advanced analytics support
  - ✅ Edge storage monitoring

[Repeat for each model...]

## Capability Comparison Matrix

| Model | Resolution | WDR | Lightfinder | IR | PTZ | Analytics | Edge Storage |
|-------|-----------|-----|-------------|----|----|-----------|--------------|
| P3245-LVE | 2MP | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Q1615 Mk III | 2MP | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| [etc...] | ... | ... | ... | ... | ... | ... | ... |

## Model Detection Process

### Automatic Detection
1. System queries camera via VAPIX API
2. Extracts model from hardware ID
3. Validates against model registry
4. Caches result for 24 hours

### Manual Override
- When to use manual override
- How to specify model manually
- Impact on automatic detection

## Unsupported or Legacy Models

### Partially Supported
- Models with limited feature support
- Workarounds and limitations

### Not Supported
- EOL models
- Non-Axis cameras
- Integration alternatives

## Troubleshooting by Model

### Common Issues by Series
- P Series: [Specific issues]
- Q Series: [Specific issues]
- M Series: [Specific issues]

### Model-Specific Quirks
- Known limitations
- Firmware dependencies
- Configuration requirements

## Future Support

### Upcoming Models
- Planned additions
- Beta support program
- Community contributions

### Request Model Support
- How to request new model
- Information needed
- Expected timeline
```

**Key Features:**
- ✅ Searchable by model number
- ✅ Filterable by capability
- ✅ Mobile-friendly tables
- ✅ Visual icons for features
- ✅ Direct links to Axis specs

### Document 2: TROUBLESHOOTING.md

**Target Audience:** Support staff, system administrators

**Structure:**

```markdown
# Troubleshooting: Multi-Model Camera Support

## Quick Diagnostic Checklist

- [ ] Camera is reachable on network
- [ ] VAPIX API is accessible
- [ ] Authentication credentials valid
- [ ] Firmware version is supported
- [ ] Model detection cache is not stale

## Common Issues

### Issue 1: Model Not Detected
**Symptoms:**
- Camera shows as "Unknown Model"
- Model-specific features unavailable

**Causes:**
1. Camera not in model registry
2. VAPIX API access blocked
3. Non-standard camera configuration
4. Outdated system software

**Solutions:**

**Solution A: Verify VAPIX Access**
```bash
# Test VAPIX endpoint
curl -u username:password \
  http://<camera-ip>/axis-cgi/param.cgi?action=list&group=Properties.System

# Expected response includes:
# root.Properties.System.HardwareID=<model-id>
```

**Solution B: Clear Detection Cache**
```bash
# Via UI: Camera Settings → Advanced → Clear Model Cache
# Via API:
POST /api/cameras/<id>/clear-model-cache
```

**Solution C: Manual Model Override**
```javascript
// In camera settings
{
  "manualModelOverride": "AXIS P3245-LVE",
  "skipAutoDetection": false
}
```

[Repeat pattern for each common issue...]

### Issue 2: Incorrect Model Detected
### Issue 3: Model-Specific Features Not Working
### Issue 4: Performance Degradation After Update
### Issue 5: Cache Invalidation Not Working

## Model-Specific Issues

### P Series Issues
#### P3245-LVE Specific
- **Issue:** Analytics not detected
- **Cause:** ACAP version incompatibility
- **Fix:** Upgrade ACAP to v3.0+

### Q Series Issues
### M Series Issues

## Error Messages Reference

### ERR_MODEL_DETECTION_FAILED
```
Error: Failed to detect camera model
Camera ID: 123
Reason: VAPIX API timeout after 5000ms
```

**Meaning:** System could not reach camera's VAPIX API

**Resolution:**
1. Check camera network connectivity
2. Verify firewall rules allow HTTP/HTTPS
3. Increase timeout in settings (max 10s)
4. Check camera CPU load (<80% recommended)

[Continue for each error code...]

## Performance Issues

### Slow Model Detection
**Symptom:** Detection takes >5 seconds

**Diagnostic Steps:**
1. Check network latency to camera
2. Verify camera CPU usage
3. Review detection logs
4. Test with manual detection

**Optimization:**
- Enable detection cache
- Batch detect multiple cameras
- Use wired connection for detection
- Reduce detection frequency

### High Memory Usage
**Symptom:** Application using >500MB RAM

**Causes:**
- Cache size too large
- Too many cameras in memory
- Memory leak in detection logic

**Solutions:**
- Reduce cache TTL from 24h to 6h
- Implement cache size limits
- Restart application weekly
- Upgrade to latest version

## Diagnostic Tools

### Built-in Diagnostics
```bash
# Model detection test
npm run diagnostic:model-detection -- --camera-id=123

# Cache health check
npm run diagnostic:cache-health

# Performance benchmark
npm run diagnostic:benchmark
```

### Log Analysis
```bash
# View model detection logs
tail -f logs/model-detection.log | grep ERROR

# Analyze cache performance
cat logs/cache-metrics.log | jq '.cacheHitRate'

# Find slow queries
grep "duration > 1000ms" logs/database.log
```

## Support Resources

### Self-Service
- Knowledge base: [link]
- Community forum: [link]
- Video tutorials: [link]

### Contact Support
- Email: support@example.com
- Issue tracker: GitHub Issues
- Emergency: [phone]

### Escalation Process
1. Check this troubleshooting guide
2. Search community forum
3. Open GitHub issue with diagnostic data
4. Contact support if business-critical

## Appendix: Diagnostic Data Collection

### Information to Collect
```bash
# System info
node --version
npm --version
cat package.json | grep version

# Camera details
GET /api/cameras/<id>

# Recent logs (last 100 lines)
tail -100 logs/application.log

# Cache statistics
GET /api/diagnostics/cache-stats

# Performance metrics
GET /api/diagnostics/performance
```

### Sharing Diagnostic Data
- Remove sensitive credentials
- Include camera model and firmware
- Attach relevant log excerpts
- Describe expected vs actual behavior
```

## Phase 2: Developer Documentation

### Document 3: ADDING_NEW_MODELS.md

**Target Audience:** Developers, contributors

**Structure:**

```markdown
# Developer Guide: Adding New Camera Models

## Prerequisites

- Node.js 18+
- Access to target camera for testing
- Axis camera documentation
- Understanding of VAPIX API

## Overview of Model System

### Architecture
```
Model Detection Flow:
1. Camera → VAPIX API Query
2. Extract HardwareID and Properties
3. Match against Model Registry
4. Cache result with capabilities
5. Enable model-specific features
```

### Key Components
- **Model Registry** (`server/models/cameraModels.ts`)
- **Detection Service** (`server/services/modelDetection.ts`)
- **Capability System** (`server/models/capabilities.ts`)
- **Cache Layer** (`server/cache/modelCache.ts`)

## Step-by-Step Guide

### Step 1: Research the Camera

**Gather Required Information:**

1. **Hardware ID**
   ```bash
   curl -u user:pass http://<camera-ip>/axis-cgi/param.cgi?action=list&group=Properties.System
   # Look for: root.Properties.System.HardwareID
   ```

2. **Model Name and Variants**
   - Official model name (e.g., "AXIS P3245-LVE")
   - Variants (e.g., P3245-LV, P3245-VE)
   - Series designation (P32xx)

3. **Technical Specifications**
   - Resolution and sensor
   - Form factor (dome, bullet, box)
   - Special features (WDR, Lightfinder, IR, PTZ)
   - Supported video codecs
   - Analytics capabilities
   - Edge storage support

4. **Firmware Information**
   - Minimum supported firmware version
   - Known firmware issues
   - ACAP compatibility

### Step 2: Add to Model Registry

**File:** `server/models/cameraModels.ts`

```typescript
export interface CameraModel {
  // Unique identifier (matches HardwareID from VAPIX)
  id: string;

  // Human-readable name
  name: string;

  // Series designation (e.g., "P32xx", "Q16xx")
  series: string;

  // Form factor
  formFactor: 'dome' | 'bullet' | 'box' | 'ptz' | 'modular' | 'specialty';

  // Capabilities object
  capabilities: CameraCapabilities;

  // Optional: Known firmware issues or requirements
  firmwareNotes?: {
    minimumVersion?: string;
    knownIssues?: string[];
    recommendedVersion?: string;
  };

  // Optional: Detection hints for edge cases
  detectionHints?: {
    alternateIds?: string[];
    namePatterns?: RegExp[];
  };
}

// Example: Add new model
export const CAMERA_MODELS: CameraModel[] = [
  // ... existing models ...

  {
    id: '12345', // From VAPIX HardwareID
    name: 'AXIS P3245-LVE',
    series: 'P32xx',
    formFactor: 'dome',
    capabilities: {
      maxResolution: { width: 1920, height: 1080 },
      hasWDR: true,
      hasLightfinder: true,
      hasIR: true,
      hasPTZ: false,
      supportsAnalytics: true,
      supportsEdgeStorage: true,
      videoCodecs: ['H.264', 'H.265', 'MJPEG'],
      audioSupport: true,
      weatherProof: 'IP66',
      vandalResistant: 'IK10',
    },
    firmwareNotes: {
      minimumVersion: '9.80.1',
      recommendedVersion: '10.12.0',
      knownIssues: [
        'Firmware <9.80 has analytics bug #123',
        'Edge storage requires firmware 10+',
      ],
    },
    detectionHints: {
      alternateIds: ['12345-V1', '12345-V2'],
      namePatterns: [/P3245[-\s]?LVE?/i],
    },
  },
];
```

### Step 3: Define Capabilities

**File:** `server/models/capabilities.ts`

```typescript
export interface CameraCapabilities {
  // Image quality
  maxResolution: {
    width: number;
    height: number;
  };
  hasWDR: boolean;
  hasLightfinder: boolean;
  hasIR: boolean;

  // Movement
  hasPTZ: boolean;
  ptzCapabilities?: {
    pan: { min: number; max: number };
    tilt: { min: number; max: number };
    zoom: { min: number; max: number };
  };

  // Intelligence
  supportsAnalytics: boolean;
  analyticsTypes?: string[];
  supportsEdgeStorage: boolean;

  // Connectivity
  videoCodecs: string[];
  audioSupport: boolean;
  audioCodecs?: string[];

  // Physical
  weatherProof?: string; // IP rating
  vandalResistant?: string; // IK rating
  temperatureRange?: {
    min: number;
    max: number;
  };

  // Power
  powerOptions: Array<'PoE' | 'PoE+' | 'Hi-PoE' | '12V' | '24V'>;
  powerConsumption?: {
    typical: number; // Watts
    maximum: number;
  };
}
```

### Step 4: Add Detection Logic

**File:** `server/services/modelDetection.ts`

```typescript
/**
 * Detect camera model from VAPIX properties
 */
export async function detectCameraModel(
  camera: Camera
): Promise<ModelDetectionResult> {
  try {
    // 1. Query VAPIX API
    const properties = await queryVAPICProperties(camera);

    // 2. Extract hardware ID
    const hardwareId = properties['Properties.System.HardwareID'];

    // 3. Look up in registry
    let model = CAMERA_MODELS.find(m => m.id === hardwareId);

    // 4. Fallback: Try alternate IDs
    if (!model) {
      model = CAMERA_MODELS.find(m =>
        m.detectionHints?.alternateIds?.includes(hardwareId)
      );
    }

    // 5. Fallback: Try name pattern matching
    if (!model) {
      const cameraName = properties['Properties.System.ProductFullName'];
      model = CAMERA_MODELS.find(m =>
        m.detectionHints?.namePatterns?.some(pattern =>
          pattern.test(cameraName)
        )
      );
    }

    // 6. Calculate confidence score
    const confidence = calculateConfidence(model, properties);

    return {
      model: model?.name || 'Unknown',
      series: model?.series,
      capabilities: model?.capabilities,
      confidence,
      detectedAt: new Date(),
    };
  } catch (error) {
    logger.error('Model detection failed', { cameraId: camera.id, error });
    throw new ModelDetectionError('Detection failed', error);
  }
}

/**
 * Calculate detection confidence score (0-1)
 */
function calculateConfidence(
  model: CameraModel | undefined,
  properties: VAPICProperties
): number {
  if (!model) return 0;

  let score = 0.5; // Base score for ID match

  // Boost confidence if product name matches
  if (properties['Properties.System.ProductFullName']?.includes(model.name)) {
    score += 0.3;
  }

  // Boost if firmware version is supported
  if (model.firmwareNotes?.minimumVersion) {
    const firmwareVersion = properties['Properties.Firmware.Version'];
    if (isVersionCompatible(firmwareVersion, model.firmwareNotes.minimumVersion)) {
      score += 0.2;
    }
  }

  return Math.min(score, 1.0);
}
```

### Step 5: Write Tests

**File:** `server/__tests__/models/newModel.test.ts`

```typescript
describe('Camera Model: AXIS P3245-LVE', () => {
  describe('Detection', () => {
    test('detects from hardware ID', async () => {
      const mockCamera = {
        id: 1,
        ipAddress: '192.168.1.100',
        username: 'root',
        password: 'pass',
      };

      // Mock VAPIX response
      mockVAPICQuery.mockResolvedValue({
        'Properties.System.HardwareID': '12345',
        'Properties.System.ProductFullName': 'AXIS P3245-LVE Network Camera',
      });

      const result = await detectCameraModel(mockCamera);

      expect(result.model).toBe('AXIS P3245-LVE');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('detects from name pattern', async () => {
      mockVAPICQuery.mockResolvedValue({
        'Properties.System.HardwareID': 'unknown-id',
        'Properties.System.ProductFullName': 'AXIS P3245-LVE Network Camera',
      });

      const result = await detectCameraModel(mockCamera);

      expect(result.model).toBe('AXIS P3245-LVE');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('handles detection failure gracefully', async () => {
      mockVAPICQuery.mockRejectedValue(new Error('Network timeout'));

      await expect(detectCameraModel(mockCamera)).rejects.toThrow(
        ModelDetectionError
      );
    });
  });

  describe('Capabilities', () => {
    test('exposes correct capabilities', () => {
      const model = CAMERA_MODELS.find(m => m.name === 'AXIS P3245-LVE');

      expect(model?.capabilities).toMatchObject({
        maxResolution: { width: 1920, height: 1080 },
        hasWDR: true,
        hasLightfinder: true,
        hasIR: true,
        hasPTZ: false,
        supportsAnalytics: true,
      });
    });

    test('validates firmware requirements', () => {
      const model = CAMERA_MODELS.find(m => m.name === 'AXIS P3245-LVE');

      expect(model?.firmwareNotes?.minimumVersion).toBe('9.80.1');
    });
  });

  describe('Integration', () => {
    test('model-specific features enabled', async () => {
      // Test that analytics, edge storage, etc. are enabled
      const camera = await createCameraWithModel('AXIS P3245-LVE');

      expect(camera.analyticsEnabled).toBe(true);
      expect(camera.edgeStorageEnabled).toBe(true);
    });
  });
});
```

### Step 6: Update Database Schema

**Migration file:** `db/migrations/add_new_model_capabilities.ts`

```typescript
export async function up(db: Database) {
  // Add any new capability fields if needed
  await db.schema.alterTable('camera_capabilities', table => {
    // Example: Add new capability
    table.boolean('supportsAIObjectDetection').defaultTo(false);
  });

  // Insert new model into capabilities table
  await db('camera_capabilities').insert({
    model: 'AXIS P3245-LVE',
    capabilities: JSON.stringify({
      maxResolution: { width: 1920, height: 1080 },
      hasWDR: true,
      // ... rest of capabilities
    }),
  });
}

export async function down(db: Database) {
  // Rollback changes
  await db('camera_capabilities')
    .where({ model: 'AXIS P3245-LVE' })
    .delete();
}
```

### Step 7: Documentation

**Update `SUPPORTED_CAMERAS.md`:**

Add the new model to the appropriate series section with:
- Full model name
- Resolution and key features
- Supported features in system
- Known limitations

**Update `API_REFERENCE.md` (if new capabilities added):**

Document any new capability fields or detection behaviors.

### Step 8: Testing Checklist

- [ ] Unit tests pass for model detection
- [ ] Integration tests pass with real camera
- [ ] Capabilities correctly detected and cached
- [ ] Model-specific features work as expected
- [ ] Performance impact is acceptable (<100ms added latency)
- [ ] Documentation is complete and accurate
- [ ] Code review completed
- [ ] No breaking changes to existing models

## Advanced Topics

### Custom Detection Logic

For cameras that require special detection logic:

```typescript
export class CustomModelDetector implements ModelDetector {
  async detect(properties: VAPICProperties): Promise<ModelDetectionResult> {
    // Custom logic for special cases
    if (this.isSpecialModel(properties)) {
      return this.detectSpecialModel(properties);
    }

    // Fall back to standard detection
    return standardDetect(properties);
  }

  private isSpecialModel(properties: VAPICProperties): boolean {
    // Custom validation logic
    return properties['Properties.System.Architecture'] === 'ARTPEC-7';
  }
}
```

### Firmware-Dependent Capabilities

Some capabilities may vary by firmware version:

```typescript
function getCapabilitiesForFirmware(
  model: CameraModel,
  firmwareVersion: string
): CameraCapabilities {
  const baseCapabilities = model.capabilities;

  // Add features available in newer firmware
  if (isVersionAtLeast(firmwareVersion, '10.0.0')) {
    return {
      ...baseCapabilities,
      supportsAIObjectDetection: true,
      analyticsTypes: [
        ...baseCapabilities.analyticsTypes,
        'person-detection',
        'vehicle-classification',
      ],
    };
  }

  return baseCapabilities;
}
```

### Batch Model Addition

For adding multiple models at once:

```bash
# Use the bulk import tool
npm run models:import -- --file models-batch.json

# Format:
# [{
#   "id": "12345",
#   "name": "AXIS P3245-LVE",
#   "series": "P32xx",
#   ...
# }]
```

## Submission Process

### 1. Create Feature Branch
```bash
git checkout -b feat/add-model-p3245-lve
```

### 2. Make Changes
- Add model to registry
- Write tests
- Update documentation

### 3. Run Validation
```bash
npm run validate:model -- --name "AXIS P3245-LVE"
npm test
npm run lint
```

### 4. Submit Pull Request
- Title: "feat: Add support for AXIS P3245-LVE"
- Description: Include model specs, testing notes
- Label: "model-addition"

### 5. Code Review
- Maintainer reviews model definition
- Tests must pass CI/CD
- Documentation must be complete

### 6. Merge and Release
- Merged to main branch
- Included in next minor version release
- Announced in changelog

## Common Pitfalls

### ❌ Don't: Hardcode model-specific logic in business logic
```typescript
// BAD
if (camera.model === 'AXIS P3245-LVE') {
  enableAnalytics();
}
```

### ✅ Do: Use capability-based feature detection
```typescript
// GOOD
if (camera.capabilities.supportsAnalytics) {
  enableAnalytics();
}
```

### ❌ Don't: Skip tests for "simple" models
All models need comprehensive test coverage.

### ✅ Do: Test detection, capabilities, and integration

### ❌ Don't: Add models without access to real hardware
Detection logic must be validated against actual cameras.

### ✅ Do: Test with real camera or detailed VAPIX dumps

## Support and Questions

- **Slack:** #camera-models channel
- **Email:** dev-team@example.com
- **Office Hours:** Tuesdays 2-3pm PT

## Reference

- [Axis VAPIX Library](https://www.axis.com/vapix-library/)
- [Camera Model Registry Source](server/models/cameraModels.ts)
- [Detection Service Source](server/services/modelDetection.ts)
- [Test Examples](server/__tests__/models/)
```

### Document 4: MIGRATION_GUIDE.md

**Target Audience:** System administrators, DevOps

**Structure:**

```markdown
# Migration Guide: Multi-Model Camera Support

## Overview

This guide provides step-by-step instructions for upgrading existing Axis Camera Uptime installations to support the new multi-model camera detection feature.

## Pre-Migration Checklist

- [ ] Current system version: v2.x.x or higher
- [ ] Database backup completed
- [ ] Maintenance window scheduled (recommended: 1-2 hours)
- [ ] Rollback plan prepared
- [ ] All users notified of upgrade

## System Requirements

### Minimum Requirements
- Node.js 18.x or higher
- PostgreSQL 14.x or higher
- 2GB available RAM
- 5GB available disk space

### Recommended Requirements
- Node.js 20.x
- PostgreSQL 15.x
- 4GB available RAM
- 10GB available disk space (for cache)

## Migration Steps

### Step 1: Backup Current System

```bash
# 1. Backup database
pg_dump camera_uptime > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Backup configuration
cp -r config config.backup

# 3. Backup application files
tar -czf app_backup_$(date +%Y%m%d_%H%M%S).tar.gz \
  server client package.json package-lock.json

# 4. Document current state
npm list --depth=0 > installed_packages.txt
psql camera_uptime -c "\dt" > database_tables.txt
```

### Step 2: Update Dependencies

```bash
# 1. Stop application
pm2 stop camera-uptime
# or
systemctl stop camera-uptime

# 2. Pull latest code
git fetch origin
git checkout v3.0.0  # Replace with actual version

# 3. Install dependencies
npm ci

# 4. Build application
npm run build
```

### Step 3: Run Database Migration

```bash
# 1. Review migration plan
npm run db:migration:plan

# Expected output:
# Migration: 20240115_add_model_detection
# - Add column: cameras.detectedModel
# - Add column: cameras.modelDetectionTimestamp
# - Add column: cameras.modelDetectionConfidence
# - Create table: camera_model_capabilities
# - Create index: idx_cameras_detected_model
# - Estimated duration: 45 seconds for 10,000 cameras

# 2. Run migration (with dry-run first)
npm run db:migrate -- --dry-run

# 3. Run actual migration
npm run db:migrate

# Expected output:
# ✓ Migration 20240115_add_model_detection completed in 38s
# ✓ 10,247 cameras migrated
# ✓ 156 models detected
# ✓ Indexes created successfully
```

### Step 4: Backfill Model Detection

This step populates the new `detectedModel` column for existing cameras.

```bash
# Option A: Automatic backfill (recommended)
npm run db:backfill-models -- --batch-size=100 --concurrency=10

# Progress output:
# Backfilling models for 10,247 cameras...
# [=====>    ] 50% (5,123/10,247) - ETA: 5 minutes
# [=========>] 100% (10,247/10,247) - Completed in 8m 32s
# Results:
# - Successfully detected: 9,891 cameras
# - Unknown models: 356 cameras
# - Errors: 0 cameras

# Option B: Manual backfill via UI
# Navigate to: Admin → System → Run Model Detection
# Click "Start Backfill" button
```

### Step 5: Verify Migration

```bash
# 1. Check database schema
npm run db:verify-schema

# Expected output:
# ✓ Table cameras has column detectedModel
# ✓ Table camera_model_capabilities exists
# ✓ All indexes created
# ✓ No orphaned records

# 2. Test model detection
npm run test:model-detection

# Expected output:
# ✓ Model detection working
# ✓ Cache operational
# ✓ API endpoints responding

# 3. Check system health
npm run health-check

# Expected output:
# ✓ Database: Connected
# ✓ Model Cache: 9,891/10,247 cameras cached
# ✓ API: Responding in 125ms (avg)
# ✓ Memory: 187MB / 2GB
```

### Step 6: Start Application

```bash
# 1. Start application
pm2 start camera-uptime
# or
systemctl start camera-uptime

# 2. Monitor logs
pm2 logs camera-uptime
# or
journalctl -u camera-uptime -f

# Look for:
# [INFO] Application started successfully
# [INFO] Model cache initialized: 9,891 entries
# [INFO] Monitor service started
```

### Step 7: Post-Migration Validation

```bash
# 1. Run integration tests
npm run test:integration

# 2. Verify camera list loads
curl http://localhost:3000/api/cameras | jq '.[] | .detectedModel'

# 3. Check cache hit rate
curl http://localhost:3000/api/diagnostics/cache-stats | jq '.hitRate'
# Expected: >0.90 (90%+)

# 4. Monitor performance
npm run diagnostic:benchmark

# Expected:
# ✓ Camera list load time: 1.2s (< 2s target)
# ✓ Model detection time: 320ms (< 500ms target)
# ✓ Cache lookup time: 8ms (< 10ms target)
```

## Migration Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| **Preparation** | 30 minutes | Backup, review, notify users |
| **Upgrade** | 15 minutes | Update code, install dependencies |
| **Migration** | 10-30 minutes | Database schema changes (varies by size) |
| **Backfill** | 5-20 minutes | Detect models for existing cameras |
| **Validation** | 10 minutes | Verify system health |
| **Monitoring** | 24 hours | Watch for issues |

**Total Downtime:** 1-2 hours (recommended maintenance window)

## Rollback Procedure

If issues occur, follow these steps to rollback:

### Quick Rollback (< 10 minutes)

```bash
# 1. Stop application
pm2 stop camera-uptime

# 2. Restore previous code version
git checkout v2.x.x  # Previous version
npm ci
npm run build

# 3. Rollback database (if migration completed)
npm run db:rollback -- --step=1

# 4. Restart application
pm2 start camera-uptime

# 5. Verify system operational
curl http://localhost:3000/health
```

### Full Rollback (from backup)

```bash
# 1. Stop application
pm2 stop camera-uptime

# 2. Restore database from backup
psql camera_uptime < backup_YYYYMMDD_HHMMSS.sql

# 3. Restore application files
tar -xzf app_backup_YYYYMMDD_HHMMSS.tar.gz

# 4. Reinstall dependencies
npm ci

# 5. Restart application
pm2 start camera-uptime
```

## Common Issues and Solutions

### Issue 1: Migration Takes Too Long

**Symptom:** Migration running for >1 hour

**Solution:**
```bash
# Cancel migration
Ctrl+C

# Run migration in batches
npm run db:migrate -- --batch-size=1000

# Or: Use background migration
npm run db:migrate -- --background
```

### Issue 2: Unknown Models After Backfill

**Symptom:** Many cameras showing "Unknown Model"

**Cause:** Camera not in model registry or VAPIX API access issues

**Solution:**
```bash
# 1. Check camera connectivity
npm run diagnostic:camera-connectivity -- --show-failures

# 2. Review detection logs
grep "ModelDetectionError" logs/application.log

# 3. Manually retry failed detections
npm run db:retry-failed-detections
```

### Issue 3: Performance Degradation

**Symptom:** System slower after migration

**Solution:**
```bash
# 1. Check cache hit rate
curl http://localhost:3000/api/diagnostics/cache-stats

# If hit rate <80%:
# 2. Increase cache size
export CACHE_SIZE=10000

# 3. Increase cache TTL
export CACHE_TTL=86400  # 24 hours

# 4. Restart application
pm2 restart camera-uptime
```

### Issue 4: Database Connection Pool Exhausted

**Symptom:** "Too many database connections" error

**Solution:**
```typescript
// config/database.ts
export const databaseConfig = {
  pool: {
    min: 5,
    max: 20,  // Increase from 10
    acquireTimeoutMillis: 30000,
  },
};
```

## Feature Flags

Enable/disable features during migration:

```bash
# Disable automatic model detection (use existing data only)
export FEATURE_MODEL_DETECTION=false

# Disable model-specific features
export FEATURE_MODEL_CAPABILITIES=false

# Disable model detection cache
export FEATURE_MODEL_CACHE=false
```

## Performance Monitoring

Monitor these metrics post-migration:

### Key Metrics to Watch

```bash
# Cache hit rate (target: >90%)
watch -n 10 'curl -s http://localhost:3000/api/diagnostics/cache-stats | jq .hitRate'

# Model detection time (target: <500ms)
watch -n 10 'curl -s http://localhost:3000/api/diagnostics/performance | jq .modelDetectionAvg'

# Database query time (target: <100ms)
watch -n 10 'curl -s http://localhost:3000/api/diagnostics/performance | jq .databaseQueryAvg'

# Memory usage (target: <80%)
watch -n 10 'free -m | grep Mem | awk "{print \$3/\$2*100}"'
```

### Alert Thresholds

Set up alerts for:
- Cache hit rate <80% for >15 minutes
- Model detection failures >5% for >10 minutes
- API response time >2s for >5 minutes
- Memory usage >90% for >5 minutes

## FAQ

### Q: Can I migrate without downtime?

**A:** Not recommended. The database schema changes require exclusive locks. Best practice is to schedule a maintenance window.

### Q: How long does backfill take?

**A:** Approximately 1 minute per 1,000 cameras. For 10,000 cameras, expect 10-15 minutes.

### Q: What happens to cameras not in the model registry?

**A:** They'll show as "Unknown Model" but remain fully functional. Model-specific features won't be available.

### Q: Can I run migration in production during business hours?

**A:** Not recommended. Database migrations can cause brief locks. Schedule during low-traffic periods.

### Q: What if I have custom camera models?

**A:** Add them to the model registry before migration, or add them afterward and run `npm run db:retry-failed-detections`.

## Support

### Before Migrating
- Review this guide completely
- Test migration on staging environment
- Prepare rollback plan

### During Migration
- Monitor logs continuously
- Watch for errors
- Keep backup available

### After Migration
- Monitor performance for 24 hours
- Collect user feedback
- Document any issues

### Getting Help
- **Email:** support@example.com
- **Slack:** #camera-uptime-support
- **Emergency:** [phone number]
- **Office Hours:** Monday-Friday 9am-5pm PT

## Appendix A: Database Schema Changes

### New Columns

```sql
-- cameras table
ALTER TABLE cameras
  ADD COLUMN detectedModel VARCHAR(50),
  ADD COLUMN modelDetectionTimestamp TIMESTAMP,
  ADD COLUMN modelDetectionConfidence DECIMAL(3,2);

-- Add indexes
CREATE INDEX idx_cameras_detected_model
  ON cameras(detectedModel)
  WHERE detectedModel IS NOT NULL;
```

### New Tables

```sql
-- camera_model_capabilities table
CREATE TABLE camera_model_capabilities (
  id SERIAL PRIMARY KEY,
  model VARCHAR(50) UNIQUE NOT NULL,
  series VARCHAR(20) NOT NULL,
  capabilities JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_model_capabilities_model
  ON camera_model_capabilities(model);

CREATE INDEX idx_model_capabilities_series
  ON camera_model_capabilities(series);
```

## Appendix B: Configuration Changes

### New Environment Variables

```bash
# Model detection settings
FEATURE_MODEL_DETECTION=true
MODEL_DETECTION_TIMEOUT=5000  # ms
MODEL_DETECTION_CACHE_TTL=86400  # seconds

# Cache settings
CACHE_SIZE=5000  # entries
CACHE_EVICTION_POLICY=LRU

# Performance settings
MODEL_DETECTION_BATCH_SIZE=10
MODEL_DETECTION_CONCURRENCY=5
```

### Updated Configuration Files

```json
// config/features.json
{
  "modelDetection": {
    "enabled": true,
    "autoDetect": true,
    "cacheEnabled": true,
    "confidenceThreshold": 0.8
  }
}
```

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-11
**Tested With:** v3.0.0
**Support:** support@example.com
```

## Phase 3: API and Reference Documentation

### Document 5: API_REFERENCE.md

*To be completed after implementation*

**Outline:**
- New endpoints for model detection
- Model capabilities API
- Cache management endpoints
- Updated camera endpoints with model fields

### Document 6: ARCHITECTURE.md

*To be completed by system-architect agent*

**Outline:**
- System architecture diagrams
- Model detection flow
- Caching strategy
- Database schema

## Documentation Quality Standards

### All Documents Must Include:

1. **Clear Target Audience**
   - Specify reader level (beginner, intermediate, advanced)
   - List prerequisites

2. **Structured Content**
   - Table of contents for documents >1000 words
   - Consistent heading hierarchy
   - Code examples with syntax highlighting

3. **Visual Aids**
   - Diagrams for complex concepts
   - Screenshots for UI guidance
   - Tables for comparison

4. **Maintenance**
   - Version number
   - Last updated date
   - Document owner
   - Review schedule

5. **Accessibility**
   - Alt text for images
   - Descriptive link text
   - Clear language (avoid jargon)

## Documentation Review Process

### Before Publication:

1. **Technical Review**
   - Verify accuracy
   - Test all code examples
   - Validate links

2. **Editorial Review**
   - Check grammar and spelling
   - Ensure consistent style
   - Verify formatting

3. **User Testing**
   - Have target audience review
   - Collect feedback
   - Iterate based on input

4. **Final Approval**
   - Technical lead sign-off
   - Product manager approval
   - Merge to documentation branch

## Documentation Maintenance

### Ongoing Tasks:

1. **Quarterly Reviews**
   - Update screenshots
   - Refresh examples
   - Add newly supported models

2. **Version-Specific Docs**
   - Tag docs with version
   - Maintain docs for N-2 versions
   - Archive old versions

3. **User Feedback Loop**
   - Monitor documentation issues
   - Track most-viewed pages
   - Address common questions

## Success Metrics

### Documentation Quality KPIs:

- **User Satisfaction**: >4.5/5 stars
- **Search Success Rate**: >90% find answer
- **Time to Resolution**: <5 minutes average
- **Support Ticket Reduction**: 30% decrease
- **Documentation Coverage**: 100% of features

### Measurement Methods:

- User surveys
- Analytics (page views, time on page, search queries)
- Support ticket analysis
- User interviews

## Timeline

| Phase | Deliverable | Estimated Completion |
|-------|-------------|---------------------|
| **Phase 1** | SUPPORTED_CAMERAS.md | Week 1 |
| **Phase 1** | TROUBLESHOOTING.md | Week 1 |
| **Phase 2** | ADDING_NEW_MODELS.md | Week 2 |
| **Phase 2** | MIGRATION_GUIDE.md | Week 2 |
| **Phase 3** | API_REFERENCE.md | Week 3 |
| **Phase 3** | ARCHITECTURE.md | Week 3 |
| **Review** | All docs reviewed | Week 4 |
| **Launch** | Docs published | Week 4 |

---

**Document Version:** 1.0.0
**Status:** Planning Phase
**Owner:** Documentation Team
**Next Review:** After implementation completion
