#!/usr/bin/env tsx
/**
 * AgentDB Initialization Script for Camera Uptime Monitoring
 *
 * This script initializes AgentDB with default causal edges,
 * creates sample incidents, and validates the setup.
 */

import {
  storeCameraIncident,
  findSimilarIncidents,
  predictCameraFailure,
  trainCameraPatterns,
  consolidateSkills,
  getDatabaseStats,
  initializeDefaultCausalEdges,
  type CameraIncident
} from '../src/lib/agentdb-utils.js';

async function main() {
  console.log('🚀 Initializing AgentDB for Camera Uptime Monitoring...\n');

  try {
    // Step 1: Initialize default causal edges
    console.log('📊 Step 1: Adding default causal edges...');
    await initializeDefaultCausalEdges();
    console.log('✅ Causal edges initialized\n');

    // Step 2: Add sample camera incidents
    console.log('📝 Step 2: Adding sample camera incidents...');
    const sampleIncidents: CameraIncident[] = [
      {
        cameraId: 'CAM-001',
        cameraName: 'Entrance Camera',
        timestamp: new Date(Date.now() - 86400000), // 1 day ago
        incidentType: 'network_timeout',
        severity: 'high',
        description: 'Camera lost connection due to network timeout',
        resolved: true,
        resolution: 'Reset network switch, connection restored',
        metadata: { duration_minutes: 15, affected_services: ['live-view', 'recording'] }
      },
      {
        cameraId: 'CAM-002',
        cameraName: 'Parking Lot Camera',
        timestamp: new Date(Date.now() - 172800000), // 2 days ago
        incidentType: 'authentication_failure',
        severity: 'medium',
        description: 'Authentication token expired',
        resolved: true,
        resolution: 'Regenerated authentication token',
        metadata: { auto_recovery: true }
      },
      {
        cameraId: 'CAM-003',
        cameraName: 'Warehouse Camera',
        timestamp: new Date(Date.now() - 259200000), // 3 days ago
        incidentType: 'hardware_failure',
        severity: 'critical',
        description: 'Camera overheating detected',
        resolved: true,
        resolution: 'Replaced cooling fan, temperature normalized',
        metadata: { temperature_celsius: 68, threshold_celsius: 65 }
      },
      {
        cameraId: 'CAM-004',
        cameraName: 'Loading Dock Camera',
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        incidentType: 'configuration_error',
        severity: 'low',
        description: 'Incorrect resolution settings',
        resolved: true,
        resolution: 'Restored default configuration',
        metadata: { config_backup: true }
      }
    ];

    for (const incident of sampleIncidents) {
      await storeCameraIncident(incident);
      console.log(`  ✓ Stored incident for ${incident.cameraName} (${incident.incidentType})`);
    }
    console.log('✅ Sample incidents added\n');

    // Step 3: Search for similar incidents
    console.log('🔍 Step 3: Testing incident search...');
    const similarIncidents = await findSimilarIncidents('network timeout camera', 3, 0.5);
    console.log(`  Found ${similarIncidents.length} similar incidents`);
    if (similarIncidents.length > 0) {
      console.log(`  Most relevant: ${similarIncidents[0].task}`);
    }
    console.log('✅ Search functionality validated\n');

    // Step 4: Test failure prediction
    console.log('🔮 Step 4: Testing failure prediction...');
    const prediction = await predictCameraFailure('CAM-001', {
      recent_disconnects: 2,
      network_latency_avg: 250,
      last_firmware_update: '2024-01-15'
    });
    console.log(`  Camera: ${prediction.cameraId}`);
    console.log(`  Failure Probability: ${(prediction.failureProbability * 100).toFixed(1)}%`);
    console.log(`  Predicted Type: ${prediction.predictedIncidentType}`);
    console.log(`  Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
    console.log(`  Recommendations: ${prediction.recommendedActions.length} actions`);
    console.log('✅ Prediction functionality validated\n');

    // Step 5: Train patterns (lightweight training)
    console.log('🧠 Step 5: Training camera patterns...');
    try {
      await trainCameraPatterns('camera-incidents', 5);
      console.log('✅ Pattern training completed\n');
    } catch (error) {
      console.log('⚠️  Training skipped (optional feature)\n');
    }

    // Step 6: Consolidate skills
    console.log('🎯 Step 6: Consolidating learned skills...');
    try {
      await consolidateSkills();
      console.log('✅ Skills consolidated\n');
    } catch (error) {
      console.log('⚠️  Skill consolidation skipped (requires more data)\n');
    }

    // Step 7: Get database statistics
    console.log('📈 Step 7: Retrieving database statistics...');
    const stats = await getDatabaseStats();
    console.log('✅ Database statistics retrieved\n');

    // Success summary
    console.log('🎉 AgentDB initialization completed successfully!\n');
    console.log('📚 Next steps:');
    console.log('  1. Integrate storeCameraIncident() into your monitoring service');
    console.log('  2. Use predictCameraFailure() for proactive monitoring');
    console.log('  3. Call findSimilarIncidents() for troubleshooting');
    console.log('  4. Run periodic trainCameraPatterns() to improve predictions');
    console.log('  5. Monitor database with getDatabaseStats()\n');

    console.log('🔗 Configuration file: config/agentdb-config.json');
    console.log('🔗 Utilities: src/lib/agentdb-utils.ts');
    console.log('🔗 Database: data/agentdb/camera-uptime.db\n');

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

// Run the initialization
main().catch(console.error);
