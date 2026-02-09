/**
 * Reliability Metrics Calculator
 * Calculates MTTR, MTBF, incident counts, and other reliability metrics
 */

import { storage } from "./storage";

export interface Incident {
  cameraId: string;
  cameraName: string;
  startTime: Date;
  endTime: Date | null; // null if still offline
  durationMinutes: number | null;
  incidentType: 'offline' | 'video_failed';
  resolved: boolean;
}

export interface CameraMetrics {
  cameraId: string;
  cameraName: string;
  location: string | null;
  
  // Uptime metrics
  uptimePercentage: number;
  
  // Incident metrics
  totalIncidents: number;
  offlineIncidents: number;
  videoFailureIncidents: number;
  
  // Mean Time To Recovery (minutes)
  mttr: number | null;
  mttrP50: number | null;
  mttrP90: number | null;
  
  // Mean Time Between Failures (hours)
  mtbf: number | null;
  
  // SLA metrics
  slaBreaches15min: number; // incidents > 15 minutes
  slaBreaches1hour: number; // incidents > 1 hour
  recoverySuccessRate: number; // % resolved within 15 min
  
  // Stability metrics
  rebootCount: number;
  stabilityIndex: number; // uptime% / incident count
  
  // Video health
  videoHealthCompliance: number; // % time video was ok
  
  // Current state
  currentIncident: Incident | null;
}

export interface SiteMetrics {
  location: string;
  cameraCount: number;
  
  // Aggregate metrics
  averageUptime: number;
  averageMttr: number | null;
  averageMtbf: number | null;
  
  // Incident density
  totalIncidents: number;
  incidentsPerCamera: number;
  
  // Site health score (0-100)
  siteHealthScore: number;
  
  // Rankings
  rank: number;
}

export interface NetworkMetrics {
  totalCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  warningCameras: number;
  
  // Network-wide averages
  averageUptime: number;
  averageMttr: number | null;
  averageMtbf: number | null;
  
  // Network totals
  totalIncidents: number;
  totalSlaBreaches: number;
  
  // Performance
  averageRecoverySuccessRate: number;
}

/**
 * Extract incidents from uptime events with robust state machine
 */
export async function extractIncidents(
  cameraId: string,
  startDate: Date,
  endDate: Date
): Promise<Incident[]> {
  const events = await storage.getUptimeEventsInRange(cameraId, startDate, endDate);
  const camera = await storage.getCameraById(cameraId);
  
  if (!camera) return [];
  
  const incidents: Incident[] = [];
  let currentOfflineIncident: Partial<Incident> | null = null;
  let currentVideoIncident: Partial<Incident> | null = null;
  
  // Sort events by timestamp
  const sortedEvents = [...events].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  for (const event of sortedEvents) {
    const eventTime = new Date(event.timestamp);
    
    // Handle offline status change
    if (event.status === 'offline') {
      // Close any open video incident when going offline
      if (currentVideoIncident) {
        const durationMs = eventTime.getTime() - currentVideoIncident.startTime!.getTime();
        incidents.push({
          ...currentVideoIncident,
          endTime: eventTime,
          durationMinutes: durationMs / (1000 * 60),
          resolved: true,
        } as Incident);
        currentVideoIncident = null;
      }
      
      // Start new offline incident if not already in one
      if (!currentOfflineIncident) {
        currentOfflineIncident = {
          cameraId,
          cameraName: camera.name,
          startTime: eventTime,
          incidentType: 'offline',
          resolved: false,
        };
      }
    }
    
    // Handle online status with video check
    else if (event.status === 'online') {
      // Close offline incident when coming back online
      if (currentOfflineIncident) {
        const durationMs = eventTime.getTime() - currentOfflineIncident.startTime!.getTime();
        incidents.push({
          ...currentOfflineIncident,
          endTime: eventTime,
          durationMinutes: durationMs / (1000 * 60),
          resolved: true,
        } as Incident);
        currentOfflineIncident = null;
      }
      
      // Handle video status
      if (event.videoStatus === 'video_failed') {
        // Start video incident if not already in one
        if (!currentVideoIncident) {
          currentVideoIncident = {
            cameraId,
            cameraName: camera.name,
            startTime: eventTime,
            incidentType: 'video_failed',
            resolved: false,
          };
        }
      } else if (event.videoStatus === 'video_ok') {
        // Close video incident when video recovers
        if (currentVideoIncident) {
          const durationMs = eventTime.getTime() - currentVideoIncident.startTime!.getTime();
          incidents.push({
            ...currentVideoIncident,
            endTime: eventTime,
            durationMinutes: durationMs / (1000 * 60),
            resolved: true,
          } as Incident);
          currentVideoIncident = null;
        }
      }
    }
  }
  
  // Handle ongoing incidents
  if (currentOfflineIncident) {
    const durationMs = endDate.getTime() - currentOfflineIncident.startTime!.getTime();
    incidents.push({
      ...currentOfflineIncident,
      endTime: null,
      durationMinutes: durationMs / (1000 * 60),
      resolved: false,
    } as Incident);
  }
  
  if (currentVideoIncident) {
    const durationMs = endDate.getTime() - currentVideoIncident.startTime!.getTime();
    incidents.push({
      ...currentVideoIncident,
      endTime: null,
      durationMinutes: durationMs / (1000 * 60),
      resolved: false,
    } as Incident);
  }
  
  return incidents;
}

