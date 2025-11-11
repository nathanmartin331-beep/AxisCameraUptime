/**
 * AgentDB Utilities for Camera Uptime Monitoring
 *
 * This module provides helper functions for integrating AgentDB
 * with the camera monitoring system.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// AgentDB configuration
const AGENTDB_PATH = process.env.AGENTDB_PATH || './data/agentdb/camera-uptime.db';

export interface CameraIncident {
  cameraId: string;
  cameraName: string;
  timestamp: Date;
  incidentType: 'network_timeout' | 'authentication_failure' | 'hardware_failure' | 'configuration_error' | 'firmware_issue';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  resolved: boolean;
  resolution?: string;
  metadata?: Record<string, any>;
}

export interface PredictionResult {
  cameraId: string;
  failureProbability: number;
  predictedIncidentType: string;
  confidence: number;
  recommendedActions: string[];
  basedOnPatterns: string[];
}

export interface SimilarIncident {
  sessionId: string;
  task: string;
  reward: number;
  success: boolean;
  similarity: number;
  critique?: string;
  metadata?: Record<string, any>;
}

/**
 * Store a camera incident in AgentDB
 */
export async function storeCameraIncident(incident: CameraIncident): Promise<void> {
  const sessionId = `camera-${incident.cameraId}-${incident.timestamp.getTime()}`;
  const task = `${incident.incidentType}_${incident.cameraId}`;
  const reward = incident.resolved ? 0.9 : 0.3;
  const success = incident.resolved;
  const critique = incident.resolution || 'Incident recorded';

  const metadata = JSON.stringify({
    cameraId: incident.cameraId,
    cameraName: incident.cameraName,
    incidentType: incident.incidentType,
    severity: incident.severity,
    timestamp: incident.timestamp.toISOString(),
    ...incident.metadata
  });

  const command = `npx agentdb reflexion store "${sessionId}" "${task}" ${reward} ${success} "${critique}" "" "" 0 0`;

  try {
    await execAsync(command, {
      env: { ...process.env, AGENTDB_PATH },
      cwd: process.cwd()
    });
    console.log(`Stored incident for camera ${incident.cameraId}`);
  } catch (error) {
    console.error('Failed to store camera incident:', error);
    throw error;
  }
}

/**
 * Search for similar camera incidents
 */
export async function findSimilarIncidents(
  query: string,
  k: number = 5,
  minConfidence: number = 0.75
): Promise<SimilarIncident[]> {
  const command = `npx agentdb query --query "${query}" --k ${k} --min-confidence ${minConfidence} --format json --synthesize-context`;

  try {
    const { stdout } = await execAsync(command, {
      env: { ...process.env, AGENTDB_PATH },
      cwd: process.cwd()
    });

    // Extract JSON from output (skip CLI decorations like emojis and formatting)
    const lines = stdout.split('\n');
    const jsonLine = lines.find(line => line.trim().startsWith('[') || line.trim().startsWith('{'));

    if (!jsonLine) {
      console.warn('No JSON data found in query response');
      return [];
    }

    return JSON.parse(jsonLine);
  } catch (error) {
    console.error('Failed to search incidents:', error);
    return [];
  }
}

/**
 * Predict potential camera failures using learned patterns
 */
export async function predictCameraFailure(
  cameraId: string,
  recentBehavior: Record<string, any>
): Promise<PredictionResult> {
  // Query for similar patterns
  const query = `camera_failure prediction ${cameraId}`;
  const similarIncidents = await findSimilarIncidents(query, 10, 0.7);

  // Calculate failure probability based on similar patterns
  const failureCount = similarIncidents.filter(i => !i.success).length;
  const failureProbability = failureCount / Math.max(similarIncidents.length, 1);

  // Extract common incident types
  const incidentTypes = similarIncidents
    .map(i => i.metadata?.incidentType)
    .filter(Boolean);

  const mostCommonType = incidentTypes.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const predictedIncidentType = Object.entries(mostCommonType)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown';

  // Generate recommendations
  const recommendedActions = generateRecommendations(predictedIncidentType, failureProbability);

  return {
    cameraId,
    failureProbability,
    predictedIncidentType,
    confidence: Math.max(...similarIncidents.map(i => i.similarity || 0)),
    recommendedActions,
    basedOnPatterns: similarIncidents.map(i => i.task)
  };
}

/**
 * Train AgentDB on camera patterns
 */
