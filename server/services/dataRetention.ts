/**
 * Data Retention Service
 *
 * Automatically cleans up old uptime events and analytics events
 * based on the configured data retention period.
 * Runs daily at 3:00 AM. Deletes in batches to avoid long write locks.
 */

import cron from "node-cron";
import { storage } from "../storage";
import { db } from "../db";
import { userSettings } from "@shared/schema";

let retentionStarted = false;

export function startDataRetentionService() {
  if (retentionStarted) {
    console.log("[Retention] Service already running, skipping duplicate start");
    return;
  }
  retentionStarted = true;

  console.log("[Retention] Initializing data retention service (daily at 3:00 AM)...");

  // Schedule daily at 3:00 AM
  cron.schedule("0 3 * * *", async () => {
    await runRetentionCleanup();
  });
}

async function runRetentionCleanup() {
  console.log("[Retention] Starting daily cleanup...");

  try {
    // Process each user's retention setting individually
    const allSettings = await db.select().from(userSettings);

    // Build maps of userId → retentionDays
    const userRetention = new Map<string, number>();
    const userHourlyRetention = new Map<string, number>();
    for (const s of allSettings) {
      userRetention.set(s.userId, s.dataRetentionDays ?? 90);
      userHourlyRetention.set(s.userId, s.hourlyRetentionDays ?? 30);
    }

    // Get all users who have cameras (including those without explicit settings)
    const allCameras = await storage.getAllCameras();
    const userCameraIds = new Map<string, string[]>();
    for (const cam of allCameras) {
      const ids = userCameraIds.get(cam.userId) || [];
      ids.push(cam.id);
      userCameraIds.set(cam.userId, ids);
    }

    let totalUptimeDeleted = 0;
    let totalAnalyticsDeleted = 0;
    let totalUptimeHourlyDeleted = 0;
    let totalAnalyticsHourlyDeleted = 0;

    for (const [userId, cameraIds] of userCameraIds) {
      const retentionDays = userRetention.get(userId) ?? 90;
      const hourlyRetentionDays = userHourlyRetention.get(userId) ?? 30;

      const beforeDate = new Date();
      beforeDate.setDate(beforeDate.getDate() - retentionDays);

      const hourlyBeforeDate = new Date();
      hourlyBeforeDate.setDate(hourlyBeforeDate.getDate() - hourlyRetentionDays);

      const uptimeDeleted = await storage.deleteOldUptimeEventsForCameras(cameraIds, beforeDate);
      const analyticsDeleted = await storage.deleteOldAnalyticsEventsForCameras(cameraIds, beforeDate);
      const uptimeHourlyDeleted = await storage.deleteOldUptimeHourlyForCameras(cameraIds, hourlyBeforeDate);
      const analyticsHourlyDeleted = await storage.deleteOldAnalyticsHourlyForCameras(cameraIds, hourlyBeforeDate);

      totalUptimeDeleted += uptimeDeleted;
      totalAnalyticsDeleted += analyticsDeleted;
      totalUptimeHourlyDeleted += uptimeHourlyDeleted;
      totalAnalyticsHourlyDeleted += analyticsHourlyDeleted;

      if (uptimeDeleted > 0 || analyticsDeleted > 0 || uptimeHourlyDeleted > 0 || analyticsHourlyDeleted > 0) {
        console.log(`[Retention] User ${userId}: deleted ${uptimeDeleted} uptime + ${analyticsDeleted} analytics events (${retentionDays}d); ${uptimeHourlyDeleted} uptime + ${analyticsHourlyDeleted} analytics hourly summaries (${hourlyRetentionDays}d)`);
      }
    }

    console.log(`[Retention] Cleanup complete: ${totalUptimeDeleted} uptime + ${totalAnalyticsDeleted} analytics events; ${totalUptimeHourlyDeleted} uptime + ${totalAnalyticsHourlyDeleted} analytics hourly summaries deleted`);
  } catch (error) {
    console.error("[Retention] Error during cleanup:", error);
  }
}

export { runRetentionCleanup };
