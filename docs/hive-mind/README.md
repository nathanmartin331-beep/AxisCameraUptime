# Hive Mind System - AxisCameraUptime

## Overview

Your project now has a **Hive Mind** system configured - a hierarchical swarm of AI agents that work together with collective intelligence, distributed memory, and autonomous coordination.

## Architecture

```
                    👑 Queen Coordinator
                          |
            +-------------+-------------+
            |                           |
    🧠 Collective Intelligence    💾 Memory Manager
            |                           |
    +-------+-------+           +-------+-------+
    |       |       |           |       |       |
  W1     W2     W3           S1     S2     S3
Workers (Task Execution)   Scouts (Exploration)
```

### Agent Roles

#### 👑 Queen Coordinator (`queen-coordinator`)
- **Role**: Strategic command & control
- **Governance**: Democratic with emergency override
- **Responsibilities**:
  - Resource allocation across the hive
  - Strategic decision-making
  - Hive coherence maintenance
  - Emergency response coordination

#### 🧠 Collective Intelligence (`collective-intelligence-coordinator`)
- **Role**: Distributed cognitive processing
- **Responsibilities**:
  - Consensus building (75%+ threshold)
  - Knowledge integration across agents
  - Cognitive load balancing
  - Pattern recognition and learning

#### 💾 Memory Manager (`swarm-memory-manager`)
- **Role**: Distributed memory operations
- **Responsibilities**:
  - Multi-level caching (L1/L2/L3)
  - Conflict resolution (CRDT-based)
  - Memory synchronization
  - Performance optimization

#### 🐝 Worker Specialists (`worker-specialist`)
- **Specializations**:
  - `backend-dev` - Backend API development
  - `coder` - General programming tasks
  - `tester` - Test creation and execution
  - `reviewer` - Code review and quality
  - `qe-test-generator` - AI-powered test generation
  - `qe-coverage-analyzer` - Coverage analysis
- **Max Workers**: 8 (auto-scaling enabled)
- **Load Balancing**: Work-stealing algorithm

#### 🔍 Scout Explorers (`scout-explorer`)
- **Role**: Information reconnaissance
- **Responsibilities**:
  - Codebase exploration
  - Threat/opportunity detection
  - Environmental scanning
  - Intelligence gathering

## Getting Started

### 1. Initialize Hive Mind

```bash
# Interactive wizard (recommended for first-time setup)
npx claude-flow@alpha hive-mind wizard

# Quick initialization
npx claude-flow@alpha hive-mind init

# Initialize with custom queen type
npx claude-flow@alpha hive-mind init --queen-type strategic
```

### 2. Spawn a Swarm for a Task

```bash
# Interactive mode (asks questions about your task)
npx claude-flow@alpha hive-mind spawn

# With specific objective
npx claude-flow@alpha hive-mind spawn "Add user authentication to camera endpoints"

# With Claude Code auto-spawning
npx claude-flow@alpha hive-mind spawn "Build REST API for camera data" --auto-spawn

# With monitoring dashboard
npx claude-flow@alpha hive-mind spawn "Optimize database queries" --monitor
```

### 3. Monitor Swarm Status

```bash
# View current status
npx claude-flow@alpha hive-mind status

# View with detailed metrics
npx claude-flow@alpha hive-mind status --verbose

# View all sessions
npx claude-flow@alpha hive-mind sessions

# View consensus decisions
npx claude-flow@alpha hive-mind consensus
```

### 4. Manage Memory

```bash
# View collective memory
npx claude-flow@alpha hive-mind memory list

# Search memory
npx claude-flow@alpha hive-mind memory search "authentication"

# Clear old memory
npx claude-flow@alpha hive-mind memory clear --older-than 7d
```

## Using Claude Code Task Tool with Hive Mind

The recommended way to spawn agents is using Claude Code's Task tool with Hive Mind coordination:

### Example: Full-Stack Feature Development

