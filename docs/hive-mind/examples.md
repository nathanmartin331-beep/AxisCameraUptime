# Hive Mind Examples

## Example 1: Add User Authentication

### Command
```bash
npx claude-flow@alpha hive-mind spawn "Add JWT authentication to camera endpoints" --auto-spawn
```

### What Happens

**1. Queen Coordinator Establishes Command**
- Creates strategic plan for auth implementation
- Allocates resources (2 backend workers, 1 tester, 1 security scout)
- Issues royal directives to memory: `swarm/queen/royal-directives`

**2. Collective Intelligence Builds Consensus**
- Gathers input: JWT vs session-based vs OAuth
- Achieves consensus: JWT with refresh tokens
- Stores decision: `swarm/shared/auth-strategy`

**3. Memory Manager Initializes State**
- Creates namespace: `swarm/workers/auth-*`
- Sets up caching for auth decisions
- Enables distributed memory sync

**4. Workers Execute in Parallel**

**Backend Worker 1** (`backend-dev`):
```javascript
Task("Backend Auth Endpoints",
  "Implement /api/auth/login and /api/auth/refresh. Read strategy from swarm/shared/auth-strategy",
  "backend-dev")
```
- Implements login endpoint
- Implements refresh token endpoint
- Stores progress: `swarm/workers/backend-1/auth-progress`

**Backend Worker 2** (`coder`):
```javascript
Task("Database Schema",
  "Add users table with password hashing. Check swarm/shared/db-schema for standards",
  "coder")
```
- Creates migration for users table
- Adds password hashing
- Updates schema doc: `swarm/shared/db-schema`

**Test Worker** (`qe-test-generator`):
```javascript
Task("Auth Tests",
  "Generate auth tests with 90% coverage. Read endpoints from swarm/workers/backend-1/auth-progress",
  "qe-test-generator")
```
- Generates unit tests
- Creates integration tests
- Reports coverage: `swarm/shared/test-coverage`

**5. Scout Performs Security Scan**
```javascript
Task("Security Reconnaissance",
  "Scan auth implementation for OWASP vulnerabilities",
  "scout-explorer")
```
- Checks for SQL injection
- Validates JWT implementation
- Reports findings: `swarm/scouts/security-report`

**6. Reviewer Validates**
```javascript
Task("Code Review",
  "Review auth code quality and security. Check swarm/shared/code-standards",
  "reviewer")
```
- Reviews code quality
- Validates security practices
- Approves or requests changes

### Final Result
- JWT authentication working
- Tests passing with 90%+ coverage
- Security vulnerabilities addressed
- Documentation updated
- All decisions recorded in collective memory

---

## Example 2: Performance Optimization

### Command
```bash
npx claude-flow@alpha hive-mind spawn "Optimize camera report queries - currently taking 3+ seconds" --monitor
```

### Agent Coordination

**Queen's Strategic Plan**:
1. Identify bottlenecks (Scout)
2. Design optimization strategy (Collective Intelligence)
3. Implement optimizations (Workers)
4. Validate performance (QE Performance Tester)
5. Review changes (Reviewer)

**Collective Intelligence Consensus**:
- Add database indexes
- Implement query result caching
- Use pagination for large datasets
- Add Redis for session caching

**Scout Reconnaissance**:
```javascript
Task("Performance Scout",
  "Profile camera report queries, identify slow operations",
  "scout-explorer")
```
Findings stored in: `swarm/scouts/perf-analysis`

**Worker Execution**:
```javascript
// Parallel optimization work
Task("Database Optimization",
  "Add indexes based on swarm/scouts/perf-analysis",
  "coder")

Task("Cache Implementation",
  "Add Redis caching for reports using swarm/shared/cache-strategy",
  "backend-dev")

Task("Pagination",
  "Implement cursor-based pagination for camera lists",
  "coder")
```

**Performance Validation**:
```javascript
Task("Load Testing",
  "Run k6 load tests, verify < 500ms response time",
  "qe-performance-tester")
```

**Result**: Query time reduced from 3s to 450ms ✅

---

## Example 3: Add Export Feature

### Command
```bash
npx claude-flow@alpha hive-mind spawn "Add CSV and PDF export for camera reports"
```

### Swarm Workflow

**1. Collective Intelligence Designs Architecture**
```javascript
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/shared/export-design",
  value: JSON.stringify({
    formats: ["csv", "pdf"],
    libraries: {
      csv: "papaparse",
      pdf: "pdfkit"
    },
    endpoints: [
      "GET /api/reports/:id/export?format=csv",
      "GET /api/reports/:id/export?format=pdf"
    ],
    streaming: true, // for large reports
    authorization: "required"
  })
}
```

**2. Workers Implement in Parallel**

**Backend API**:
```javascript
Task("Export API Endpoints",
  "Implement export endpoints from swarm/shared/export-design",
  "backend-dev")
```

**CSV Generator**:
```javascript
Task("CSV Export Service",
  "Create CSV export service with streaming support",
  "coder")
```

**PDF Generator**:
```javascript
Task("PDF Export Service",
  "Create PDF export with charts and branding",
  "coder")
```

**Frontend Integration**:
```javascript
Task("Export UI",
  "Add export buttons to camera detail page",
  "coder")
```

**3. Testing**:
```javascript
Task("Export Tests",
  "Test CSV/PDF generation with various data sizes",
  "qe-test-generator")
```

**4. Review**:
```javascript
Task("Export Review",
  "Review export implementation for security and performance",
  "reviewer")
```

---

## Example 4: Security Audit

### Command
```bash
npx claude-flow@alpha hive-mind spawn "Comprehensive security audit" --consensus weighted
```

### Multi-Scout Reconnaissance

