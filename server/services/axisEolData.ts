/**
 * Axis Communications product lifecycle data.
 *
 * Sourced from official Axis product support pages and
 * Product Discontinuation Statement PDFs.
 *
 * Policy defaults (when specific dates are unknown):
 *  - Hardware/RMA support: discontinuation date + 6 years
 *  - AXIS OS support: discontinuation date + 5 years (varies by LTS track)
 */

export interface AxisProductLifecycle {
  /** Canonical model identifier, e.g. "M3005-V" */
  model: string;
  /** Date the product was officially discontinued (YYYY-MM-DD) */
  discontinuedDate?: string;
  /** Last date for hardware warranty / RMA claims (YYYY-MM-DD) */
  endOfHardwareSupport?: string;
  /** Last date for AXIS OS / firmware updates (YYYY-MM-DD) */
  endOfSoftwareSupport?: string;
  /** Recommended replacement model */
  replacementModel?: string;
}

export type LifecycleStatus = "active" | "eol-supported" | "end-of-support";

export interface LifecycleLookupResult extends AxisProductLifecycle {
  status: LifecycleStatus;
  /** Human-readable status label */
  statusLabel: string;
}

/**
 * Static lookup table of Axis discontinued products.
 * Products NOT in this table are assumed active / in production.
 *
 * Key = uppercase model without "AXIS " prefix, e.g. "P3364-V".
 */