```javascript
// Single message with all agents spawned via Claude Code Task tool
[Parallel Agent Execution]:
  // Queen establishes command
  Task("Strategic Coordination", "Initialize hive, allocate resources, establish royal directives for camera authentication feature", "queen-coordinator")

  // Collective Intelligence builds consensus
  Task("Consensus Building", "Coordinate decision-making across agents, maintain shared knowledge about auth patterns", "collective-intelligence-coordinator")

  // Memory Manager sets up coordination
  Task("Memory Management", "Initialize swarm memory namespace, enable distributed caching, sync agent states", "swarm-memory-manager")

  // Workers execute tasks
  Task("Backend Development", "Implement JWT authentication endpoints. Check swarm/shared/api-design for decisions", "backend-dev")
  Task("Database Schema", "Add user authentication tables. Store schema in swarm/shared/db-schema", "coder")
  Task("Test Generation", "Create auth tests. Read requirements from swarm/shared/requirements", "qe-test-generator")
  Task("Coverage Analysis", "Analyze test coverage gaps. Report to swarm/shared/coverage-report", "qe-coverage-analyzer")

  // Scout explores
  Task("Security Reconnaissance", "Scan for auth vulnerabilities. Report findings to swarm/scouts/security-report", "scout-explorer")

  // Reviewer validates
  Task("Code Review", "Review auth implementation. Check swarm/shared/code-standards for guidelines", "reviewer")
```

### Memory Coordination Pattern

Every agent automatically coordinates through the `swarm/*` memory namespace:

**Before Task**:
```bash
npx claude-flow@alpha hooks pre-task --description "Implement auth endpoint"
npx claude-flow@alpha hooks session-restore --session-id "swarm-camera-auth"
```

**During Task**:
```javascript
// Agents write to shared memory
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/workers/backend/auth-progress",
  namespace: "coordination",
  value: JSON.stringify({
    status: "implementing",
    endpoint: "/api/auth/login",
    dependencies: ["bcrypt", "jsonwebtoken"],
    blockers: []
  })
}

// Agents read from collective intelligence
mcp__claude-flow__memory_usage {
  action: "retrieve",
  key: "swarm/shared/api-design",
  namespace: "coordination"
}
```

**After Task**:
```bash
npx claude-flow@alpha hooks post-task --task-id "auth-implementation"
npx claude-flow@alpha hooks notify --message "Auth endpoints completed"
```

## Use Cases for Your Project

### 1. Add New Camera Integration
```bash
npx claude-flow@alpha hive-mind spawn "Add support for Axis Q-series cameras" --auto-spawn
```

**Agents Involved**:
- Queen: Strategic planning for integration
- Collective Intelligence: Design consensus
- Backend Worker: API endpoints
- Tester: Integration tests
- Scout: Camera API documentation research

### 2. Performance Optimization
```bash
npx claude-flow@alpha hive-mind spawn "Optimize database queries for camera reports" --monitor
```

**Agents Involved**:
- Queen: Prioritize optimization areas
- Workers: Database query refactoring
- QE Performance Tester: Load testing
- Coverage Analyzer: Test coverage validation
- Memory Manager: Cache optimization

### 3. Security Audit
```bash
npx claude-flow@alpha hive-mind spawn "Comprehensive security audit" --consensus weighted
```

**Agents Involved**:
- Queen: Define security scope
- Collective Intelligence: Aggregate findings
- Scout: Vulnerability scanning
- QE Security Scanner: OWASP compliance
- Reviewer: Code security review

### 4. Test Coverage Improvement
```bash
npx claude-flow@alpha hive-mind spawn "Achieve 90% test coverage" --auto-scale
```

**Agents Involved**:
- Collective Intelligence: Coverage strategy
- QE Test Generator: Generate missing tests
- QE Coverage Analyzer: Gap detection
- Tester: Execute test suites
- Memory Manager: Store coverage data

## Configuration

Your Hive Mind configuration is stored in `/workspaces/AxisCameraUptime/config/hive-mind.json`.

### Key Settings

