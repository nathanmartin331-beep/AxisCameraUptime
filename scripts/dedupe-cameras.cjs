// One-shot duplicate-camera cleanup.
// Keeps the oldest row per IP (by created_at). Re-parents history to the keeper.
// Wraps everything in a single transaction so any failure rolls back.

const Database = require("better-sqlite3");
const path = require("path");

const dbPath = process.argv[2] || path.join(__dirname, "..", "data", "camera-uptime.db");
const dryRun = process.argv.includes("--dry-run");

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

function countAll() {
  return {
    cameras: db.prepare("SELECT COUNT(*) c FROM cameras").get().c,
    uptimeEvents: db.prepare("SELECT COUNT(*) c FROM uptime_events").get().c,
    analyticsEvents: db.prepare("SELECT COUNT(*) c FROM analytics_events").get().c,
    uptimeDaily: db.prepare("SELECT COUNT(*) c FROM uptime_daily_summary").get().c,
    uptimeHourly: db.prepare("SELECT COUNT(*) c FROM uptime_hourly_summary").get().c,
    analyticsDaily: db.prepare("SELECT COUNT(*) c FROM analytics_daily_summary").get().c,
    analyticsHourly: db.prepare("SELECT COUNT(*) c FROM analytics_hourly_summary").get().c,
    groupMembers: db.prepare("SELECT COUNT(*) c FROM camera_group_members").get().c,
  };
}

const before = countAll();

// Build duplicate plan: for each duplicate IP, the keeper is the oldest by created_at.
const dupGroups = db.prepare(`
  SELECT LOWER(TRIM(ip_address)) AS ip, COUNT(*) AS n
  FROM cameras
  GROUP BY LOWER(TRIM(ip_address))
  HAVING n > 1
`).all();

const plan = []; // { ip, keeperId, dupeIds: [] }
for (const g of dupGroups) {
  const rows = db.prepare(`
    SELECT id, name, created_at
    FROM cameras
    WHERE LOWER(TRIM(ip_address)) = ?
    ORDER BY created_at ASC
  `).all(g.ip);
  const keeper = rows[0];
  const dupes = rows.slice(1);
  plan.push({ ip: g.ip, keeperId: keeper.id, keeperName: keeper.name, dupeIds: dupes.map((d) => d.id), dupeNames: dupes.map((d) => d.name) });
}

console.log(`[Plan] ${plan.length} IPs with duplicates; ${plan.reduce((s, p) => s + p.dupeIds.length, 0)} rows to remove`);
for (const p of plan) {
  console.log(`  ${p.ip}  keep="${p.keeperName}"  drop=[${p.dupeNames.map((n) => `"${n}"`).join(", ")}]`);
}

if (dryRun) {
  console.log("[Dry run] not applying. Re-run without --dry-run to commit.");
  db.close();
  return;
}