const EOL_DATA: Record<string, AxisProductLifecycle> = {
  // ---- Older models (discontinued ~2015-2017) ----
  "M3005-V": {
    model: "M3005-V",
    discontinuedDate: "2015-08-31",
    endOfHardwareSupport: "2021-08-31",
    endOfSoftwareSupport: "2021-08-31",
    replacementModel: "M3085-V",
  },
  "M3006-V": {
    model: "M3006-V",
    discontinuedDate: "2015-10-31",
    endOfHardwareSupport: "2021-10-31",
    endOfSoftwareSupport: "2021-10-31",
    replacementModel: "M3066-V",
  },
  "P1365": {
    model: "P1365",
    discontinuedDate: "2015-06-17",
    endOfHardwareSupport: "2021-06-17",
    endOfSoftwareSupport: "2021-06-17",
    replacementModel: "P1385",
  },
  "P3364-V": {
    model: "P3364-V",
    discontinuedDate: "2017-01-31",
    endOfHardwareSupport: "2023-01-31",
    endOfSoftwareSupport: "2023-01-31",
  },
  "P3364-LV": {
    model: "P3364-LV",
    discontinuedDate: "2017-01-31",
    endOfHardwareSupport: "2023-01-31",
    endOfSoftwareSupport: "2023-01-31",
  },
  "P3364-VE": {
    model: "P3364-VE",
    discontinuedDate: "2017-01-31",
    endOfHardwareSupport: "2023-01-31",
    endOfSoftwareSupport: "2023-01-31",
  },
  "P3364-LVE": {
    model: "P3364-LVE",
    discontinuedDate: "2017-01-31",
    endOfHardwareSupport: "2023-01-31",
    endOfSoftwareSupport: "2023-01-31",
  },
  "P5515": {
    model: "P5515",
    discontinuedDate: "2017-01-22",
    endOfHardwareSupport: "2023-01-22",
    endOfSoftwareSupport: "2023-12-31",
    replacementModel: "M5526-E",
  },
  "P5515-E": {
    model: "P5515-E",
    discontinuedDate: "2017-01-22",
    endOfHardwareSupport: "2023-01-22",
    endOfSoftwareSupport: "2023-12-31",
    replacementModel: "M5526-E",
  },
  "P3904-R": {
    model: "P3904-R",
    discontinuedDate: "2017-06-24",
    endOfHardwareSupport: "2023-06-24",
    endOfSoftwareSupport: "2024-04-17",
    replacementModel: "P3905-R Mk III",
  },
  "P1357-E": {
    model: "P1357-E",
    discontinuedDate: "2016-11-10",
    endOfHardwareSupport: "2022-11-10",
    endOfSoftwareSupport: "2022-11-10",
    replacementModel: "P1387-LE",
  },
  "P1357": {
    model: "P1357",
    discontinuedDate: "2016-11-10",
    endOfHardwareSupport: "2022-11-10",
    endOfSoftwareSupport: "2022-11-10",
    replacementModel: "P1387",
  },
  "M3106-LVE": {
    model: "M3106-LVE",
    discontinuedDate: "2016-11-30",
    endOfHardwareSupport: "2022-11-30",
    endOfSoftwareSupport: "2025-12-31",
    replacementModel: "M3126-LVE",
  },
  "M3106-LVE Mk II": {
    model: "M3106-LVE Mk II",
    discontinuedDate: "2016-11-30",
    endOfHardwareSupport: "2022-11-30",
    endOfSoftwareSupport: "2025-12-31",
    replacementModel: "M3126-LVE",
  },
  "M2026-LE": {
    model: "M2026-LE",
    discontinuedDate: "2016-11-30",
    endOfHardwareSupport: "2022-11-30",
    endOfSoftwareSupport: "2025-12-31",
  },
  "M2026-LE Mk II": {
    model: "M2026-LE Mk II",
    discontinuedDate: "2016-11-30",
    endOfHardwareSupport: "2022-11-30",
    endOfSoftwareSupport: "2025-12-31",
  },

  // ---- Models discontinued ~2018-2019 ----
  "Q1765-LE": {
    model: "Q1765-LE",
    discontinuedDate: "2018-07-31",
    endOfHardwareSupport: "2024-07-31",
    endOfSoftwareSupport: "2024-07-31",
    replacementModel: "Q1805-LE",
  },
  "P1367": {
    model: "P1367",
    discontinuedDate: "2019-04-30",
    endOfHardwareSupport: "2025-04-30",
    endOfSoftwareSupport: "2027-12-31",
    replacementModel: "P1387",
  },
  "P1367-E": {
    model: "P1367-E",
    discontinuedDate: "2019-04-30",
    endOfHardwareSupport: "2025-04-30",
    endOfSoftwareSupport: "2027-12-31",
    replacementModel: "P1387-LE",
  },
  "V5915": {
    model: "V5915",
    discontinuedDate: "2019-08-31",
    endOfHardwareSupport: "2025-08-31",
    endOfSoftwareSupport: "2025-08-31",
    replacementModel: "V5925",
  },

  // ---- Models discontinued ~2020-2022 ----
  "Q6155-E": {
    model: "Q6155-E",
    discontinuedDate: "2021-11-17",
    endOfHardwareSupport: "2027-11-17",
    endOfSoftwareSupport: "2026-11-17",
    replacementModel: "Q6355-LE",
  },
  "M1134": {
    model: "M1134",
    discontinuedDate: "2022-05-31",
    endOfHardwareSupport: "2028-05-31",
    endOfSoftwareSupport: "2027-05-31",
    replacementModel: "M1135 Mk II",
  },
  "M1135": {
    model: "M1135",
    discontinuedDate: "2022-05-31",
    endOfHardwareSupport: "2028-05-31",
    endOfSoftwareSupport: "2027-05-31",
    replacementModel: "M1135 Mk II",
  },
  "M1137": {
    model: "M1137",
    discontinuedDate: "2022-05-31",
    endOfHardwareSupport: "2028-05-31",
    endOfSoftwareSupport: "2027-05-31",
    replacementModel: "M1137 Mk II",
  },

  // ---- Recently discontinued (2023-2024) ----
  "M5525-E": {
    model: "M5525-E",
    discontinuedDate: "2024-03-27",
    endOfHardwareSupport: "2030-03-27",
    endOfSoftwareSupport: "2029-03-27",
    replacementModel: "M5526-E",
  },
  "P1245": {
    model: "P1245",
    discontinuedDate: "2024-06-02",
    endOfHardwareSupport: "2030-06-02",
    endOfSoftwareSupport: "2029-06-02",
    replacementModel: "P1245 Mk II",
  },
  "P1265": {
    model: "P1265",
    discontinuedDate: "2024-06-02",
    endOfHardwareSupport: "2030-06-02",
    endOfSoftwareSupport: "2029-06-02",
    replacementModel: "P1265 Mk II",
  },
  "P1275": {
    model: "P1275",
    discontinuedDate: "2024-06-02",
    endOfHardwareSupport: "2030-06-02",
    endOfSoftwareSupport: "2029-06-02",
    replacementModel: "P1275 Mk II",
  },

  // ---- Older fixed cameras ----
  "M1004-W": {
    model: "M1004-W",
    discontinuedDate: "2015-09-30",
    endOfHardwareSupport: "2021-09-30",
    endOfSoftwareSupport: "2021-09-30",
  },
  "M1011": {
    model: "M1011",
    discontinuedDate: "2014-09-30",
    endOfHardwareSupport: "2020-09-30",
    endOfSoftwareSupport: "2020-09-30",
  },
  "M1013": {
    model: "M1013",
    discontinuedDate: "2015-09-30",
    endOfHardwareSupport: "2021-09-30",
    endOfSoftwareSupport: "2021-09-30",
  },
  "M1014": {
    model: "M1014",
    discontinuedDate: "2015-09-30",
    endOfHardwareSupport: "2021-09-30",
    endOfSoftwareSupport: "2021-09-30",
  },
  "M1025": {
    model: "M1025",
    discontinuedDate: "2015-09-30",
    endOfHardwareSupport: "2021-09-30",
    endOfSoftwareSupport: "2021-09-30",
  },
  "M1054": {
    model: "M1054",
    discontinuedDate: "2015-09-30",
    endOfHardwareSupport: "2021-09-30",
    endOfSoftwareSupport: "2021-09-30",
  },
  "M1103": {
    model: "M1103",
    discontinuedDate: "2014-09-30",
    endOfHardwareSupport: "2020-09-30",
    endOfSoftwareSupport: "2020-09-30",
  },
  "M1104": {
    model: "M1104",
    discontinuedDate: "2014-09-30",
    endOfHardwareSupport: "2020-09-30",
    endOfSoftwareSupport: "2020-09-30",
  },
  "M1113": {
    model: "M1113",
    discontinuedDate: "2014-09-30",
    endOfHardwareSupport: "2020-09-30",
    endOfSoftwareSupport: "2020-09-30",
  },
  "M1114": {
    model: "M1114",
    discontinuedDate: "2014-09-30",
    endOfHardwareSupport: "2020-09-30",
    endOfSoftwareSupport: "2020-09-30",
  },

  // ---- P-series fixed cameras ----
  "P1354": {
    model: "P1354",
    discontinuedDate: "2016-05-31",
    endOfHardwareSupport: "2022-05-31",
    endOfSoftwareSupport: "2022-05-31",
  },
  "P1354-E": {
    model: "P1354-E",
    discontinuedDate: "2016-05-31",
    endOfHardwareSupport: "2022-05-31",
    endOfSoftwareSupport: "2022-05-31",
  },
  "P1405-LE": {
    model: "P1405-LE",
    discontinuedDate: "2016-11-30",
    endOfHardwareSupport: "2022-11-30",
    endOfSoftwareSupport: "2022-11-30",
    replacementModel: "P1445-LE",
  },
  "P1425-LE": {
    model: "P1425-LE",
    discontinuedDate: "2017-11-30",
    endOfHardwareSupport: "2023-11-30",
    endOfSoftwareSupport: "2023-11-30",
    replacementModel: "P1445-LE",
  },
  "P1428-E": {
    model: "P1428-E",
    discontinuedDate: "2017-03-31",
    endOfHardwareSupport: "2023-03-31",
    endOfSoftwareSupport: "2023-03-31",
    replacementModel: "P1448-LE",
  },

  // ---- Dome cameras ----
  "M3044-V": {
    model: "M3044-V",
    discontinuedDate: "2019-09-30",
    endOfHardwareSupport: "2025-09-30",
    endOfSoftwareSupport: "2025-12-31",
    replacementModel: "M3085-V",
  },
  "M3045-V": {
    model: "M3045-V",
    discontinuedDate: "2019-09-30",
    endOfHardwareSupport: "2025-09-30",
    endOfSoftwareSupport: "2025-12-31",
    replacementModel: "M3086-V",
  },
  "M3046-V": {
    model: "M3046-V",
    discontinuedDate: "2019-09-30",
    endOfHardwareSupport: "2025-09-30",
    endOfSoftwareSupport: "2025-12-31",
    replacementModel: "M3086-V",
  },
  "M3048-P": {
    model: "M3048-P",
    discontinuedDate: "2019-09-30",
    endOfHardwareSupport: "2025-09-30",
    endOfSoftwareSupport: "2025-12-31",
    replacementModel: "M3088-V",
  },
  "M3065-V": {
    model: "M3065-V",
    discontinuedDate: "2021-05-31",
    endOfHardwareSupport: "2027-05-31",
    endOfSoftwareSupport: "2026-05-31",
    replacementModel: "M3085-V",
  },
  "M3066-V": {
    model: "M3066-V",
    discontinuedDate: "2021-05-31",
    endOfHardwareSupport: "2027-05-31",
    endOfSoftwareSupport: "2026-05-31",
    replacementModel: "M3086-V",
  },

  // ---- Q-series PTZ ----
  "Q6128-E": {
    model: "Q6128-E",
    discontinuedDate: "2020-11-30",
    endOfHardwareSupport: "2026-11-30",
    endOfSoftwareSupport: "2025-11-30",
    replacementModel: "Q6135-LE",
  },
  "Q6114-E": {
    model: "Q6114-E",
    discontinuedDate: "2018-05-31",
    endOfHardwareSupport: "2024-05-31",
    endOfSoftwareSupport: "2024-05-31",
    replacementModel: "Q6135-LE",
  },
  "Q6115-E": {
    model: "Q6115-E",
    discontinuedDate: "2018-05-31",
    endOfHardwareSupport: "2024-05-31",
    endOfSoftwareSupport: "2024-05-31",
    replacementModel: "Q6135-LE",
  },

  // ---- Explosion-protected / Specialty ----
  "F34": {
    model: "F34",
    discontinuedDate: "2019-10-31",
    endOfHardwareSupport: "2025-10-31",
    endOfSoftwareSupport: "2025-10-31",
    replacementModel: "F44",
  },

  // ---- Network Speakers (C-series) ----
  "C3003-E": {
    model: "C3003-E",
    discontinuedDate: "2020-06-30",
    endOfHardwareSupport: "2026-06-30",
    endOfSoftwareSupport: "2025-06-30",
    replacementModel: "C1310-E",
  },
  "C2005": {
    model: "C2005",
    discontinuedDate: "2019-03-31",
    endOfHardwareSupport: "2025-03-31",
    endOfSoftwareSupport: "2025-03-31",
    replacementModel: "C1410",
  },
  "C1004-E": {
    model: "C1004-E",
    discontinuedDate: "2018-06-30",
    endOfHardwareSupport: "2024-06-30",
    endOfSoftwareSupport: "2024-06-30",
    replacementModel: "C1310-E",
  },

  // ---- Network Intercoms (A-series) ----
  "A8004-VE": {
    model: "A8004-VE",
    discontinuedDate: "2020-09-30",
    endOfHardwareSupport: "2026-09-30",
    endOfSoftwareSupport: "2025-09-30",
    replacementModel: "A8207-VE Mk II",
  },
  "A8105-E": {
    model: "A8105-E",
    discontinuedDate: "2021-03-31",
    endOfHardwareSupport: "2027-03-31",
    endOfSoftwareSupport: "2026-03-31",
    replacementModel: "A8207-VE Mk II",
  },

  // ---- Network Video Recorders ----
  "S3008": {
    model: "S3008",
    discontinuedDate: "2022-09-30",
    endOfHardwareSupport: "2028-09-30",
    endOfSoftwareSupport: "2027-09-30",
    replacementModel: "S3008 Mk II",
  },

  // ---- Radar ----
  "D2110-VE": {
    model: "D2110-VE",
    discontinuedDate: "2023-06-30",
    endOfHardwareSupport: "2029-06-30",
    endOfSoftwareSupport: "2028-06-30",
    replacementModel: "D2210-VE",
  },

  // ---- I/O Relay modules ----
  "A9161": {
    model: "A9161",
    discontinuedDate: "2019-11-30",
    endOfHardwareSupport: "2025-11-30",
    endOfSoftwareSupport: "2025-11-30",
    replacementModel: "A9188",
  },
};

