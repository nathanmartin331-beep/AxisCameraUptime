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
  hour: string; // ISO UTC
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
}

export async function buildAnalyticsReport(params: BuildReportParams): Promise<ReportArtifacts> {
  const granularity: ReportGranularity = params.granularity ?? "daily";
  if (granularity === "hourly" && !SUPPORTED_HOURLY_RANGES.includes(params.rangeDays)) {
    throw new Error(`Hourly reports support only ${SUPPORTED_HOURLY_RANGES.join("/")} day ranges`);
  }

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
    csv: isHourly ? renderHourlyCsv(hourlyRows) : renderCsv(rows),
    hourlyCsv: isHourly ? renderHourlyCsv(hourlyRows) : undefined,
    html: isHourly
      ? renderHourlyHtml(hourlyRows, params.rangeDays)
      : renderHtml(rows, params.rangeDays),
    rangeDays: params.rangeDays,
    granularity,
    generatedAt: new Date(),
    cameraCount: cameras.length,
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

function renderHourlyCsv(rows: AnalyticsHourlyReportRow[]): string {
  const header = "Hour,Camera Name,Location,Scenario,Event Type,Count";
  const body = rows.map((r) =>
    [r.hour, r.cameraName, r.location, r.scenario, r.eventType, r.count]
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

function renderHtml(rows: AnalyticsReportRow[], rangeDays: ReportRange): string {
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
  <p style="margin:0 0 16px 0;color:#374151;">Daily analytics totals for ${rangeLabel(rangeDays)}. Total events: <strong>${total}</strong>.</p>
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

function formatHourUtc(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:00 UTC`;
}

function renderHourlyHtml(rows: AnalyticsHourlyReportRow[], rangeDays: ReportRange): string {
  const total = rows.reduce((acc, r) => acc + r.count, 0).toLocaleString();
  const scenarioCount = new Set(rows.map((r) => r.scenario)).size;

  if (rows.length === 0) {
    return `<div style="font-family:Arial,sans-serif;color:#111827;">
  <h2 style="margin:0 0 8px 0;">Hourly Analytics Report</h2>
  <p style="margin:0 0 16px 0;color:#374151;">Per-hour totals by scenario for ${rangeLabel(rangeDays)}.</p>
  <p style="color:#6b7280;">No hourly analytics data recorded for ${rangeLabel(rangeDays)}.</p>
</div>`;
  }

  const MAX_ROWS = 500;
  const truncated = rows.length > MAX_ROWS;
  const bodyRows = rows.slice(0, MAX_ROWS);

  const tableRows = bodyRows
    .map(
      (r) => `<tr>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;white-space:nowrap;">${htmlEscape(formatHourUtc(r.hour))}</td>
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
  <p style="margin:0 0 16px 0;color:#374151;">Per-hour totals by scenario for ${rangeLabel(rangeDays)}. <strong>${rows.length.toLocaleString()}</strong> hourly rows across <strong>${scenarioCount}</strong> scenario${scenarioCount === 1 ? "" : "s"}. Total events: <strong>${total}</strong>.</p>
  <table style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Hour (UTC)</th>
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
