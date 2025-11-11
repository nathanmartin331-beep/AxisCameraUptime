# Hive Mind Visual Workflow Guide

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     HIVE MIND SYSTEM                            │
│                   AxisCameraUptime Project                      │
└─────────────────────────────────────────────────────────────────┘

                         👑 QUEEN COORDINATOR
                    (Strategic Command & Control)
                              │
                 ┌────────────┼────────────┐
                 │            │            │
          Royal Directives    │      Resource Allocation
                 │            │            │
                 ▼            ▼            ▼
        ┌────────────────────────────────────────┐
        │   🧠 COLLECTIVE INTELLIGENCE           │
        │   (Consensus & Decision Making)        │
        │   • Weighted voting (75% threshold)    │
        │   • Knowledge integration              │
        │   • Pattern recognition                │
        └────────────────────────────────────────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            ▼            ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ 💾 MEMORY    │ │ 🐝 WORKERS   │ │ 🔍 SCOUTS    │
   │   MANAGER    │ │   (1-8)      │ │   (1-3)      │
   │              │ │              │ │              │
   │ • Caching    │ │ • backend-   │ │ • Code       │
   │ • Sync       │ │   dev        │ │   exploration│
   │ • CRDT       │ │ • coder      │ │ • Threat     │
   │ • 100MB      │ │ • tester     │ │   detection  │
   │              │ │ • reviewer   │ │ • Intel      │
   │              │ │ • QE agents  │ │   gathering  │
   └──────────────┘ └──────────────┘ └──────────────┘
            │            │            │
            └────────────┼────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  DISTRIBUTED MEMORY  │
              │  swarm/* namespace   │
              │                      │
              │  • queen/           │
              │  • collective/      │
              │  • shared/          │
              │  • workers/         │
              │  • scouts/          │
              └──────────────────────┘
```

## Communication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TASK: "Add JWT Authentication"               │
└─────────────────────────────────────────────────────────────────┘

Step 1: STRATEGIC PLANNING
─────────────────────────────
👑 Queen → Memory: swarm/queen/royal-directives
{
  task: "JWT Authentication",
  priority: "high",
  resources: {workers: 3, scouts: 1, testers: 2},
  deadline: "2h"
}

Step 2: CONSENSUS BUILDING
─────────────────────────────
🧠 Collective Intelligence → Memory: swarm/shared/auth-strategy
{
  approach: "JWT with refresh tokens",
  consensus: 0.87,
  rationale: "Industry standard, stateless, secure",
  libraries: ["jsonwebtoken", "bcrypt"]
}

Step 3: MEMORY INITIALIZATION
─────────────────────────────────
💾 Memory Manager → Memory: swarm/shared/namespace-setup
{
  namespaces: [
    "swarm/workers/auth-*",
    "swarm/shared/auth-*"
  ],
  caching: "enabled",
  ttl: 3600
}

Step 4: PARALLEL EXECUTION
─────────────────────────────
🐝 Worker 1 (backend-dev) → swarm/workers/backend-1/auth-endpoints
  • Implements /api/auth/login
  • Implements /api/auth/refresh
  • Stores progress every 30s

🐝 Worker 2 (coder) → swarm/workers/coder-1/db-schema
  • Creates users table migration
  • Adds password hashing
  • Updates schema docs

🐝 Worker 3 (qe-test-generator) → swarm/workers/test-gen-1/tests
  • Generates unit tests
  • Creates integration tests
  • Validates coverage > 90%

🔍 Scout 1 (scout-explorer) → swarm/scouts/security-scan
  • Scans for OWASP vulnerabilities
  • Validates JWT implementation
  • Reports findings

Step 5: REVIEW & VALIDATION
─────────────────────────────
🐝 Reviewer → swarm/workers/reviewer-1/assessment
  • Reviews code quality
  • Validates security practices
  • Approves changes

Step 6: CONSENSUS & COMPLETION
─────────────────────────────────
🧠 Collective Intelligence → swarm/collective-intelligence/decisions
{
  decision: "APPROVED",
  confidence: 0.95,
  findings: ["All tests passing", "Security validated", "90% coverage"],
  recommendation: "Deploy to staging"
}

👑 Queen → swarm/queen/royal-report
{
  task: "JWT Authentication",
  status: "COMPLETED",
  duration: "1.2h",
  quality: "excellent",
  next_action: "Deploy to staging"
}
```

## Memory Coordination Matrix

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│   AGENT      │   READS      │   WRITES     │  FREQUENCY   │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Queen        │ All workers  │ Directives   │ Every 2 min  │
│              │ Hive health  │ Reports      │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Collective   │ All agents   │ Consensus    │ Every 30s    │
│ Intelligence │ Knowledge    │ Decisions    │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Memory       │ All keys     │ Metrics      │ Every 60s    │
│ Manager      │ Sync state   │ Indexes      │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Workers      │ Shared state │ Progress     │ Continuous   │
│              │ Directives   │ Results      │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Scouts       │ Shared state │ Findings     │ Every 2 min  │
│              │ Targets      │ Threats      │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

## Decision Flow Chart

```
                    NEW TASK RECEIVED
                           │
                           ▼
                  ┌────────────────┐
                  │ Queen Reviews  │
                  │ • Complexity   │
                  │ • Priority     │
                  │ • Resources    │
                  └────────┬───────┘
                           │
              ┌────────────┼────────────┐
              │                         │
         Simple Task              Complex Task
              │                         │
              ▼                         ▼
     ┌────────────────┐       ┌────────────────┐
     │ Direct Worker  │       │ Collective     │
     │ Assignment     │       │ Intelligence   │
     └────────┬───────┘       │ Consensus      │
              │               └────────┬───────┘
              │                        │
              │                        ▼
              │               ┌────────────────┐
              │               │ Vote:          │
              │               │ Approach A: 7  │
              │               │ Approach B: 2  │
              │               │ Approach C: 1  │
              │               └────────┬───────┘
              │                        │
              │                   Consensus ≥ 75%?
              │                        │
              │                   ┌────┴────┐
              │                   │         │
              │                  Yes       No
              │                   │         │
              │                   │         ▼
              │                   │    Request Queen
              │                   │    Override/Revote
              │                   │         │
              └───────────────────┴─────────┘
                                  │
                                  ▼
                         ┌────────────────┐
                         │ Allocate       │
                         │ Resources      │
                         │ • Workers      │
                         │ • Scouts       │
                         │ • Memory       │
                         └────────┬───────┘
                                  │
                                  ▼
                         ┌────────────────┐
                         │ Execute in     │
                         │ Parallel       │
                         └────────┬───────┘
                                  │
                         ┌────────┼────────┐
                         │        │        │
                         ▼        ▼        ▼
                      Worker  Worker  Scout
                         │        │        │
                         └────────┼────────┘
                                  │
                                  ▼
                         ┌────────────────┐
                         │ Review &       │
                         │ Validate       │
                         └────────┬───────┘
                                  │
                            Success?
                                  │
                            ┌─────┴─────┐
                            │           │
                           Yes         No
                            │           │
                            ▼           ▼
                    Mark Complete   Retry/Fix
                                        │
                                        └──> Back to Execute
```

## Scaling Workflow

```
Initial State (1 worker)
─────────────────────────
┌──────┐
│  W1  │  Load: 50%
└──────┘

Task Load Increases
─────────────────────────
┌──────┐ ┌──────┐
│  W1  │ │  W2  │  Load: 75% each
└──────┘ └──────┘
    Queen detects high load → Auto-scale

Maximum Capacity (8 workers)
─────────────────────────
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  W1  │ │  W2  │ │  W3  │ │  W4  │
└──────┘ └──────┘ └──────┘ └──────┘
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  W5  │ │  W6  │ │  W7  │ │  W8  │
└──────┘ └──────┘ └──────┘ └──────┘
    All at 80-90% capacity

Task Load Decreases
─────────────────────────
┌──────┐ ┌──────┐
│  W1  │ │  W2  │  Load: 30% each
└──────┘ └──────┘
    Queen scales down → Release resources
```

## Fault Tolerance Flow

```
Normal Operation
────────────────
👑 Queen → 🧠 CI → 💾 Memory → 🐝 Workers → ✅ Success

Worker Failure Detected
────────────────────────
👑 Queen → 🧠 CI → 💾 Memory → 🐝 Worker 3 ❌
                                      │
                                      ▼
                              Memory Manager detects
                              no heartbeat for 30s
                                      │
                                      ▼
                              Queen notified
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
              Task critical?                      Task non-critical?
                    │                                   │
                    ▼                                   ▼
           Spawn replacement                    Redistribute to
           worker immediately                    existing workers
                    │                                   │
                    └─────────────────┬─────────────────┘
                                      │
                                      ▼
                              Recovery complete
                              Resume normal ops
```

## Memory Sync Pattern

```
Time: T0 - Initial State
────────────────────────
Memory Manager: {key1: "value1", version: 100}
Worker 1:       {key1: "value1", version: 100} ✅ Synced
Worker 2:       {key1: "value1", version: 100} ✅ Synced

Time: T1 - Worker 1 Updates
────────────────────────────
Worker 1 writes: {key1: "value2", version: 101}
                       │
                       ▼
            Memory Manager receives update
                       │
                       ▼
            CRDT conflict detection
                       │
            No conflict (newest version)
                       │
                       ▼
            Broadcast to all workers
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
    Worker 1                     Worker 2
    {key1: "value2"              receives update
     version: 101} ✅            {key1: "value2"
                                  version: 101} ✅

Time: T2 - Conflict Scenario
─────────────────────────────
Worker 1 writes: {key1: "valueA", version: 102, timestamp: T2.00}
Worker 2 writes: {key1: "valueB", version: 102, timestamp: T2.01}
                                │
                                ▼
                     Memory Manager detects conflict
                                │
                    ┌───────────┴───────────┐
                    │                       │
              Same version              Different timestamps
                    │                       │
                    └───────────┬───────────┘
                                │
                                ▼
                    Apply CRDT resolution:
                    • Last-write-wins
                    • Merge semantics
                    • Vector clocks
                                │
                                ▼
                    Result: {key1: "valueB", version: 103}
                                │
                                ▼
                    Broadcast to all workers
```

## Visual Guide to Commands

```
┌─────────────────────────────────────────────────────────┐
│  COMMAND                          EFFECT                │
├─────────────────────────────────────────────────────────┤
│  npx claude-flow hive-mind init                        │
│  👑→🧠→💾→🐝                       Initialize system     │
├─────────────────────────────────────────────────────────┤
│  npx claude-flow hive-mind spawn "task"                │
│  👑 → Plan → 🐝🐝🐝🔍 → Execute   Spawn swarm          │
├─────────────────────────────────────────────────────────┤
│  npx claude-flow hive-mind status                      │
│  📊 Dashboard                      Show all metrics     │
├─────────────────────────────────────────────────────────┤
│  npx claude-flow hive-mind consensus                   │
│  🧠 Decisions                      View votes           │
├─────────────────────────────────────────────────────────┤
│  npx claude-flow hive-mind memory list                 │
│  💾 State                          View all memory      │
├─────────────────────────────────────────────────────────┤
│  npx claude-flow hive-mind metrics                     │
│  📈 Performance                    Real-time graphs     │
└─────────────────────────────────────────────────────────┘
```

---

**This visual guide complements the text documentation.**
For detailed information, see:
- Complete guide: `README.md`
- Quick start: `quick-start.md`
- Examples: `examples.md`