/**
 * Normalize a model string for lookup.
 * Strips "AXIS " prefix, trims whitespace, uppercases for comparison,
 * but returns the canonical casing for the match.
 */
function normalizeModel(raw: string): string {
  return raw
    .replace(/^AXIS\s+/i, "")
    .replace(/\s+Network\s+Camera$/i, "")
    .replace(/\s+Dome\s+Camera$/i, "")
    .replace(/\s+PTZ\s+Camera$/i, "")
    .replace(/\s+Bullet\s+Camera$/i, "")
    .replace(/\s+Network\s+Speaker$/i, "")
    .replace(/\s+Network\s+Horn\s+Speaker$/i, "")
    .replace(/\s+Network\s+Intercom$/i, "")
    .replace(/\s+Network\s+Door\s+Station$/i, "")
    .replace(/\s+Network\s+Video\s+Recorder$/i, "")
    .replace(/\s+Network\s+Radar$/i, "")
    .replace(/\s+Radar\s+Detector$/i, "")
    .replace(/\s+Network\s+I\/O\s+Relay\s+Module$/i, "")
    .trim();
}

/**
 * Look up lifecycle / EOL information from the static table.
 * Returns null if the model is not in the discontinuation database
 * (implying it's still an active product).
 */
export function lookupAxisEol(modelInput: string | null | undefined): LifecycleLookupResult | null {
  if (!modelInput) return null;

  const normalized = normalizeModel(modelInput);
  // Try exact match first
  let entry = EOL_DATA[normalized];

  // Try case-insensitive match
  if (!entry) {
    const upper = normalized.toUpperCase();
    for (const [key, val] of Object.entries(EOL_DATA)) {
      if (key.toUpperCase() === upper) {
        entry = val;
        break;
      }
    }
  }

  if (!entry) return null;

  return computeStatus(entry);
}

