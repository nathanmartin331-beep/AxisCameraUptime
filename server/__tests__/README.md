# Camera Monitoring System - Validation Test Suite

## Overview

This test suite validates the accuracy of uptime calculations and video health detection for the Axis camera monitoring system. All calculations are tested against known scenarios with ±0.1% tolerance.

## Test Coverage

### 1. Uptime Calculation Tests (`uptimeCalculation.test.ts`)
**Total Tests: 17**

#### Known Scenario Tests (7 tests)
- 100% uptime (always online, no events)
- 100% uptime (prior event online, no transitions)
- 0% uptime (always offline)
- 50% uptime (half online, half offline)
- 75% uptime calculation
- Rapid state changes (multiple transitions)
- Prior event status handling

#### Edge Cases (5 tests)
- Zero duration window handling
- Events exactly at window boundaries
- Single online event (camera came online mid-window)
- Single offline event (camera went offline mid-window)
- Long time windows (365 days)

#### Accuracy Requirements (2 tests)
- ±0.1% tolerance for complex scenarios
- Manual calculation verification

#### Reboot Detection Impact (1 test)
- Reboots count as continuous online time

#### Boundary Conditions (2 tests)
- Events before window start (prior event)
- Events outside window ignored

### 2. Video Health Detection Tests (`videoHealthDetection.test.ts`)
**Total Tests: 26**

#### JPEG Snapshot Validation (9 tests)
- Successful snapshot validation (200 OK, image/*, non-empty)
- Invalid content type detection (text/html vs image/*)
- Empty response detection (0 bytes)
- Authentication failure (401)
- Endpoint not found (404)
- Server error (500)
- Timeout detection (>3 seconds)
- Various image MIME types acceptance
- Non-image MIME types rejection

#### Partial Response Handling (2 tests)
- Partial/corrupted JPEG detection (small file size)
- Reasonable JPEG size acceptance

#### Error Message Validation (4 tests)
- Clear error for authentication failure
- Clear error for timeout
- Clear error for invalid content type
- Clear error for empty response

#### Video Status Transitions (6 tests)
- unknown → video_ok transition
- unknown → video_failed transition
- video_ok status maintenance
- Video degradation detection (ok → failed)
- Video recovery detection (failed → ok)
- Unknown status when camera offline

#### Timeout Configuration (2 tests)
- 3-second timeout for video checks
- Stricter than system check timeout

#### HTTP Basic Auth (3 tests)
- Credentials encoding
- Authorization header formatting
- Special characters in password

## Running Tests

```bash
# Run all tests
npx vitest run server/__tests__/

# Run specific test file
npx vitest run server/__tests__/uptimeCalculation.test.ts

# Run in watch mode
npx vitest server/__tests__/

# Run with UI
npx vitest --ui

# Generate coverage report
npx vitest run --coverage
```

## Validation Methodology

### Uptime Calculations
1. **Pure Function Approach**: Extracted calculation logic into testable pure function
2. **Known Scenarios**: Each test uses predetermined event timelines with known expected results
3. **Accuracy Tolerance**: All calculations must be within ±0.1% of expected value
4. **Edge Case Coverage**: Tests cover empty datasets, boundary conditions, long time windows

### Video Health Detection
1. **Response Validation**: Verifies HTTP status, content-type, and response body
2. **Error Handling**: Tests all failure modes (auth, timeout, invalid response)
3. **Status Transitions**: Validates state machine for video health tracking
4. **Security**: Validates HTTP Basic Auth encoding

## Key Findings

### ✅ Validated Accuracy
- Uptime calculations are mathematically correct for all tested scenarios
- Video health detection properly validates JPEG snapshots
- Error messages are clear and actionable
- State transitions follow expected patterns

### 🎯 Accuracy Guarantees
- **Uptime Percentage**: ±0.1% tolerance verified
- **Event Timing**: Millisecond precision maintained
- **Status Detection**: Binary (online/offline) correctly tracked
- **Video Validation**: Proper MIME type and content checking

## Enterprise Compliance

This test suite ensures:
- ✅ Mathematical accuracy for uptime reporting
- ✅ Correct video encoder validation
- ✅ Clear error diagnostics
- ✅ State transition consistency
- ✅ Long-term stability (365-day windows tested)

## Next Steps

Future enhancements:
- [ ] Integration tests with mocked camera VAPIX responses
- [ ] Benchmark against real camera logs
- [ ] Stress test with rapid state changes
- [ ] DST transition edge cases
- [ ] Network partition scenarios
