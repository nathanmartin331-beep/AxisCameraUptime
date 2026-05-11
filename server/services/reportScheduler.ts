/**
 * Report Scheduler
 *
 * Once per hour (at :05) scans report_schedules for active rows whose
 * nextRunAt has passed, builds the report, emails it to the owning user,
 * then advances nextRunAt for the next firing.
 */

import cron from "node-cron";
import { storage } from "../storage";
import { buildAnalyticsReport, type ReportRange } from "./analyticsReport";
import { sendMail } from "./email";
import { computeNextRunAt, type Frequency } from "./scheduleTime";
import type { ReportSchedule } from "@shared/schema";

let started = false;

export function startReportScheduler() {
  if (started) {
    console.log("[ReportScheduler] Already running, skipping duplicate start");
    return;
  }
  started = true;

  console.log("[ReportScheduler] Starting (firing :05 past every hour)");

  cron.schedule("5 * * * *", async () => {
    try {
      await dispatchDueSchedules();
    } catch (err: any) {
      console.error("[ReportScheduler] Tick failed:", err?.message || err);
    }
  });
}

export async function dispatchDueSchedules(): Promise<void> {
  const now = new Date();
  const due = await storage.listDueReportSchedules(now);
  if (due.length === 0) return;

  console.log(`[ReportScheduler] Dispatching ${due.length} schedule(s)`);
  for (const schedule of due) {
    await runSchedule(schedule).catch((err) => {
      console.error(`[ReportScheduler] Schedule ${schedule.id} failed:`, err?.message || err);
    });
  }
}

export async function runSchedule(schedule: ReportSchedule): Promise<void> {
  const user = await storage.getSafeUser(schedule.userId);
  if (!user?.email) {
    await markRun(schedule, "Schedule owner has no email address");
    return;
  }

  try {
    const report = await buildAnalyticsReport({
      rangeDays: schedule.rangeDays as ReportRange,
      cameraIds: schedule.cameraIds ?? undefined,
    });

    const filename = `analytics-${schedule.rangeDays}d-${report.generatedAt.toISOString().slice(0, 10)}.csv`;

    await sendMail({
      to: user.email,
      subject: `[Scheduled] ${schedule.name} — ${schedule.rangeDays}d analytics`,
      html: report.html,
      attachments: [{ filename, content: report.csv, type: "text/csv" }],
    });

    await markRun(schedule, null);
    console.log(`[ReportScheduler] Sent "${schedule.name}" to ${user.email} (${report.rows.length} rows)`);
  } catch (err: any) {
    const sgMessage = err?.response?.body?.errors?.[0]?.message;
    const msg = sgMessage || err?.message || "Unknown error";
    await markRun(schedule, msg);
    throw err;
  }
}

async function markRun(schedule: ReportSchedule, lastError: string | null): Promise<void> {
  const now = new Date();
  const next = computeNextRunAt(
    {
      frequency: schedule.frequency as Frequency,
      hourLocal: schedule.hourLocal,
      dayOfWeek: schedule.dayOfWeek ?? undefined,
      dayOfMonth: schedule.dayOfMonth ?? undefined,
      timezone: schedule.timezone,
    },
    now,
  );
  await storage.updateReportSchedule(schedule.id, {
    lastRunAt: now,
    nextRunAt: next,
    lastError,
  });
}
