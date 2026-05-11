// Timezone-aware "next run" computation for report schedules.
// Self-contained (uses only Intl.DateTimeFormat) to avoid a tz dependency.

export type Frequency = "daily" | "weekly" | "monthly";

export interface ScheduleSpec {
  frequency: Frequency;
  hourLocal: number;      // 0-23
  dayOfWeek?: number;     // 0=Sun..6=Sat (weekly only)
  dayOfMonth?: number;    // 1-28 (monthly only)
  timezone: string;       // IANA tz, e.g. "America/New_York"
}

interface Parts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function partsInZone(date: Date, timezone: string): Parts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  };
}

// Find UTC Date whose wall-clock in `tz` reads as the given local components.
// Two-pass to settle DST transitions correctly.
function zonedWallClockToUtc(
  year: number, month: number, day: number, hour: number, minute: number, tz: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 2; i++) {
    const p = partsInZone(guess, tz);
    const asLocalUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const offset = asLocalUtc - guess.getTime();
    const next = new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offset);
    if (next.getTime() === guess.getTime()) return next;
    guess.setTime(next.getTime());
  }
  return guess;
}

function addDays(year: number, month: number, day: number, n: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function addMonths(year: number, month: number, day: number, n: number): { year: number; month: number; day: number } {
  const m0 = month - 1 + n;
  const newYear = year + Math.floor(m0 / 12);
  const newMonth = ((m0 % 12) + 12) % 12 + 1;
  return { year: newYear, month: newMonth, day };
}

export function computeNextRunAt(spec: ScheduleSpec, from: Date = new Date()): Date {
  const localNow = partsInZone(from, spec.timezone);

  if (spec.frequency === "daily") {
    let cand = zonedWallClockToUtc(localNow.year, localNow.month, localNow.day, spec.hourLocal, 0, spec.timezone);
    if (cand.getTime() <= from.getTime()) {
      const next = addDays(localNow.year, localNow.month, localNow.day, 1);
      cand = zonedWallClockToUtc(next.year, next.month, next.day, spec.hourLocal, 0, spec.timezone);
    }
    return cand;
  }

  if (spec.frequency === "weekly") {
    const targetDow = spec.dayOfWeek ?? 1;
    let daysUntil = (targetDow - localNow.weekday + 7) % 7;
    let cand = (() => {
      const t = addDays(localNow.year, localNow.month, localNow.day, daysUntil);
      return zonedWallClockToUtc(t.year, t.month, t.day, spec.hourLocal, 0, spec.timezone);
    })();
    if (cand.getTime() <= from.getTime()) {
      const t = addDays(localNow.year, localNow.month, localNow.day, daysUntil + 7);
      cand = zonedWallClockToUtc(t.year, t.month, t.day, spec.hourLocal, 0, spec.timezone);
    }
    return cand;
  }

  // monthly
  const dom = Math.max(1, Math.min(28, spec.dayOfMonth ?? 1));
  let cand = zonedWallClockToUtc(localNow.year, localNow.month, dom, spec.hourLocal, 0, spec.timezone);
  if (cand.getTime() <= from.getTime()) {
    const t = addMonths(localNow.year, localNow.month, dom, 1);
    cand = zonedWallClockToUtc(t.year, t.month, t.day, spec.hourLocal, 0, spec.timezone);
  }
  return cand;
}