**Vulnerability Scout**:
```javascript
Task("Vulnerability Scan",
  "Scan for OWASP Top 10 vulnerabilities",
  "scout-explorer")
```

**Dependency Scout**:
```javascript
Task("Dependency Audit",
  "Check npm packages for known vulnerabilities",
  "qe-security-scanner")
```

**Code Security Scout**:
```javascript
Task("Code Security Review",
  "Static analysis for security issues",
  "reviewer")
```

### Collective Intelligence Aggregates Findings

```javascript
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/collective-intelligence/security-findings",
  value: JSON.stringify({
    critical: [
      {issue: "SQL injection in search", severity: "critical", cve: null}
    ],
    high: [
      {issue: "Outdated jsonwebtoken", severity: "high", cve: "CVE-2022-23529"}
    ],
    medium: [
      {issue: "Missing rate limiting", severity: "medium"}
    ],
    consensus_decision: "Fix critical immediately, schedule high for sprint",
    confidence: 0.95
  })
}
```

### Workers Fix Issues in Priority Order

```javascript
// Critical fixes first
Task("Fix SQL Injection",
  "Use parameterized queries. Details in swarm/collective-intelligence/security-findings",
  "coder")

// Then high priority
Task("Update Dependencies",
  "Update jsonwebtoken to latest. Check swarm/collective-intelligence/security-findings",
  "coder")

// Finally medium priority
Task("Add Rate Limiting",
  "Implement express-rate-limit middleware",
  "backend-dev")
```

---

## Example 5: Test Coverage Improvement

### Command
```bash
npx claude-flow@alpha hive-mind spawn "Achieve 90% test coverage" --auto-scale
```

### Coverage-Driven Workflow

**1. Coverage Analyzer Scans Codebase**
```javascript
Task("Coverage Analysis",
  "Analyze current coverage, identify gaps with O(log n) algorithms",
  "qe-coverage-analyzer")
```

Output in `swarm/shared/coverage-gaps`:
```json
{
  "currentCoverage": 62.5,
  "targetCoverage": 90.0,
  "gaps": [
    {
      "file": "server/authRoutes.ts",
      "uncoveredLines": [45, 46, 78-92],
      "priority": "high",
      "complexity": "medium"
    },
    {
      "file": "server/storage.ts",
      "uncoveredLines": [120-145],
      "priority": "critical",
      "complexity": "high"
    }
  ],
  "estimatedTests": 23
}
```

**2. Queen Allocates Workers Based on Complexity**
- High complexity files: 2 workers
- Medium complexity: 1 worker
- Auto-scale to 6 workers total

**3. Test Generators Work in Parallel**
```javascript
// High priority + high complexity = 2 workers
Task("Storage Tests - Part 1",
  "Test lines 120-132 from swarm/shared/coverage-gaps",
  "qe-test-generator")

Task("Storage Tests - Part 2",
  "Test lines 133-145 from swarm/shared/coverage-gaps",
  "qe-test-generator")

// High priority + medium complexity = 1 worker
Task("Auth Route Tests",
  "Test lines 45, 46, 78-92 from swarm/shared/coverage-gaps",
  "qe-test-generator")
```

**4. Test Executor Validates**
```javascript
Task("Execute Generated Tests",
  "Run all generated tests, report coverage improvement",
  "qe-test-executor")
```

**5. Coverage Analyzer Re-checks**
```javascript
Task("Verify Coverage Goal",
  "Confirm 90% coverage achieved",
  "qe-coverage-analyzer")
```

**Result**: Coverage improved from 62.5% → 91.3% ✅

---

## Memory Coordination Patterns

### Pattern 1: Request → Consensus → Execute

```javascript
// 1. Worker requests decision
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/shared/decision-requests/cache-strategy",
  value: JSON.stringify({
    question: "Which caching strategy: Redis vs in-memory?",
    requester: "worker-backend-1",
    options: ["redis", "in-memory", "hybrid"],
    timestamp: Date.now()
  })
}

// 2. Collective Intelligence builds consensus
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/collective-intelligence/decisions/cache-strategy",
  value: JSON.stringify({
    decision: "redis",
    rationale: "Need persistence across server restarts",
    consensus: 0.87,
    votes: {redis: 7, "in-memory": 2, hybrid: 1}
  })
}

// 3. Worker implements decision
Task("Implement Redis Cache",
  "Use Redis per swarm/collective-intelligence/decisions/cache-strategy",
  "backend-dev")
```

### Pattern 2: Broadcast → Acknowledge → Coordinate

```javascript
// 1. Queen broadcasts directive
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/queen/broadcast/code-freeze",
  value: JSON.stringify({
    directive: "Code freeze for security patch",
    priority: "critical",
    affects: ["all-workers"],
    duration: "2h",
    exceptions: ["security-fixes"]
  })
}

// 2. Workers acknowledge
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/workers/worker-1/acknowledgments",
  value: JSON.stringify({
    directive: "code-freeze",
    acknowledged: true,
    currentTask: "paused",
    timestamp: Date.now()
  })
}

// 3. Memory Manager coordinates state
// Ensures all workers synchronized
```

---

## Tips for Success

1. **Be Specific**: "Add JWT auth with refresh tokens" > "Add auth"
2. **Use Monitoring**: Add `--monitor` flag for real-time dashboard
3. **Enable Auto-Scale**: Let swarm grow/shrink based on workload
4. **Trust Consensus**: Collective intelligence makes better decisions
5. **Review Logs**: Check `npx claude-flow@alpha hive-mind logs` for insights
6. **Check Memory**: Use `hive-mind memory list` to see coordination state

---

For more examples, see the main README: `docs/hive-mind/README.md`
