# AgentDB Integration Guide

## Overview

AgentDB has been successfully initialized for the AxisCameraUptime monitoring system. This guide explains how to use AgentDB's advanced features for camera incident tracking, failure prediction, and pattern learning.

## 🎯 What is AgentDB?

AgentDB is a frontier memory database for AI agents that provides:

- **Vector Search**: Semantic similarity search for finding related incidents
- **Reflexion Memory**: Store and retrieve past episodes with self-critique
- **Causal Memory**: Track cause-and-effect relationships
- **Skill Library**: Reusable patterns learned from successful resolutions
- **Learning System**: 9 reinforcement learning algorithms (Decision Transformer, Q-Learning, SARSA, Actor-Critic, etc.)
- **QUIC Sync**: Multi-database synchronization for distributed systems

## 📁 File Structure

```
/workspaces/AxisCameraUptime/
├── config/
│   └── agentdb-config.json          # Configuration for camera monitoring
├── data/
│   └── agentdb/
│       └── camera-uptime.db         # Main AgentDB database (768-dim vectors)
├── src/
│   └── lib/
│       └── agentdb-utils.ts         # TypeScript utilities
└── scripts/
    └── init-agentdb.ts              # Initialization script
```

## 🚀 Quick Start

### 1. Run Initialization (Already Completed)

```bash
npx tsx scripts/init-agentdb.ts
```

This script:
- ✅ Adds 6 default causal edges
- ✅ Stores 4 sample camera incidents
- ✅ Tests search functionality
- ✅ Validates failure prediction
- ✅ Trains initial patterns
- ✅ Consolidates skills

### 2. Using in Your Code

```typescript
import {
  storeCameraIncident,
  findSimilarIncidents,
  predictCameraFailure,
  trainCameraPatterns,
  type CameraIncident
} from './src/lib/agentdb-utils.js';

// Store a camera incident
const incident: CameraIncident = {
  cameraId: 'CAM-005',
  cameraName: 'Loading Dock Camera',
  timestamp: new Date(),
  incidentType: 'network_timeout',
  severity: 'high',
  description: 'Camera lost connection',
  resolved: false,
  metadata: { duration_minutes: 5 }
};

await storeCameraIncident(incident);

// Find similar incidents
const similar = await findSimilarIncidents('network timeout', 5, 0.75);

// Predict camera failure
const prediction = await predictCameraFailure('CAM-005', {
  recent_disconnects: 3,
  network_latency_avg: 350
});

console.log(`Failure Probability: ${prediction.failureProbability}`);
console.log(`Recommendations:`, prediction.recommendedActions);
```

## 📊 Features & Configuration

### Domains

The system is configured with 3 primary domains:

1. **camera-incidents**: Track downtime and incidents
   - network_timeout
   - authentication_failure
   - hardware_failure
   - configuration_error
   - firmware_issue

2. **uptime-predictions**: ML-based failure predictions
   - degradation_pattern
   - seasonal_variation
   - maintenance_window
   - expected_failure

3. **camera-patterns**: Learned behavioral patterns
   - normal_operation
   - anomaly_detected
   - recovery_sequence
   - recurrent_failure

### Causal Edges (Initialized)

| Cause | Effect | Description |
|-------|--------|-------------|
| network_latency_high | camera_disconnect | High latency causes disconnections |
| firmware_update | temporary_downtime | Updates cause downtime |
| temperature_threshold_exceeded | hardware_failure | Overheating leads to failures |
| authentication_token_expired | connection_loss | Expired tokens cause connection loss |
| power_fluctuation | camera_reboot | Power issues cause reboots |
| bandwidth_saturation | video_quality_degradation | Bandwidth affects quality |

### Learning Algorithms

Configured algorithms:
- Decision Transformer
- Q-Learning
- SARSA
- Actor-Critic

**Training Parameters**:
- Min attempts: 3
- Min success rate: 60%
- Min confidence: 70%
- Time window: 30 days

### Vector Search

- **Dimension**: 768 (sentence-transformers)
- **Model**: Xenova/all-MiniLM-L6-v2
- **Similarity metric**: Cosine
- **Default K**: 10 results
- **Min threshold**: 0.75
- **MMR diversity**: Enabled (lambda: 0.7)

## 🔧 Available Functions

### Core Functions

#### `storeCameraIncident(incident: CameraIncident): Promise<void>`
Store a camera incident in AgentDB for future learning and retrieval.