export async function trainCameraPatterns(
  domain: string = 'camera-incidents',
  epochs: number = 10
): Promise<void> {
  const command = `npx agentdb train --domain "${domain}" --epochs ${epochs} --batch-size 32`;

  try {
    await execAsync(command, {
      env: { ...process.env, AGENTDB_PATH },
      cwd: process.cwd()
    });
    console.log(`Training completed for domain: ${domain}`);
  } catch (error) {
    console.error('Failed to train patterns:', error);
    throw error;
  }
}

/**
 * Consolidate learned skills from successful incident resolutions
 */
export async function consolidateSkills(): Promise<void> {
  const command = `npx agentdb skill consolidate 3 0.7 7 true`;

  try {
    await execAsync(command, {
      env: { ...process.env, AGENTDB_PATH },
      cwd: process.cwd()
    });
    console.log('Skills consolidated successfully');
  } catch (error) {
    console.error('Failed to consolidate skills:', error);
    throw error;
  }
}

/**
 * Add causal edges for camera incidents
 */
export async function addCausalEdge(
  cause: string,
  effect: string,
  uplift: number,
  confidence: number = 0.9
): Promise<void> {
  const command = `npx agentdb causal add-edge "${cause}" "${effect}" ${uplift} ${confidence} 100`;

  try {
    await execAsync(command, {
      env: { ...process.env, AGENTDB_PATH },
      cwd: process.cwd()
    });
    console.log(`Added causal edge: ${cause} -> ${effect}`);
  } catch (error) {
    console.error('Failed to add causal edge:', error);
    throw error;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<Record<string, any>> {
  const command = `npx agentdb db stats`;

  try {
    const { stdout } = await execAsync(command, {
      env: { ...process.env, AGENTDB_PATH },
      cwd: process.cwd()
    });

    // Parse the stats output
    return { stats: stdout };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return { error: 'Failed to retrieve stats' };
  }
}

/**
 * Optimize memory and consolidate patterns
 */
export async function optimizeMemory(): Promise<void> {
  const command = `npx agentdb optimize-memory --compress true --consolidate-patterns true`;

  try {
    await execAsync(command, {
      env: { ...process.env, AGENTDB_PATH },
      cwd: process.cwd()
    });
    console.log('Memory optimization completed');
  } catch (error) {
    console.error('Failed to optimize memory:', error);
    throw error;
  }
}

/**
 * Helper function to generate recommendations based on predicted failure type
 */
function generateRecommendations(incidentType: string, probability: number): string[] {
  const recommendations: string[] = [];

  if (probability > 0.7) {
    recommendations.push('URGENT: High failure probability detected');
  }

  switch (incidentType) {
    case 'network_timeout':
      recommendations.push('Check network connectivity and latency');
      recommendations.push('Verify router and switch configurations');
      recommendations.push('Consider increasing timeout thresholds');
      break;
    case 'authentication_failure':
      recommendations.push('Verify camera credentials');
      recommendations.push('Check authentication token expiration');
      recommendations.push('Review recent security policy changes');
      break;
    case 'hardware_failure':
      recommendations.push('Schedule hardware inspection');
      recommendations.push('Check camera temperature and power supply');
      recommendations.push('Review warranty and replacement options');
      break;
    case 'configuration_error':
      recommendations.push('Review recent configuration changes');
      recommendations.push('Compare with working camera configurations');
      recommendations.push('Restore to known good configuration');
      break;
    case 'firmware_issue':
      recommendations.push('Check for firmware updates');
      recommendations.push('Review firmware changelog');
      recommendations.push('Consider firmware rollback if recent update');
      break;
    default:
      recommendations.push('Monitor camera closely for patterns');
      recommendations.push('Review system logs for anomalies');
  }

  return recommendations;
}

/**
 * Initialize default causal edges for camera monitoring
 */
export async function initializeDefaultCausalEdges(): Promise<void> {
  const edges = [
    { cause: 'network_latency_high', effect: 'camera_disconnect', uplift: 0.35 },
    { cause: 'firmware_update', effect: 'temporary_downtime', uplift: 0.85 },
    { cause: 'temperature_threshold_exceeded', effect: 'hardware_failure', uplift: 0.65 },
    { cause: 'authentication_token_expired', effect: 'connection_loss', uplift: 0.75 },
    { cause: 'power_fluctuation', effect: 'camera_reboot', uplift: 0.55 },
    { cause: 'bandwidth_saturation', effect: 'video_quality_degradation', uplift: 0.45 }
  ];

  for (const edge of edges) {
    await addCausalEdge(edge.cause, edge.effect, edge.uplift);
  }

  console.log('Initialized default causal edges');
}
