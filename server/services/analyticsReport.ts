import { storage } from "../storage";

export type ReportRange = 1 | 7 | 30 | 90 | 365;

export const SUPPORTED_RANGES: ReportRange[] = [1, 7, 30, 90, 365];

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

export interface BuildReportParams {
  rangeDays: ReportRange;
  cameraIds?: string[];
  eventTypes?: string[];
}

export interface ReportArtifacts {
  rows: AnalyticsReportRow[];
  csv: string;
  html: string;
  rangeDays: ReportRange;
  generatedAt: Date;
  cameraCount: number;
}

export async function buildAnalyticsReport(params: BuildReportParams): Promise<ReportArtifacts> {
  const eventTypes = params.eventTypes?.length ? params.eventTypes : [...DEFAULT_EVENT_TYPES];

  const allCameras = await storage.getAllCameras();
  const cameras = params.cameraIds?.length
    ? allCameras.filter((c) => params.cameraIds!.includes(c.id))
    : allCameras;

  const rows: AnalyticsReportRow[] = [];

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
    }
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.cameraName !== b.cameraName) return a.cameraName.localeCompare(b.cameraName);
    if (a.scenario !== b.scenario) return a.scenario.localeCompare(b.scenario);
    return a.eventType.localeCompare(b.eventType);
  });

  return {
    rows,
    csv: renderCsv(rows),
    html: renderHtml(rows, params.rangeDays),
    rangeDays: params.rangeDays,
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
