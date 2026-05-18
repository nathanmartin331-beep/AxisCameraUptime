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

  return {
    rows,
    hourlyRows: granularity === "hourly" ? hourlyRows : undefined,
    csv: renderCsv(rows),
    hourlyCsv: granularity === "hourly" ? renderHourlyCsv(hourlyRows) : undefined,
    html: renderHtml(rows, params.rangeDays, granularity === "hourly" ? hourlyRows : undefined),
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

function renderHtml(
  rows: AnalyticsReportRow[],
  rangeDays: ReportRange,
  hourlyRows?: AnalyticsHourlyReportRow[],
): string {
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

  const hourlySection = hourlyRows && hourlyRows.length > 0
    ? `<h3 style="margin:24px 0 8px 0;">Hourly breakdown</h3>
  <p style="margin:0 0 12px 0;color:#374151;">Per-hour totals for ${rangeLabel(rangeDays)}. ${hourlyRows.length.toLocaleString()} rows. Full data in the attached hourly CSV.</p>
  <table style="border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Hour (UTC)</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Camera</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Scenario</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Event Type</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">Count</th>
      </tr>
    </thead>
    <tbody>
${hourlyRows
  .slice(0, 200)
  .map(
    (r) => `<tr>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.hour)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.cameraName)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.scenario)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;">${htmlEscape(r.eventType)}</td>
  <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${r.count.toLocaleString()}</td>
</tr>`,
  )
  .join("\n")}
    </tbody>
  </table>
  ${hourlyRows.length > 200 ? `<p style="margin-top:8px;color:#6b7280;font-size:12px;">Showing the first 200 of ${hourlyRows.length.toLocaleString()} hourly rows. Full data in the attached hourly CSV.</p>` : ""}`
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
  ${hourlySection}
  <p style="margin-top:16px;color:#6b7280;font-size:12px;">CSV attached with the same data.</p>
</div>`;
}
