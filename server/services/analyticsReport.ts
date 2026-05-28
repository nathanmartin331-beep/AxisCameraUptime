import { storage } from "../storage";

export type ReportRange = 1 | 7 | 30 | 90 | 365;
export type ReportGranularity = "daily" | "hourly";

export const SUPPORTED_RANGES: ReportRange[] = [1, 7, 30, 90, 365];
export const SUPPORTED_HOURLY_RANGES: ReportRange[] = [1, 7, 30];

export const DEFAULT_EVENT_TYPES = [
  "line_crossing",
  "people_in",
  "people_out",
  "occupancy",
] as const;

export interface AnalyticsReportRow {
  date: string;
  cameraName: string;
  location: string;
  scenario: string;
  eventType: string;
  count: number;
}

export interface AnalyticsHourlyReportRow {
  hour: string; // ISO UTC bucket start
  cameraName: string;
  location: string;
  scenario: string;
  eventType: string;
  count: number;
}

export interface BuildReportParams {
  rangeDays: ReportRange;
  cameraIds?: string[];
  eventTypes?: string[];
  granularity?: ReportGranularity;
  // IANA timezone (e.g. "America/New_York"). Used to bucket daily totals and
  // render dates/hours in the email + CSV. Defaults to the host's system TZ.
  timezone?: string;
}

export interface ReportArtifacts {
  rows: AnalyticsReportRow[];
  hourlyRows?: AnalyticsHourlyReportRow[];
  csv: string;
  hourlyCsv?: string;
  html: string;
  rangeDays: ReportRange;
  granularity: ReportGranularity;
  generatedAt: Date;
  cameraCount: number;
  timezone: string;
}

function resolveTimezone(tz?: string): string {
  if (tz && tz.trim()) return tz.trim();
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export async function buildAnalyticsReport(params: BuildReportParams): Promise<ReportArtifacts> {
  const granularity: ReportGranularity = params.granularity ?? "daily";
  if (granularity === "hourly" && !SUPPORTED_HOURLY_RANGES.includes(params.rangeDays)) {
    throw new Error(`Hourly reports support only ${SUPPORTED_HOURLY_RANGES.join("/")} day ranges`);
  }

  const timezone = resolveTimezone(params.timezone);
  const eventTypes = params.eventTypes?.length ? params.eventTypes : [...DEFAULT_EVENT_TYPES];

  const allCameras = await storage.getAllCameras();
  const cameras = params.cameraIds?.length
    ? allCameras.filter((c) => params.cameraIds!.includes(c.id))
    : allCameras;

  const rows: AnalyticsReportRow[] = [];
  const hourlyRows: AnalyticsHourlyReportRow[] = [];

  for (const camera of cameras) {
    for (const eventType of eventTypes) {
      if (granularity === "hourly") {
        const hourlyByScenario = await storage.getAnalyticsHourlyTotalsByScenario(
          camera.id,
          eventType,
          params.rangeDays,
        );
        for (const [scenario, hours] of Object.entries(hourlyByScenario)) {
          for (const h of hours) {
            if (!h.total) continue;
            hourlyRows.push({
              hour: h.hour,
              cameraName: camera.name,
              location: camera.location ?? "",
              scenario,
              eventType,
              count: h.total,
            });
          }
        }
      } else {
        const byScenario = await storage.getAnalyticsDailyTotalsByScenario(
          camera.id,
          eventType,
          params.rangeDays,
          timezone,
        );
        for (const [scenario, days] of Object.entries(byScenario)) {
          for (const day of days) {
            if (!day.total) continue;
            rows.push({
              date: day.date,
              cameraName: camera.name,
              location: camera.location ?? "",
              scenario,
              eventType,
              count: day.total,
            });
          }
        }
      }
    }
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.cameraName !== b.cameraName) return a.cameraName.localeCompare(b.cameraName);
    if (a.scenario !== b.scenario) return a.scenario.localeCompare(b.scenario);
    return a.eventType.localeCompare(b.eventType);
  });

  hourlyRows.sort((a, b) => {
    if (a.hour !== b.hour) return a.hour.localeCompare(b.hour);
    if (a.cameraName !== b.cameraName) return a.cameraName.localeCompare(b.cameraName);
    if (a.scenario !== b.scenario) return a.scenario.localeCompare(b.scenario);
    return a.eventType.localeCompare(b.eventType);
  });

  const isHourly = granularity === "hourly";
  return {
    rows: isHourly ? [] : rows,
    hourlyRows: isHourly ? hourlyRows : undefined,
    csv: isHourly ? renderHourlyCsv(hourlyRows, timezone) : renderCsv(rows),
    hourlyCsv: isHourly ? renderHourlyCsv(hourlyRows, timezone) : undefined,
    html: isHourly
      ? renderHourlyHtml(hourlyRows, params.rangeDays, timezone)
      : renderHtml(rows, params.rangeDays, timezone),
    rangeDays: params.rangeDays,
    granularity,
    generatedAt: new Date(),
    cameraCount: cameras.length,
    timezone,
  };
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function renderCsv(rows: AnalyticsReportRow[]): string {
  const header = "Date,Camera Name,Location,Scenario,Event Type,Count";
  const body = rows.map((r) =>
    [r.date, r.cameraName, r.location, r.scenario, r.eventType, r.count]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...body].join("\n");
}