function computeStatus(entry: AxisProductLifecycle): LifecycleLookupResult {
  const now = new Date();
  const hwEnd = entry.endOfHardwareSupport ? new Date(entry.endOfHardwareSupport) : null;
  const swEnd = entry.endOfSoftwareSupport ? new Date(entry.endOfSoftwareSupport) : null;

  const hwExpired = hwEnd && hwEnd < now;
  const swExpired = swEnd && swEnd < now;

  let status: LifecycleStatus;
  let statusLabel: string;

  if (hwExpired && swExpired) {
    status = "end-of-support";
    statusLabel = "End of Support";
  } else if (entry.discontinuedDate) {
    status = "eol-supported";
    statusLabel = "Discontinued (Supported)";
  } else {
    status = "active";
    statusLabel = "Active";
  }

  return { ...entry, status, statusLabel };
}

/**
 * Build the axis.com product support URL slug for a model.
 * Example: "P3255-LVE" → "axis-p3255-lve"
 */
function modelToSlug(model: string): string {
  const normalized = normalizeModel(model);
  // "Mk II" → "mk-ii", spaces → hyphens, lowercase
  return "axis-" + normalized.replace(/\s+/g, "-").toLowerCase();
}

/**
 * Parse a date string in various Axis formats.
 * Handles "Month DD, YYYY", "YYYY-MM-DD", "DD Mon YYYY", etc.
 */