// Prepared statements scoped per (keeper, dupe) pair.
const stmts = {
  reparentUptimeEvents: db.prepare("UPDATE uptime_events SET camera_id = ? WHERE camera_id = ?"),
  reparentAnalyticsEvents: db.prepare("UPDATE analytics_events SET camera_id = ? WHERE camera_id = ?"),

  // Group memberships: drop dupe rows for groups the keeper is already in, then re-parent the rest.
  dropGroupConflicts: db.prepare(`
    DELETE FROM camera_group_members
    WHERE camera_id = ? AND group_id IN (SELECT group_id FROM camera_group_members WHERE camera_id = ?)
  `),
  reparentGroupMembers: db.prepare("UPDATE camera_group_members SET camera_id = ? WHERE camera_id = ?"),

  // Uptime daily/hourly summaries: drop dupe rows that conflict with keeper, then re-parent.
  dropUptimeDailyConflicts: db.prepare(`
    DELETE FROM uptime_daily_summary
    WHERE camera_id = ? AND day_start IN (SELECT day_start FROM uptime_daily_summary WHERE camera_id = ?)
  `),
  reparentUptimeDaily: db.prepare("UPDATE uptime_daily_summary SET camera_id = ? WHERE camera_id = ?"),
  dropUptimeHourlyConflicts: db.prepare(`
    DELETE FROM uptime_hourly_summary
    WHERE camera_id = ? AND hour_start IN (SELECT hour_start FROM uptime_hourly_summary WHERE camera_id = ?)
  `),
  reparentUptimeHourly: db.prepare("UPDATE uptime_hourly_summary SET camera_id = ? WHERE camera_id = ?"),

  // Analytics summaries: unique key includes event_type + scenario + day/hour_start.
  dropAnalyticsDailyConflicts: db.prepare(`
    DELETE FROM analytics_daily_summary
    WHERE camera_id = ? AND (event_type, COALESCE(scenario, 'default'), day_start) IN (
      SELECT event_type, COALESCE(scenario, 'default'), day_start FROM analytics_daily_summary WHERE camera_id = ?
    )
  `),
  reparentAnalyticsDaily: db.prepare("UPDATE analytics_daily_summary SET camera_id = ? WHERE camera_id = ?"),
  dropAnalyticsHourlyConflicts: db.prepare(`
    DELETE FROM analytics_hourly_summary
    WHERE camera_id = ? AND (event_type, COALESCE(scenario, 'default'), hour_start) IN (
      SELECT event_type, COALESCE(scenario, 'default'), hour_start FROM analytics_hourly_summary WHERE camera_id = ?
    )
  `),
  reparentAnalyticsHourly: db.prepare("UPDATE analytics_hourly_summary SET camera_id = ? WHERE camera_id = ?"),

  deleteCamera: db.prepare("DELETE FROM cameras WHERE id = ?"),
};

const txn = db.transaction(() => {
  let reparentedEvents = 0;
  let droppedSummaryConflicts = 0;
  let deletedCameras = 0;

  for (const p of plan) {
    for (const dupeId of p.dupeIds) {
      reparentedEvents += stmts.reparentUptimeEvents.run(p.keeperId, dupeId).changes;
      reparentedEvents += stmts.reparentAnalyticsEvents.run(p.keeperId, dupeId).changes;

      droppedSummaryConflicts += stmts.dropGroupConflicts.run(dupeId, p.keeperId).changes;
      stmts.reparentGroupMembers.run(p.keeperId, dupeId);

      droppedSummaryConflicts += stmts.dropUptimeDailyConflicts.run(dupeId, p.keeperId).changes;
      stmts.reparentUptimeDaily.run(p.keeperId, dupeId);
      droppedSummaryConflicts += stmts.dropUptimeHourlyConflicts.run(dupeId, p.keeperId).changes;
      stmts.reparentUptimeHourly.run(p.keeperId, dupeId);

      droppedSummaryConflicts += stmts.dropAnalyticsDailyConflicts.run(dupeId, p.keeperId).changes;
      stmts.reparentAnalyticsDaily.run(p.keeperId, dupeId);
      droppedSummaryConflicts += stmts.dropAnalyticsHourlyConflicts.run(dupeId, p.keeperId).changes;
      stmts.reparentAnalyticsHourly.run(p.keeperId, dupeId);

      deletedCameras += stmts.deleteCamera.run(dupeId).changes;
    }
  }

  return { reparentedEvents, droppedSummaryConflicts, deletedCameras };
});

const result = txn();
const after = countAll();

console.log("");
console.log("[Done]", result);
console.log("");
console.log("Counts                  before -> after  (delta)");
for (const k of Object.keys(before)) {
  const b = before[k];
  const a = after[k];
  console.log(`  ${k.padEnd(20)}  ${String(b).padStart(7)} -> ${String(a).padStart(7)}  (${a - b >= 0 ? "+" : ""}${a - b})`);
}

db.close();