- **Topology**: `hierarchical` - Queen-led with clear command chains
- **Max Workers**: `8` - Auto-scales based on workload
- **Consensus**: `weighted-voting` - 75% threshold required
- **Memory**: `100mb` - Distributed with CRDT conflict resolution
- **Governance**: `democratic` - Queen consults collective intelligence

### Customization

Edit the config file to adjust:
- Worker specializations
- Consensus algorithms
- Memory size limits
- Auto-scaling behavior
- Monitoring thresholds

## Advanced Features

### 1. Consensus Building
```bash
# View consensus decisions
npx claude-flow@alpha hive-mind consensus

# See decision history
npx claude-flow@alpha hive-mind consensus --history

# Check specific proposal
npx claude-flow@alpha hive-mind consensus --proposal-id "auth-strategy-001"
```

### 2. Performance Metrics
```bash
# Real-time metrics dashboard
npx claude-flow@alpha hive-mind metrics

# Export metrics report
npx claude-flow@alpha hive-mind metrics --export metrics-report.json

# View specific agent performance
npx claude-flow@alpha hive-mind metrics --agent worker-backend-1
```

### 3. Session Management
```bash
# Pause current session
npx claude-flow@alpha hive-mind stop --save-state

# Resume previous session
npx claude-flow@alpha hive-mind resume session-1234567890

# List all sessions
npx claude-flow@alpha hive-mind sessions

# Archive old sessions
npx claude-flow@alpha hive-mind sessions --archive --older-than 30d
```

## Troubleshooting

### Check MCP Connection
```bash
claude mcp list
# Should show: claude-flow@alpha, ruv-swarm, flow-nexus all connected
```

### View Hive Mind Logs
```bash
# View recent activity
npx claude-flow@alpha hive-mind logs

# Follow live logs
npx claude-flow@alpha hive-mind logs --follow

# Filter by agent
npx claude-flow@alpha hive-mind logs --agent queen-coordinator
```

### Reset Hive Mind
```bash
# Stop all sessions
npx claude-flow@alpha hive-mind stop --all

# Clear memory (careful!)
npx claude-flow@alpha hive-mind memory clear --all

# Re-initialize
npx claude-flow@alpha hive-mind init
```

## Best Practices

### 1. Always Use Parallel Spawning
✅ **Correct**: Spawn all related agents in a single message via Claude Code Task tool
❌ **Wrong**: Spawn agents one at a time across multiple messages

### 2. Leverage Collective Memory
- Use `swarm/shared/*` for cross-agent communication
- Use `swarm/collective-intelligence/*` for consensus decisions
- Use `swarm/workers/*` for task progress tracking

### 3. Let Queen Coordinate
- Don't micromanage workers
- Trust collective intelligence for complex decisions
- Use democratic governance for strategic choices

### 4. Monitor Hive Health
- Check coherence score (should be > 0.70)
- Monitor task failure rate (should be < 0.10)
- Track memory usage (should be < 90%)

## Integration with Agentic QE Fleet

Your Hive Mind works seamlessly with the Agentic QE Fleet:

```bash
# QE Fleet for testing, Hive Mind for development
npx claude-flow@alpha hive-mind spawn "Build auth system" --workers "backend-dev,coder,tester"

# Then use QE agents for quality assurance
aqe test auth --coverage 90 --framework jest
```

## Next Steps

1. **Run the wizard**: `npx claude-flow@alpha hive-mind wizard`
2. **Spawn your first swarm**: `npx claude-flow@alpha hive-mind spawn "Your objective"`
3. **Monitor performance**: `npx claude-flow@alpha hive-mind status`
4. **Check consensus**: `npx claude-flow@alpha hive-mind consensus`

---

**Need Help?**
- Documentation: https://github.com/ruvnet/claude-flow/tree/main/docs/hive-mind
- Issues: https://github.com/ruvnet/claude-flow/issues
- Your config: `/workspaces/AxisCameraUptime/config/hive-mind.json`
