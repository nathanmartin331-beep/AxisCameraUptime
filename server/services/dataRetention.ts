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
    // Get the minimum retention days across all users (most conservative)
    const allSettings = await db.select().from(userSettings);
    const retentionDays = allSettings.length > 0
      ? Math.min(...allSettings.map(s => s.dataRetentionDays ?? 90))
      : 90;

    const beforeDate = new Date();
    beforeDate.setDate(beforeDate.getDate() - retentionDays);

    console.log(`[Retention] Deleting events older than ${retentionDays} days (before ${beforeDate.toISOString()})`);

    const uptimeDeleted = await storage.deleteOldUptimeEvents(beforeDate);
    const analyticsDeleted = await storage.deleteOldAnalyticsEvents(beforeDate);

    console.log(`[Retention] Cleanup complete: ${uptimeDeleted} uptime events, ${analyticsDeleted} analytics events deleted`);
  } catch (error) {
    console.error("[Retention] Error during cleanup:", error);
  }
}

export { runRetentionCleanup };