/**
 * Calculate camera-specific metrics
 */
export async function calculateCameraMetrics(
  cameraId: string,
  days: number
): Promise<CameraMetrics | null> {
  const camera = await storage.getCameraById(cameraId);
  if (!camera) return null;
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Get uptime percentage
  const { percentage: uptimePercentage } = await storage.calculateUptimePercentage(cameraId, days);
  
  // Extract incidents
  const incidents = await extractIncidents(cameraId, startDate, endDate);
  const resolvedIncidents = incidents.filter(i => i.resolved && i.durationMinutes !== null);
  
  // Calculate MTTR (Mean Time To Recovery)
  let mttr: number | null = null;
  let mttrP50: number | null = null;
  let mttrP90: number | null = null;
  
  if (resolvedIncidents.length > 0) {
    const durations = resolvedIncidents
      .map(i => i.durationMinutes!)
      .sort((a, b) => a - b);
    
    mttr = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    mttrP50 = durations[Math.floor(durations.length * 0.5)];
    mttrP90 = durations[Math.floor(durations.length * 0.9)];
  }
  
  // Calculate MTBF (Mean Time Between Failures)
  let mtbf: number | null = null;
  if (incidents.length > 1) {
    const totalUptime = (uptimePercentage / 100) * days * 24; // hours
    mtbf = totalUptime / incidents.length;
  }
  
  // SLA metrics
  const slaBreaches15min = incidents.filter(i => i.durationMinutes && i.durationMinutes > 15).length;
  const slaBreaches1hour = incidents.filter(i => i.durationMinutes && i.durationMinutes > 60).length;
  const recoveredWithin15min = resolvedIncidents.filter(i => i.durationMinutes! <= 15).length;
  const recoverySuccessRate = resolvedIncidents.length > 0 
    ? (recoveredWithin15min / resolvedIncidents.length) * 100 
    : 0;
  
  // Count reboots
  const events = await storage.getUptimeEventsInRange(cameraId, startDate, endDate);
  const rebootCount = events.filter(e => e.status === 'online' && e.bootId).length;
  
  // Stability index
  const stabilityIndex = incidents.length > 0 ? uptimePercentage / incidents.length : uptimePercentage;
  
  // Video health compliance
  const videoOkEvents = events.filter(e => e.videoStatus === 'video_ok').length;
  const totalChecks = events.filter(e => e.videoStatus && e.videoStatus !== 'unknown').length;
  const videoHealthCompliance = totalChecks > 0 ? (videoOkEvents / totalChecks) * 100 : 0;
  
  // Current incident
  const currentIncident = incidents.find(i => !i.resolved) || null;
  
  return {
    cameraId,
    cameraName: camera.name,
    location: camera.location,
    uptimePercentage,
    totalIncidents: incidents.length,
    offlineIncidents: incidents.filter(i => i.incidentType === 'offline').length,
    videoFailureIncidents: incidents.filter(i => i.incidentType === 'video_failed').length,
    mttr,
    mttrP50,
    mttrP90,
    mtbf,
    slaBreaches15min,
    slaBreaches1hour,
    recoverySuccessRate,
    rebootCount,
    stabilityIndex,
    videoHealthCompliance,
    currentIncident,
  };
}

/**
 * Calculate site-level metrics (optimized for batch processing)
 */