**Parameters**:
- `cameraId`: Camera identifier
- `cameraName`: Human-readable camera name
- `timestamp`: Incident occurrence time
- `incidentType`: One of 5 predefined types
- `severity`: low | medium | high | critical
- `description`: Detailed incident description
- `resolved`: Boolean indicating resolution status
- `resolution`: (Optional) How the incident was resolved
- `metadata`: (Optional) Additional context

**Example**:
```typescript
await storeCameraIncident({
  cameraId: 'CAM-101',
  cameraName: 'Main Entrance',
  timestamp: new Date(),
  incidentType: 'network_timeout',
  severity: 'high',
  description: 'Lost connection for 10 minutes',
  resolved: true,
  resolution: 'Network cable replaced',
  metadata: { duration_minutes: 10, auto_recovery: false }
});
```

#### `findSimilarIncidents(query: string, k?: number, minConfidence?: number): Promise<SimilarIncident[]>`
Search for incidents similar to a given query using semantic vector search.

**Parameters**:
- `query`: Natural language search query
- `k`: Number of results (default: 5)
- `minConfidence`: Minimum similarity threshold (default: 0.75)

**Returns**: Array of similar incidents with similarity scores

**Example**:
```typescript
const incidents = await findSimilarIncidents(
  'camera lost connection network issue',
  10,
  0.7
);

incidents.forEach(inc => {
  console.log(`${inc.task} - Similarity: ${inc.similarity}`);
  console.log(`Success: ${inc.success}, Reward: ${inc.reward}`);
});
```

#### `predictCameraFailure(cameraId: string, recentBehavior: Record<string, any>): Promise<PredictionResult>`
Predict potential camera failures based on historical patterns.

**Parameters**:
- `cameraId`: Camera to analyze
- `recentBehavior`: Recent behavioral metrics

**Returns**:
- `failureProbability`: 0-1 probability of failure
- `predictedIncidentType`: Most likely incident type
- `confidence`: Prediction confidence score
- `recommendedActions`: Array of actionable recommendations
- `basedOnPatterns`: Historical patterns used for prediction

**Example**:
```typescript
const prediction = await predictCameraFailure('CAM-101', {
  recent_disconnects: 4,
  network_latency_avg: 450,
  uptime_percentage_7d: 92.5,
  last_firmware_update: '2024-10-01'
});

if (prediction.failureProbability > 0.7) {
  console.log('⚠️ HIGH RISK CAMERA');
  console.log(`Predicted issue: ${prediction.predictedIncidentType}`);
  console.log('Immediate actions:', prediction.recommendedActions);
}
```

#### `trainCameraPatterns(domain?: string, epochs?: number): Promise<void>`
Train AgentDB on accumulated camera patterns to improve predictions.

**Parameters**:
- `domain`: Domain to train (default: 'camera-incidents')
- `epochs`: Training iterations (default: 10)

**Example**:
```typescript
// Run weekly training
await trainCameraPatterns('camera-incidents', 20);
```

#### `consolidateSkills(): Promise<void>`
Extract reusable skills from successful incident resolutions.

**Example**:
```typescript
// Run monthly to build skill library
await consolidateSkills();
```

### Advanced Functions

#### `addCausalEdge(cause: string, effect: string, uplift: number, confidence?: number): Promise<void>`
Manually add a causal relationship between events.

**Example**:
```typescript
await addCausalEdge(
  'router_reboot',
  'camera_reconnect',
  0.85,  // 85% uplift
  0.95   // 95% confidence
);
```

#### `getDatabaseStats(): Promise<Record<string, any>>`
Get comprehensive database statistics.

#### `optimizeMemory(): Promise<void>`
Compress and consolidate patterns to optimize database performance.

**Example**:
```typescript
// Run monthly
await optimizeMemory();
```

## 🎓 Learning from Incidents

AgentDB automatically learns from stored incidents:

1. **Pattern Recognition**: Identifies recurring patterns in incidents
2. **Causal Discovery**: Finds cause-effect relationships
3. **Skill Consolidation**: Creates reusable resolution procedures
4. **Prediction Improvement**: Enhances failure prediction accuracy

### Recommended Schedule

| Task | Frequency | Function |
|------|-----------|----------|
| Store incidents | Real-time | `storeCameraIncident()` |
| Train patterns | Weekly | `trainCameraPatterns()` |
| Consolidate skills | Monthly | `consolidateSkills()` |
| Optimize memory | Monthly | `optimizeMemory()` |
| Predict failures | Daily/On-demand | `predictCameraFailure()` |

