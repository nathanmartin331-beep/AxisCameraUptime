/**
 * Data Aggregation Service
 *
 * Rolls up raw uptime_events and analytics_events into hourly and daily summaries.
 * This dramatically reduces query times for historical data at scale (2500+ cameras).
 *
 * Schedule:
 * - Hourly at :05 — Roll up raw events older than 6 hours into hourly summaries
 * - Daily at 4:00 AM — Roll up hourly summaries older than 48 hours into daily summaries
 */

import cron from "node-cron";
import { sqlite } from "../db";

let aggregationStarted = false;

export function startDataAggregationService() {
  if (aggregationStarted) {
    console.log("[Aggregation] Service already running, skipping duplicate start");
    return;
  }
  aggregationStarted = true;

  console.log("[Aggregation] Initializing data aggregation service...");

  // Hourly aggregation at :05 past every hour
  cron.schedule("5 * * * *", async () => {
    await runHourlyAggregation();
  });

  // Daily aggregation at 4:00 AM
  cron.schedule("0 4 * * *", async () => {
    await runDailyAggregation();
  });
}

/**
 * Aggregate raw events older than 6 hours into hourly summaries.
 * After aggregation, delete the raw rows that were rolled up.
 */
async function runHourlyAggregation() {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 6);
  const cutoffTs = Math.floor(cutoff.getTime() / 1000);

  console.log(`[Aggregation] Running hourly rollup for events before ${cutoff.toISOString()}`);

  try {
    // Uptime hourly rollup
    const uptimeInserted = sqlite.prepare(`
      INSERT OR REPLACE INTO uptime_hourly_summary (id, camera_id, hour_start, online_count, offline_count, total_checks, avg_response_time_ms, uptime_percentage)
      SELECT
        lower(hex(randomblob(16))),
        camera_id,
        (timestamp / 3600) * 3600 AS hour_start,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online_count,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) AS offline_count,
        COUNT(*) AS total_checks,
        AVG(response_time_ms) AS avg_response_time_ms,
        CASE WHEN COUNT(*) > 0
          THEN CAST(SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) * 10000.0 / COUNT(*) AS INTEGER)
          ELSE 0
        END AS uptime_percentage
      FROM uptime_events
      WHERE timestamp <= ?
        AND is_synthetic = 0
      GROUP BY camera_id, hour_start
    `).run(cutoffTs);

    console.log(`[Aggregation] Uptime hourly: ${(uptimeInserted as any).changes ?? 0} summaries upserted`);

    // Analytics hourly rollup — group by scenario to preserve per-scenario data
    const analyticsInserted = sqlite.prepare(`
      INSERT OR REPLACE INTO analytics_hourly_summary (id, camera_id, hour_start, event_type, scenario, sum_value, avg_value, max_value, min_value, sample_count, metadata)
      SELECT
        lower(hex(randomblob(16))),
        camera_id,
        (timestamp / 3600) * 3600 AS hour_start,
        event_type,
        COALESCE(json_extract(metadata, '$.scenario'), 'default') AS scenario,
        SUM(value) AS sum_value,
        AVG(value) AS avg_value,
        MAX(value) AS max_value,
        MIN(value) AS min_value,
        COUNT(*) AS sample_count,
        (SELECT ae2.metadata FROM analytics_events ae2
         WHERE ae2.camera_id = ae.camera_id AND ae2.event_type = ae.event_type
           AND COALESCE(json_extract(ae2.metadata, '$.scenario'), 'default') = COALESCE(json_extract(ae.metadata, '$.scenario'), 'default')
           AND (ae2.timestamp / 3600) = (ae.timestamp / 3600)
         ORDER BY ae2.value DESC LIMIT 1) AS metadata
      FROM analytics_events ae
      WHERE timestamp <= ?
      GROUP BY camera_id, event_type, scenario, hour_start
    `).run(cutoffTs);

    console.log(`[Aggregation] Analytics hourly: ${(analyticsInserted as any).changes ?? 0} summaries upserted`);

    // Delete aggregated raw rows in batches
    let uptimeDeleted = 0;
    while (true) {
      const result = sqlite.prepare(
        `DELETE FROM uptime_events WHERE rowid IN (SELECT rowid FROM uptime_events WHERE timestamp <= ? AND is_synthetic = 0 LIMIT 10000)`
      ).run(cutoffTs);
      uptimeDeleted += result.changes;
      if (result.changes < 10000) break;
    }

    let analyticsDeleted = 0;
    while (true) {
      const result = sqlite.prepare(
        `DELETE FROM analytics_events WHERE rowid IN (SELECT rowid FROM analytics_events WHERE timestamp <= ? LIMIT 10000)`
      ).run(cutoffTs);
      analyticsDeleted += result.changes;
      if (result.changes < 10000) break;
    }

    console.log(`[Aggregation] Hourly rollup complete: deleted ${uptimeDeleted} uptime + ${analyticsDeleted} analytics raw rows`);
  } catch (error) {
    console.error("[Aggregation] Error during hourly aggregation:", error);
  }
}