function renderHourlyCsv(rows: AnalyticsHourlyReportRow[], timezone: string): string {
  const tzAbbr = tzAbbreviation(timezone);
  const header = `Hour (${tzAbbr}),Camera Name,Location,Scenario,Event Type,Count`;
  const body = rows.map((r) =>
    [formatHourInTz(r.hour, timezone), r.cameraName, r.location, r.scenario, r.eventType, r.count]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...body].join("\n");
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rangeLabel(days: ReportRange): string {
  if (days === 1) return "today";
  if (days === 7) return "the last 7 days";
  if (days === 30) return "the last 30 days";
  if (days === 90) return "the last 90 days";
  return "the last 365 days";
}

// Short timezone abbreviation (e.g. "EDT") for a given IANA zone. If the
// runtime can't produce one, falls back to the full IANA name.
function tzAbbreviation(timezone: string, at: Date = new Date()): string {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" });
    const part = dtf.formatToParts(at).find((p) => p.type === "timeZoneName");
    if (part?.value) return part.value;
  } catch {
    /* fall through */
  }
  return timezone;
}

function formatHourInTz(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  try {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const map: Record<string, string> = {};
    for (const p of dtf.formatToParts(d)) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    // Intl.DateTimeFormat with hour12: false can produce hour "24" at midnight
    // in some runtimes; normalize to "00".
    const hour = map.hour === "24" ? "00" : map.hour;
    return `${map.year}-${map.month}-${map.day} ${hour}:${map.minute}`;
  } catch {
    return iso;
  }
}

function renderHtml(rows: AnalyticsReportRow[], rangeDays: ReportRange, timezone: string): string {
  const total = rows.reduce((acc, r) => acc + r.count, 0).toLocaleString();
  const tableRows = rows
    .map(
      (r) => `<tr>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.date)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.cameraName)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.location)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.scenario)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.eventType)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${r.count.toLocaleString()}</td>
</tr>`,
    )
    .join("\n");

  const emptyMessage = rows.length === 0
    ? `<p style="color:#6b7280;">No analytics data recorded for ${rangeLabel(rangeDays)}.</p>`
    : "";

  return `<div style="font-family:Arial,sans-serif;color:#111827;">
  <h2 style="margin:0 0 8px 0;">Analytics Report</h2>
  <p style="margin:0 0 16px 0;color:#374151;">Daily analytics totals for ${rangeLabel(rangeDays)} (${htmlEscape(timezone)}). Total events: <strong>${total}</strong>.</p>
  ${emptyMessage}
  ${rows.length > 0 ? `<table style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Date</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Camera</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Location</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Scenario</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Event Type</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">Count</th>
      </tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>` : ""}
  <p style="margin-top:16px;color:#6b7280;font-size:12px;">CSV attached with the same data.</p>
</div>`;
}

function renderHourlyHtml(rows: AnalyticsHourlyReportRow[], rangeDays: ReportRange, timezone: string): string {
  const total = rows.reduce((acc, r) => acc + r.count, 0).toLocaleString();
  const scenarioCount = new Set(rows.map((r) => r.scenario)).size;
  const tzAbbr = tzAbbreviation(timezone);

  if (rows.length === 0) {
    return `<div style="font-family:Arial,sans-serif;color:#111827;">
  <h2 style="margin:0 0 8px 0;">Hourly Analytics Report</h2>
  <p style="margin:0 0 16px 0;color:#374151;">Per-hour totals by scenario for ${rangeLabel(rangeDays)} (${htmlEscape(timezone)}).</p>
  <p style="color:#6b7280;">No hourly analytics data recorded for ${rangeLabel(rangeDays)}.</p>
</div>`;
  }

  const MAX_ROWS = 500;
  const truncated = rows.length > MAX_ROWS;
  const bodyRows = rows.slice(0, MAX_ROWS);

  const tableRows = bodyRows
    .map(
      (r) => `<tr>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;white-space:nowrap;">${htmlEscape(formatHourInTz(r.hour, timezone))}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.cameraName)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.location)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.scenario)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.eventType)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${r.count.toLocaleString()}</td>
</tr>`,
    )
    .join("\n");

  const truncatedNote = truncated
    ? `<p style="margin-top:8px;color:#6b7280;font-size:12px;">Showing the first ${MAX_ROWS.toLocaleString()} of ${rows.length.toLocaleString()} hourly rows. Full data in the attached CSV.</p>`
    : "";

  return `<div style="font-family:Arial,sans-serif;color:#111827;">
  <h2 style="margin:0 0 8px 0;">Hourly Analytics Report</h2>
  <p style="margin:0 0 16px 0;color:#374151;">Per-hour totals by scenario for ${rangeLabel(rangeDays)} (${htmlEscape(timezone)}). <strong>${rows.length.toLocaleString()}</strong> hourly rows across <strong>${scenarioCount}</strong> scenario${scenarioCount === 1 ? "" : "s"}. Total events: <strong>${total}</strong>.</p>
  <table style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Hour (${htmlEscape(tzAbbr)})</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Camera</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Location</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Scenario</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Event Type</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">Count</th>
      </tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>
  ${truncatedNote}
  <p style="margin-top:16px;color:#6b7280;font-size:12px;">Hourly CSV attached with the full per-hour, per-scenario data.</p>
</div>`;
}
