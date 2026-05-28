import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { sendError, validateId, getUserId } from "./shared";
import {
  buildAnalyticsReport,
  SUPPORTED_RANGES,
  SUPPORTED_HOURLY_RANGES,
  type ReportRange,
  type ReportGranularity,
} from "../services/analyticsReport";
import { sendMail, EmailNotConfiguredError } from "../services/email";
import { storage } from "../storage";
import { computeNextRunAt, type Frequency } from "../services/scheduleTime";
import { runSchedule } from "../services/reportScheduler";

const router = Router();

function parseRange(raw: unknown): ReportRange | null {
  const n = Number(raw);
  return (SUPPORTED_RANGES as number[]).includes(n) ? (n as ReportRange) : null;
}

function parseCameraIds(raw: unknown): string[] | null {
  if (raw === undefined || raw === null || raw === "") return [];
  if (typeof raw !== "string") return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of ids) {
    if (!validateId(id)) return null;
  }
  return ids;
}

function parseGranularity(raw: unknown): ReportGranularity | null {
  if (raw === undefined || raw === null || raw === "") return "daily";
  if (raw === "daily" || raw === "hourly") return raw;
  return null;
}

// GET /api/reports/analytics/export?range=30&cameraIds=a,b,c&granularity=daily|hourly
router.get("/api/reports/analytics/export", requireAuth, async (req: any, res) => {
  try {
    const range = parseRange(req.query.range);
    if (!range) return sendError(res, 400, "range must be one of 1, 7, 30, 90, 365");

    const granularity = parseGranularity(req.query.granularity);
    if (!granularity) return sendError(res, 400, "granularity must be 'daily' or 'hourly'");
    if (granularity === "hourly" && !(SUPPORTED_HOURLY_RANGES as number[]).includes(range)) {
      return sendError(res, 400, `Hourly reports support only ${SUPPORTED_HOURLY_RANGES.join("/")} day ranges`);
    }

    const cameraIds = parseCameraIds(req.query.cameraIds);
    if (cameraIds === null) return sendError(res, 400, "Invalid cameraIds");

    const appSettings = await storage.getAppSettings();
    const report = await buildAnalyticsReport({
      rangeDays: range,
      cameraIds,
      granularity,
      timezone: appSettings.reportTimezone ?? undefined,
    });

    if (granularity === "hourly" && report.hourlyCsv) {
      const filename = `analytics-hourly-${range}d-${report.generatedAt.toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(report.hourlyCsv);
    } else {
      const filename = `analytics-${range}d-${report.generatedAt.toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(report.csv);
    }
  } catch (error: any) {
    console.error("Error exporting analytics report:", error);
    sendError(res, 500, error.message || "Failed to export analytics report");
  }
});

// POST /api/reports/analytics/email  body: { range, cameraIds?, granularity? }
router.post("/api/reports/analytics/email", requireAuth, async (req: any, res) => {
  try {
    const bodySchema = z.object({
      range: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
      cameraIds: z.array(z.string().min(1).max(128)).optional(),
      granularity: z.enum(["daily", "hourly"]).optional(),
    });
    const body = bodySchema.parse(req.body ?? {});
    const granularity: ReportGranularity = body.granularity ?? "daily";
    if (granularity === "hourly" && !(SUPPORTED_HOURLY_RANGES as number[]).includes(body.range)) {
      return sendError(res, 400, `Hourly reports support only ${SUPPORTED_HOURLY_RANGES.join("/")} day ranges`);
    }

    const userEmail = req.user?.email;
    if (!userEmail) return sendError(res, 400, "Your account has no email address on file");

    const appSettings = await storage.getAppSettings();
    const report = await buildAnalyticsReport({
      rangeDays: body.range,
      cameraIds: body.cameraIds,
      granularity,
      timezone: appSettings.reportTimezone ?? undefined,
    });

    const dateSlug = report.generatedAt.toISOString().slice(0, 10);
    const filename = granularity === "hourly"
      ? `analytics-hourly-${body.range}d-${dateSlug}.csv`
      : `analytics-${body.range}d-${dateSlug}.csv`;
    const attachments: Array<{ filename: string; content: string; type: string }> = [
      { filename, content: report.csv, type: "text/csv" },
    ];

    const subject = granularity === "hourly"
      ? `Hourly analytics report — ${body.range}d (${report.hourlyRows?.length ?? 0} hourly rows)`
      : `Analytics report — ${body.range}d (${report.rows.length} rows)`;

    await sendMail({
      to: userEmail,
      subject,
      html: report.html,
      attachments,
    });

    res.json({
      message: `Analytics report emailed to ${userEmail}`,
      rowCount: report.rows.length,
      hourlyRowCount: report.hourlyRows?.length,
      cameraCount: report.cameraCount,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    if (error instanceof EmailNotConfiguredError) return sendError(res, 400, error.message);
    const sgMessage = error?.response?.body?.errors?.[0]?.message;
    console.error("Error emailing analytics report:", sgMessage || error?.message || error);
    sendError(res, 500, sgMessage ? `SendGrid: ${sgMessage}` : "Failed to email analytics report");
  }
});

// === Scheduled Reports ===

const RANGE_VALUES = [1, 7, 30, 90, 365] as const;

const scheduleBaseSchema = z.object({
  name: z.string().min(1).max(120),
  rangeDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
  granularity: z.enum(["daily", "hourly"]).optional(),
  cameraIds: z.array(z.string().min(1).max(128)).max(1000).nullable().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  hourLocal: z.number().int().min(0).max(23),
  timezone: z.string().min(1).max(64),
  active: z.boolean().optional(),
});

function validateFrequencyFields(input: z.infer<typeof scheduleBaseSchema>): string | null {
  if (input.frequency === "weekly" && (input.dayOfWeek === undefined)) {
    return "dayOfWeek is required for weekly schedules";
  }
  if (input.frequency === "monthly" && (input.dayOfMonth === undefined)) {
    return "dayOfMonth is required for monthly schedules";
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    return `Invalid timezone: ${input.timezone}`;
  }
  if (input.granularity === "hourly" && !(SUPPORTED_HOURLY_RANGES as number[]).includes(input.rangeDays)) {
    return `Hourly schedules support only ${SUPPORTED_HOURLY_RANGES.join("/")} day ranges`;
  }
  return null;
}

router.get("/api/reports/schedules", requireAuth, async (req: any, res) => {
  try {
    const list = await storage.listReportSchedulesByUser(getUserId(req));
    res.json(list);
  } catch (error: any) {
    console.error("Error listing report schedules:", error);
    sendError(res, 500, "Failed to list schedules");
  }
});

router.post("/api/reports/schedules", requireAuth, async (req: any, res) => {
  try {
    const body = scheduleBaseSchema.parse(req.body ?? {});
    const validationError = validateFrequencyFields(body);
    if (validationError) return sendError(res, 400, validationError);

    const nextRunAt = computeNextRunAt({
      frequency: body.frequency,
      hourLocal: body.hourLocal,
      dayOfWeek: body.dayOfWeek,
      dayOfMonth: body.dayOfMonth,
      timezone: body.timezone,
    });

    const created = await storage.createReportSchedule({
      userId: getUserId(req),
      name: body.name,
      reportType: "analytics",
      rangeDays: body.rangeDays,
      granularity: body.granularity ?? "daily",
      cameraIds: body.cameraIds ?? null,
      frequency: body.frequency,
      dayOfWeek: body.dayOfWeek ?? null,
      dayOfMonth: body.dayOfMonth ?? null,
      hourLocal: body.hourLocal,
      timezone: body.timezone,
      active: body.active ?? true,
      nextRunAt,
    });
    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    console.error("Error creating schedule:", error);
    sendError(res, 500, "Failed to create schedule");
  }
});

router.patch("/api/reports/schedules/:id", requireAuth, async (req: any, res) => {
  try {
    const id = validateId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid schedule ID");

    const existing = await storage.getReportSchedule(id);
    if (!existing || existing.userId !== getUserId(req)) {
      return sendError(res, 404, "Schedule not found");
    }

    const body = scheduleBaseSchema.partial().parse(req.body ?? {});

    const merged = {
      frequency: (body.frequency ?? existing.frequency) as Frequency,
      hourLocal: body.hourLocal ?? existing.hourLocal,
      dayOfWeek: body.dayOfWeek ?? existing.dayOfWeek ?? undefined,
      dayOfMonth: body.dayOfMonth ?? existing.dayOfMonth ?? undefined,
      timezone: body.timezone ?? existing.timezone,
      granularity: (body.granularity ?? existing.granularity) as ReportGranularity,
      rangeDays: body.rangeDays ?? (existing.rangeDays as ReportRange),
    };

    if (merged.frequency === "weekly" && merged.dayOfWeek === undefined) {
      return sendError(res, 400, "dayOfWeek required for weekly");
    }
    if (merged.frequency === "monthly" && merged.dayOfMonth === undefined) {
      return sendError(res, 400, "dayOfMonth required for monthly");
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: merged.timezone });
    } catch {
      return sendError(res, 400, `Invalid timezone: ${merged.timezone}`);
    }
    if (merged.granularity === "hourly" && !(SUPPORTED_HOURLY_RANGES as number[]).includes(merged.rangeDays)) {
      return sendError(res, 400, `Hourly schedules support only ${SUPPORTED_HOURLY_RANGES.join("/")} day ranges`);
    }

    const cadenceChanged =
      body.frequency !== undefined ||
      body.hourLocal !== undefined ||
      body.dayOfWeek !== undefined ||
      body.dayOfMonth !== undefined ||
      body.timezone !== undefined;

    const patch: any = { ...body };
    if (body.cameraIds !== undefined) patch.cameraIds = body.cameraIds;
    if (cadenceChanged) {
      patch.nextRunAt = computeNextRunAt(merged);
    }

    const updated = await storage.updateReportSchedule(id, patch);
    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    console.error("Error updating schedule:", error);
    sendError(res, 500, "Failed to update schedule");
  }
});

router.delete("/api/reports/schedules/:id", requireAuth, async (req: any, res) => {
  try {
    const id = validateId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid schedule ID");
    const existing = await storage.getReportSchedule(id);
    if (!existing || existing.userId !== getUserId(req)) {
      return sendError(res, 404, "Schedule not found");
    }
    await storage.deleteReportSchedule(id, getUserId(req));
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting schedule:", error);
    sendError(res, 500, "Failed to delete schedule");
  }
});

router.post("/api/reports/schedules/:id/run", requireAuth, async (req: any, res) => {
  try {
    const id = validateId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid schedule ID");
    const existing = await storage.getReportSchedule(id);
    if (!existing || existing.userId !== getUserId(req)) {
      return sendError(res, 404, "Schedule not found");
    }
    await runSchedule(existing);
    res.json({ message: "Schedule run successfully" });
  } catch (error: any) {
    if (error instanceof EmailNotConfiguredError) return sendError(res, 400, error.message);
    const sgMessage = error?.response?.body?.errors?.[0]?.message;
    console.error("Error running schedule:", sgMessage || error?.message || error);
    sendError(res, 500, sgMessage ? `SendGrid: ${sgMessage}` : "Failed to run schedule");
  }
});

export default router;