function parseAxisDate(text: string): string | undefined {
  const trimmed = text.trim();
  // Try ISO-ish format first
  const isoMatch = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  // Try "Month DD, YYYY"
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

/**
 * Fetch EOL/lifecycle data from the Axis website for a given model.
 * Scrapes the product support page at axis.com.
 * Returns null if the product page doesn't exist or has no discontinuation info.
 *
 * This is a best-effort scrape: if the page structure changes, it returns null
 * and the static lookup table is used as fallback.
 */
export async function fetchAxisEolFromWeb(
  modelInput: string
): Promise<AxisProductLifecycle | null> {
  const slug = modelToSlug(modelInput);
  const url = `https://www.axis.com/en-us/products/${slug}/support`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AxisCameraUptime/1.0 (lifecycle-check)",
        "Accept": "text/html",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();

    // Check if this product is discontinued
    // Axis uses a "support-discontinued-panel" class for EOL products
    if (!html.includes("discontinued") && !html.includes("Discontinued")) {
      return null; // Product is still active — no EOL data
    }

    const result: AxisProductLifecycle = {
      model: normalizeModel(modelInput),
    };

    // Extract hardware support end date
    // Pattern: "Hardware support ends" or "End of hardware support" followed by a date
    const hwPatterns = [
      /(?:hardware\s+(?:warranty|support)\s+(?:ends?|expir(?:es?|y))[:\s]*)([\w\s,]+\d{4})/i,
      /(?:end\s+of\s+hardware\s+support)[:\s]*([\w\s,]+\d{4})/i,
      /(?:RMA\s+support\s+(?:until|ends?|expir(?:es?|y)))[:\s]*([\w\s,]+\d{4})/i,
    ];
    for (const pat of hwPatterns) {
      const match = html.match(pat);
      if (match) {
        const parsed = parseAxisDate(match[1]);
        if (parsed) { result.endOfHardwareSupport = parsed; break; }
      }
    }

    // Extract software/OS support end date
    const swPatterns = [
      /(?:(?:AXIS\s+OS|firmware|software)\s+support\s+(?:ends?|expir(?:es?|y))[:\s]*)([\w\s,]+\d{4})/i,
      /(?:end\s+of\s+(?:AXIS\s+OS|firmware|software)\s+support)[:\s]*([\w\s,]+\d{4})/i,
    ];
    for (const pat of swPatterns) {
      const match = html.match(pat);
      if (match) {
        const parsed = parseAxisDate(match[1]);
        if (parsed) { result.endOfSoftwareSupport = parsed; break; }
      }
    }

    // Extract discontinuation date
    const discPatterns = [
      /(?:discontinu(?:ed|ation)\s+(?:date|on)?)[:\s]*([\w\s,]+\d{4})/i,
      /(?:product\s+discontinued)[:\s]*([\w\s,]+\d{4})/i,
    ];
    for (const pat of discPatterns) {
      const match = html.match(pat);
      if (match) {
        const parsed = parseAxisDate(match[1]);
        if (parsed) { result.discontinuedDate = parsed; break; }
      }
    }

    // Extract replacement product
    const replPatterns = [
      /(?:replacement|replaced\s+by|successor)[:\s]*(?:<[^>]+>)*\s*(?:AXIS\s+)?([\w-]+(?:\s+Mk\s+\w+)?)/i,
      /(?:recommend(?:ed)?)[:\s]*(?:<[^>]+>)*\s*(?:AXIS\s+)?([\w-]+(?:\s+Mk\s+\w+)?)/i,
    ];
    for (const pat of replPatterns) {
      const match = html.match(pat);
      if (match) {
        const repl = match[1].trim();
        if (repl && repl.length > 2 && repl !== "support") {
          result.replacementModel = repl;
          break;
        }
      }
    }

    // Only return if we found at least one useful date
    if (result.endOfHardwareSupport || result.endOfSoftwareSupport || result.discontinuedDate) {
      return result;
    }

    return null;
  } catch {
    return null; // Network error, timeout, etc.
  }
}