/**
 * Aggregate hourly summaries older than 48 hours into daily summaries.
 * After aggregation, delete the hourly rows that were rolled up.
 */
async function runDailyAggregation() {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 48);
  const cutoffTs = Math.floor(cutoff.getTime() / 1000);

  console.log(`[Aggregation] Running daily rollup for hourly summaries before ${cutoff.toISOString()}`);

  try {
    // Uptime daily rollup from hourly
    const uptimeInserted = sqlite.prepare(`
      INSERT OR REPLACE INTO uptime_daily_summary (id, camera_id, day_start, online_count, offline_count, total_checks, avg_response_time_ms, uptime_percentage)
      SELECT
        lower(hex(randomblob(16))),
        camera_id,
        (hour_start / 86400) * 86400 AS day_start,
        SUM(online_count) AS online_count,
        SUM(offline_count) AS offline_count,
        SUM(total_checks) AS total_checks,
        AVG(avg_response_time_ms) AS avg_response_time_ms,
        CASE WHEN SUM(total_checks) > 0
          THEN CAST(SUM(online_count) * 10000.0 / SUM(total_checks) AS INTEGER)
          ELSE 0
        END AS uptime_percentage
      FROM uptime_hourly_summary
      WHERE hour_start <= ?
      GROUP BY camera_id, day_start
    `).run(cutoffTs);

    console.log(`[Aggregation] Uptime daily: ${(uptimeInserted as any).changes ?? 0} summaries upserted`);

    // Analytics daily rollup from hourly — group by scenario to preserve per-scenario data
    const analyticsInserted = sqlite.prepare(`
      INSERT OR REPLACE INTO analytics_daily_summary (id, camera_id, day_start, event_type, scenario, sum_value, avg_value, max_value, min_value, sample_count, metadata)
      SELECT
        lower(hex(randomblob(16))),
        camera_id,
        (hour_start / 86400) * 86400 AS day_start,
        event_type,
        COALESCE(scenario, 'default') AS scenario,
        SUM(sum_value) AS sum_value,
        AVG(avg_value) AS avg_value,
        MAX(max_value) AS max_value,
        MIN(min_value) AS min_value,
        SUM(sample_count) AS sample_count,
        (SELECT h2.metadata FROM analytics_hourly_summary h2
         WHERE h2.camera_id = h.camera_id AND h2.event_type = h.event_type
           AND COALESCE(h2.scenario, 'default') = COALESCE(h.scenario, 'default')
           AND (h2.hour_start / 86400) = (h.hour_start / 86400)
         ORDER BY h2.max_value DESC LIMIT 1) AS metadata
      FROM analytics_hourly_summary h
      WHERE hour_start <= ?
      GROUP BY camera_id, event_type, scenario, day_start
    `).run(cutoffTs);

    console.log(`[Aggregation] Analytics daily: ${(analyticsInserted as any).changes ?? 0} summaries upserted`);

    // Delete rolled-up hourly rows in batches
    let uptimeDeleted = 0;
    while (true) {
      const result = sqlite.prepare(
        `DELETE FROM uptime_hourly_summary WHERE rowid IN (SELECT rowid FROM uptime_hourly_summary WHERE hour_start <= ? LIMIT 10000)`
      ).run(cutoffTs);
      uptimeDeleted += result.changes;
      if (result.changes < 10000) break;
    }

    let analyticsDeleted = 0;
    while (true) {
      const result = sqlite.prepare(
        `DELETE FROM analytics_hourly_summary WHERE rowid IN (SELECT rowid FROM analytics_hourly_summary WHERE hour_start <= ? LIMIT 10000)`
      ).run(cutoffTs);
      analyticsDeleted += result.changes;
      if (result.changes < 10000) break;
    }

    console.log(`[Aggregation] Daily rollup complete: deleted ${uptimeDeleted} uptime + ${analyticsDeleted} analytics hourly rows`);
  } catch (error) {
    console.error("[Aggregation] Error during daily aggregation:", error);
  }
}

export { runHourlyAggregation, runDailyAggregation };
