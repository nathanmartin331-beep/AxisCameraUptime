# Hive Mind Quick Start Guide

## 5-Minute Setup

### Step 1: Initialize Hive Mind (30 seconds)
```bash
npx claude-flow@alpha hive-mind init
```

### Step 2: Spawn Your First Swarm (1 minute)
```bash
npx claude-flow@alpha hive-mind spawn "Add pagination to camera list"
```

### Step 3: Monitor Progress (ongoing)
```bash
npx claude-flow@alpha hive-mind status
```

## Common Commands

### Quick Tasks
```bash
# Bug fix with full swarm
npx claude-flow@alpha hive-mind spawn "Fix authentication timeout bug" --auto-spawn

# Feature development
npx claude-flow@alpha hive-mind spawn "Add export to CSV functionality"

# Performance optimization
npx claude-flow@alpha hive-mind spawn "Optimize camera data queries" --monitor

# Testing
npx claude-flow@alpha hive-mind spawn "Achieve 90% test coverage for auth module"
```

### Status & Monitoring
```bash
# Quick status
npx claude-flow@alpha hive-mind status

# Detailed view
npx claude-flow@alpha hive-mind status --verbose

# Metrics dashboard
npx claude-flow@alpha hive-mind metrics

# View consensus
npx claude-flow@alpha hive-mind consensus
```

### Session Management
```bash
# List all sessions
npx claude-flow@alpha hive-mind sessions

# Resume a session
npx claude-flow@alpha hive-mind resume <session-id>

# Stop current session
npx claude-flow@alpha hive-mind stop
```

## Agent Cheat Sheet

### When to Use Which Agents

| Task | Primary Agents | Example |
|------|---------------|---------|
| **New Feature** | queen + collective-intelligence + backend-dev + tester | `spawn "Add user profiles"` |
| **Bug Fix** | scout + coder + tester + reviewer | `spawn "Fix login error"` |
| **Performance** | collective-intelligence + coder + qe-performance-tester | `spawn "Speed up queries"` |
| **Testing** | qe-test-generator + qe-coverage-analyzer + tester | `spawn "90% coverage"` |
| **Security** | scout + qe-security-scanner + reviewer | `spawn "Security audit"` |
| **Refactoring** | collective-intelligence + coder + reviewer | `spawn "Refactor auth"` |
| **Research** | scout + collective-intelligence | `spawn "Research GraphQL"` |

## Memory Namespaces

Quick reference for agent coordination:

```javascript
// Queen's directives
"swarm/queen/status"
"swarm/queen/royal-directives"
"swarm/queen/hive-health"

// Collective decisions
"swarm/collective-intelligence/status"
"swarm/shared/collective-state"
"swarm/shared/collective-knowledge"

// Worker progress
"swarm/workers/{agent-id}/status"
"swarm/workers/{agent-id}/progress"
"swarm/workers/{agent-id}/results"

// Scout findings
"swarm/scouts/{agent-id}/reconnaissance"
"swarm/scouts/{agent-id}/threats"
"swarm/scouts/{agent-id}/opportunities"

// Shared resources
"swarm/shared/api-design"
"swarm/shared/db-schema"
"swarm/shared/code-standards"
"swarm/shared/test-strategy"
```

## Troubleshooting Quick Fixes

### Swarm Not Responding
```bash
# 1. Check MCP connection
claude mcp list

# 2. View logs
npx claude-flow@alpha hive-mind logs --follow

# 3. Restart swarm
npx claude-flow@alpha hive-mind stop
npx claude-flow@alpha hive-mind spawn "Continue previous task"
```

### Low Coherence Score
```bash
# 1. Check status
npx claude-flow@alpha hive-mind status --verbose

# 2. View consensus
npx claude-flow@alpha hive-mind consensus

# 3. If needed, re-initialize
npx claude-flow@alpha hive-mind init
```

### Memory Issues
```bash
# View memory usage
npx claude-flow@alpha hive-mind memory stats

# Clear old entries
npx claude-flow@alpha hive-mind memory clear --older-than 24h

# Full memory reset (careful!)
npx claude-flow@alpha hive-mind memory clear --all
```

## Best Practices Summary

1. ✅ **Always spawn in parallel** - Use single Claude Code message with multiple Task calls
2. ✅ **Let Queen coordinate** - Don't micromanage workers
3. ✅ **Use collective memory** - Share state via `swarm/shared/*`
4. ✅ **Monitor coherence** - Keep above 0.70
5. ✅ **Trust consensus** - Let collective-intelligence decide
6. ✅ **Enable auto-scale** - Let swarm grow/shrink as needed
7. ✅ **Check metrics** - Monitor performance regularly

## Next Steps

1. Try the interactive wizard: `npx claude-flow@alpha hive-mind wizard`
2. Spawn a swarm for your current task
3. Monitor the swarm status
4. Check the consensus decisions
5. Review the complete guide: `docs/hive-mind/README.md`

---

**Pro Tip**: Use `--auto-spawn` flag to automatically spawn Claude Code instances with full coordination!

```bash
npx claude-flow@alpha hive-mind spawn "Your task" --auto-spawn --monitor
```
