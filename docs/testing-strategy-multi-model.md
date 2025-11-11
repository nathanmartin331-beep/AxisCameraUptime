# Multi-Model Camera Support - Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for Axis camera multi-model support, ensuring robust detection, validation, and backward compatibility across different camera models.

## Test Pyramid

```
         /\
        /E2E\      <- End-to-end camera detection flow
       /------\
      /Integr. \   <- VAPIX API integration tests
     /----------\
    /   Unit     \ <- Model detection logic, parsing
   /--------------\
```

## Testing Scope

### 1. Unit Tests (70% coverage target)

#### Model Detection Logic
- **File**: `server/__tests__/cameraModelDetection.test.ts`
- **Coverage**:
  - Model string parsing (M-series, P-series, Q-series, etc.)
  - Feature extraction from model identifiers
  - Fallback handling for unknown models
  - Edge cases (malformed responses, empty strings)

#### VAPIX Response Parsing
- **File**: `server/__tests__/vapixResponseParser.test.ts`
- **Coverage**:
  - XML/JSON response parsing
  - Property extraction (Brand, ProdFullName, ProdNbr, etc.)
  - Error handling for malformed responses
  - Character encoding handling

#### Database Schema Migrations
- **File**: `server/__tests__/cameraModelMigration.test.ts`
- **Coverage**:
  - Migration up/down functionality
  - Data preservation during migration
  - Index creation verification
  - Rollback scenarios

### 2. Integration Tests (20% coverage target)

#### VAPIX API Integration
- **File**: `server/__tests__/vapixApiIntegration.test.ts`
- **Coverage**:
  - Real API calls to mock camera endpoints
  - Authentication handling
  - Network timeout scenarios
  - Retry logic verification

#### Database Integration
- **File**: `server/__tests__/databaseCameraModel.test.ts`
- **Coverage**:
  - CRUD operations with model data
  - Query performance with new indexes
  - Concurrent update scenarios
  - Transaction handling

### 3. End-to-End Tests (10% coverage target)

#### Camera Registration Flow
- **File**: `server/__tests__/e2e/cameraRegistration.test.ts`
- **Coverage**:
  - Complete registration with model detection
  - UI display of camera model information
  - Error handling and user feedback
  - Multiple camera model scenarios

## Test Data Fixtures

### Camera Model Fixtures

Located in `server/__tests__/fixtures/cameraModels.json`:

1. **AXIS M3027-PVE** - Fixed dome, outdoor
2. **AXIS P1365** - Box camera, indoor
3. **AXIS Q6155-E** - PTZ, outdoor
4. **AXIS F34** - Modular camera
5. **AXIS M1065-L** - Network camera, legacy
6. **Unknown Model** - Fallback scenario

### VAPIX Response Fixtures

Located in `server/__tests__/fixtures/vapixResponses/`:

- `m3027-pve-response.xml` - Standard response
- `p1365-response.json` - JSON format
- `q6155-e-response.xml` - PTZ model
- `malformed-response.xml` - Error scenario
- `empty-response.xml` - Edge case
- `unknown-model-response.xml` - Fallback test

## Test Execution Strategy

### Development Workflow

```bash
# Run unit tests during development
npm test -- --watch

# Run specific test suite
npm test -- cameraModelDetection

# Run with coverage
npm test -- --coverage

# Run integration tests (requires test DB)
npm test -- --testPathPattern=integration
```

### CI/CD Pipeline

1. **PR Checks**:
   - Unit tests: Must pass 100%
   - Coverage: Minimum 80% overall
   - Integration tests: Must pass 100%

2. **Staging Deployment**:
   - Run full test suite including E2E
   - Performance benchmarks
   - Database migration verification

3. **Production Deployment**:
   - Smoke tests with real camera endpoints
   - Monitoring alerts for new model detection
   - Rollback plan verification

## Backward Compatibility Testing

### Migration Testing

**Objective**: Ensure existing cameras continue to work without model information

**Test Cases**:
1. Existing cameras without model data display correctly
2. New cameras get model information automatically
3. Re-scanning existing cameras updates model information
4. API responses maintain backward compatibility

**Verification**:
```typescript
// Existing camera should still work
const legacyCamera = await db.query.cameras.findFirst({
  where: eq(cameras.model, null)
});
expect(legacyCamera).toBeDefined();
expect(legacyCamera.name).toBeDefined();
```

### API Compatibility

**Test Cases**:
1. GET /api/cameras returns model field (nullable)
2. POST /api/cameras works with/without model
3. Existing API clients unaffected by new fields

## Mock Strategy

### VAPIX API Mocking

Use `nock` for HTTP mocking:

```typescript
import nock from 'nock';

nock('http://192.168.1.100')
  .get('/axis-cgi/param.cgi')
  .query({ action: 'list', group: 'Brand,Properties' })
  .reply(200, vapixResponseFixture);
```

### Database Mocking

Use in-memory SQLite for fast test execution:

```typescript
const testDb = drizzle(new Database(':memory:'));
await migrate(testDb, { migrationsFolder: './migrations' });
```

## Performance Benchmarks

### Target Metrics

- Model detection: < 100ms per camera
- VAPIX API call: < 500ms (network dependent)
- Database query with model filter: < 50ms
- Migration execution: < 5 seconds

### Load Testing

Test scenarios:
1. Bulk camera registration (50+ cameras)
2. Concurrent model detection requests
3. Database query performance with 1000+ cameras

## Error Scenarios

### Critical Error Paths

1. **Network Failures**:
   - Camera unreachable
   - Authentication failure
   - Timeout scenarios

2. **Data Quality**:
   - Malformed VAPIX responses
   - Missing required fields
   - Invalid XML/JSON

3. **Database Issues**:
   - Migration failures
   - Constraint violations
   - Index creation errors

## Test Maintenance

### Updating Fixtures

When new camera models are added:

1. Capture real VAPIX response
2. Sanitize sensitive data (IPs, credentials)
3. Add to fixture directory
4. Update test cases

### Regression Prevention

- Always add test for reported bugs
- Document edge cases discovered
- Maintain test data diversity

## Quality Gates

### Minimum Requirements for Merge

- [ ] All unit tests passing
- [ ] Coverage ≥ 80%
- [ ] Integration tests passing
- [ ] No regression in existing tests
- [ ] Performance benchmarks met
- [ ] Documentation updated

### Monitoring in Production

- Track model detection success rate
- Monitor VAPIX API response times
- Alert on unknown model patterns
- Log parsing failures for analysis

## Tools and Libraries

- **Testing Framework**: Jest
- **Assertions**: Jest matchers + custom matchers
- **HTTP Mocking**: nock
- **Database Testing**: In-memory SQLite + Drizzle
- **Coverage**: Istanbul (via Jest)
- **E2E Testing**: Supertest for API, Playwright for UI

## Future Enhancements

1. **Snapshot Testing**: UI components displaying camera models
2. **Contract Testing**: VAPIX API contract verification
3. **Property-Based Testing**: Generate random camera model strings
4. **Visual Regression**: Camera detail page layout
5. **Chaos Testing**: Random failure injection

## References

- [Jest Documentation](https://jestjs.io/)
- [Drizzle Testing Guide](https://orm.drizzle.team/docs/testing)
- [VAPIX API Documentation](https://www.axis.com/vapix-library/)
- [Testing Best Practices](../CLAUDE.md)

---

**Last Updated**: 2025-11-11
**Version**: 1.0.0
**Maintainer**: QE Team