/**
 * Look up lifecycle data with live web fetch, falling back to static table.
 * Designed for use after camera model detection.
 * Always returns a LifecycleLookupResult for any valid model
 * (including "Active" for in-production products).
 * Returns null only if modelInput is empty/null.
 */
export async function lookupAxisEolWithFetch(
  modelInput: string | null | undefined
): Promise<LifecycleLookupResult | null> {
  if (!modelInput) return null;

  const normalized = normalizeModel(modelInput);

  // Try live fetch first
  const webResult = await fetchAxisEolFromWeb(modelInput);
  if (webResult) {
    // Merge with static data (static takes precedence for dates we already verified)
    const staticResult = lookupAxisEol(modelInput);
    const merged: AxisProductLifecycle = {
      model: webResult.model,
      discontinuedDate: staticResult?.discontinuedDate || webResult.discontinuedDate,
      endOfHardwareSupport: staticResult?.endOfHardwareSupport || webResult.endOfHardwareSupport,
      endOfSoftwareSupport: staticResult?.endOfSoftwareSupport || webResult.endOfSoftwareSupport,
      replacementModel: staticResult?.replacementModel || webResult.replacementModel,
    };
    return computeStatus(merged);
  }

  // Fall back to static lookup
  const staticResult = lookupAxisEol(modelInput);
  if (staticResult) return staticResult;

  // Not in static table and web didn't find discontinuation info → active product
  return {
    model: normalized,
    status: "active",
    statusLabel: "Active",
  };
}