export async function calculateSiteMetrics(
  userId: string,
  days: number
): Promise<SiteMetrics[]> {
  const cameras = await storage.getCamerasByUserId(userId);
  
  // Batch-calculate metrics for all cameras at once to minimize DB queries
  const metricsPromises = cameras.map((c) => calculateCameraMetrics(c.id, days));
  const allCameraMetrics = (await Promise.all(metricsPromises)).filter((m) => m !== null) as CameraMetrics[];
  
  // Group metrics by location
  const metricsByLocation = new Map<string, CameraMetrics[]>();
  for (const metric of allCameraMetrics) {
    const location = metric.location || 'Unknown';
    if (!metricsByLocation.has(location)) {
      metricsByLocation.set(location, []);
    }
    metricsByLocation.get(location)!.push(metric);
  }
  
  // Calculate site-level aggregations
  const siteMetrics: SiteMetrics[] = [];
  
  for (const [location, cameraMetrics] of Array.from(metricsByLocation)) {
    
    if (cameraMetrics.length === 0) continue;
    
    const averageUptime = cameraMetrics.reduce((sum, m) => sum + m.uptimePercentage, 0) / cameraMetrics.length;
    
    const validMttrs = cameraMetrics.filter(m => m.mttr !== null).map(m => m.mttr!);
    const averageMttr = validMttrs.length > 0 
      ? validMttrs.reduce((sum, m) => sum + m, 0) / validMttrs.length 
      : null;
    
    const validMtbfs = cameraMetrics.filter(m => m.mtbf !== null).map(m => m.mtbf!);
    const averageMtbf = validMtbfs.length > 0 
      ? validMtbfs.reduce((sum, m) => sum + m, 0) / validMtbfs.length 
      : null;
    
    const totalIncidents = cameraMetrics.reduce((sum, m) => sum + m.totalIncidents, 0);
    const incidentsPerCamera = totalIncidents / cameraMetrics.length;
    
    // Site health score: weighted combination of uptime, MTTR, and incident density
    const uptimeScore = averageUptime;
    const mttrScore = averageMttr ? Math.max(0, 100 - averageMttr) : 100;
    const incidentScore = Math.max(0, 100 - (incidentsPerCamera * 10));
    const siteHealthScore = (uptimeScore * 0.5) + (mttrScore * 0.3) + (incidentScore * 0.2);
    
    siteMetrics.push({
      location,
      cameraCount: cameraMetrics.length,
      averageUptime,
      averageMttr,
      averageMtbf,
      totalIncidents,
      incidentsPerCamera,
      siteHealthScore,
      rank: 0, // Will be set after sorting
    });
  }
  
  // Rank sites by health score
  siteMetrics.sort((a, b) => b.siteHealthScore - a.siteHealthScore);
  siteMetrics.forEach((site, index) => {
    site.rank = index + 1;
  });
  
  return siteMetrics;
}

/**
 * Calculate network-wide metrics
 */
export async function calculateNetworkMetrics(
  userId: string,
  days: number
): Promise<NetworkMetrics> {
  const cameras = await storage.getCamerasByUserId(userId);
  
  const onlineCameras = cameras.filter((c) => c.currentStatus === 'online').length;
  const offlineCameras = cameras.filter((c) => c.currentStatus === 'offline').length;
  const warningCameras = cameras.filter((c) => 
    c.currentStatus === 'online' && c.videoStatus === 'video_failed'
  ).length;
  
  // Calculate metrics for all cameras
  const metricsPromises = cameras.map((c) => calculateCameraMetrics(c.id, days));
  const cameraMetrics = (await Promise.all(metricsPromises)).filter((m) => m !== null) as CameraMetrics[];
  
  if (cameraMetrics.length === 0) {
    return {
      totalCameras: cameras.length,
      onlineCameras,
      offlineCameras,
      warningCameras,
      averageUptime: 0,
      averageMttr: null,
      averageMtbf: null,
      totalIncidents: 0,
      totalSlaBreaches: 0,
      averageRecoverySuccessRate: 0,
    };
  }
  
  const averageUptime = cameraMetrics.reduce((sum, m) => sum + m.uptimePercentage, 0) / cameraMetrics.length;
  
  const validMttrs = cameraMetrics.filter(m => m.mttr !== null).map(m => m.mttr!);
  const averageMttr = validMttrs.length > 0 
    ? validMttrs.reduce((sum, m) => sum + m, 0) / validMttrs.length 
    : null;
  
  const validMtbfs = cameraMetrics.filter(m => m.mtbf !== null).map(m => m.mtbf!);
  const averageMtbf = validMtbfs.length > 0 
    ? validMtbfs.reduce((sum, m) => sum + m, 0) / validMtbfs.length 
    : null;
  
  const totalIncidents = cameraMetrics.reduce((sum, m) => sum + m.totalIncidents, 0);
  const totalSlaBreaches = cameraMetrics.reduce((sum, m) => sum + m.slaBreaches15min, 0);
  
  const averageRecoverySuccessRate = cameraMetrics.reduce((sum, m) => sum + m.recoverySuccessRate, 0) / cameraMetrics.length;
  
  return {
    totalCameras: cameras.length,
    onlineCameras,
    offlineCameras,
    warningCameras,
    averageUptime,
    averageMttr,
    averageMtbf,
    totalIncidents,
    totalSlaBreaches,
    averageRecoverySuccessRate,
  };
}