## 🔍 Query Examples

### CLI Queries

```bash
# Search for network-related incidents
npx agentdb query --query "network timeout connection lost" \
  --k 10 --min-confidence 0.7 --synthesize-context

# Get database statistics
npx agentdb db stats

# View causal edges
npx agentdb causal query

# Search for applicable skills
npx agentdb skill search "network troubleshooting" 5

# Export database backup
npx agentdb export ./data/agentdb/camera-uptime.db ./backups/backup-$(date +%Y%m%d).json --compress
```

## 🔐 Environment Variables

```bash
# Set custom database path
export AGENTDB_PATH="./data/agentdb/camera-uptime.db"

# Use in-memory database for testing
export AGENTDB_PATH=":memory:"
```

## 📈 Performance Considerations

### Vector Search Performance

- **Small preset** (<10K vectors): Fast queries (<10ms)
- **Medium preset** (10K-100K vectors): Moderate queries (~50ms) ✅ Current
- **Large preset** (>100K vectors): Slower queries (~200ms)

### Optimization Tips

1. **Use MMR diversity**: Reduces redundant results
2. **Adjust K dynamically**: Fewer results = faster queries
3. **Set appropriate thresholds**: Higher confidence = fewer results
4. **Periodic pruning**: Remove old/low-quality data
5. **Batch operations**: Store multiple incidents before training

## 🚀 Advanced Features

### QUIC Synchronization (Multi-Database)

For distributed camera monitoring across multiple locations:

```bash
# On central server
npx agentdb sync start-server --port 4433 --auth-token secret123

# On remote locations
npx agentdb sync connect central.example.com 4433 --auth-token secret123
npx agentdb sync push --server central.example.com:4433 --incremental
npx agentdb sync pull --server central.example.com:4433 --incremental
```

### A/B Experiments

Test interventions' effectiveness:

```typescript
// Create experiment
npx agentdb causal experiment create \
  "monitoring-frequency-uptime" \
  "increased_monitoring" \
  "improved_uptime"

// Record observations
npx agentdb causal experiment add-observation 1 true 0.95  // Treatment group
npx agentdb causal experiment add-observation 1 false 0.85 // Control group

// Calculate results
npx agentdb causal experiment calculate 1
```

## 🐛 Troubleshooting

### Common Issues

1. **"Database not found"**: Ensure initialization was run
2. **"No JSON data found"**: Check AgentDB CLI output format
3. **Low prediction accuracy**: Need more training data
4. **Slow queries**: Consider upgrading to large preset or reducing K

### Debug Commands

```bash
# Verify database exists
ls -lh data/agentdb/camera-uptime.db

# Check database integrity
npx agentdb db stats

# View stored episodes
npx agentdb reflexion retrieve "camera" --k 50

# Export for inspection
npx agentdb export ./data/agentdb/camera-uptime.db ./debug-export.json
```

## 📚 References

- **AgentDB GitHub**: https://github.com/ruvnet/agentdb
- **Configuration**: `/workspaces/AxisCameraUptime/config/agentdb-config.json`
- **Utilities**: `/workspaces/AxisCameraUptime/src/lib/agentdb-utils.ts`
- **Initialization**: `/workspaces/AxisCameraUptime/scripts/init-agentdb.ts`

## 🎯 Integration Checklist

- [x] AgentDB installed and initialized
- [x] Database created with 768-dim vectors
- [x] Default causal edges added
- [x] Sample incidents stored
- [x] Utilities created and tested
- [x] Configuration file created
- [x] Documentation written
- [ ] Integrate into main monitoring service
- [ ] Set up automated training schedule
- [ ] Configure backup strategy
- [ ] Implement dashboard visualization

## 🔄 Next Steps

1. **Integrate into monitoring service**: Call `storeCameraIncident()` when incidents occur
2. **Build prediction dashboard**: Visualize `predictCameraFailure()` results
3. **Automate training**: Schedule weekly `trainCameraPatterns()` runs
4. **Monitor learning**: Track prediction accuracy over time
5. **Expand patterns**: Add more incident types and causal edges as you discover them

---

**Status**: ✅ Fully initialized and ready for production use
**Database**: `./data/agentdb/camera-uptime.db` (768-dim, medium preset)
**Sample Data**: 4 incidents, 6 causal edges, trained patterns
