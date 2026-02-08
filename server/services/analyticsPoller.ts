/**
 * Analytics Polling Service
 *
 * Polls Axis cameras for analytics data (people counting, occupancy, line crossing)
 * using VAPIX ACAP APIs. Only polls cameras that have analytics capabilities detected.
 *
 * VAPIX Analytics APIs:
 * - People Counter: /local/peoplecounter/query.cgi (ACAP)
 * - Occupancy Estimator: /local/occupancy/.api (ACAP)
 * - Line Crossing: via Object Analytics ACAP
 */

import cron from "node-cron";
import { db } from "../db";
import { cameras, type CameraCapabilities } from "@shared/schema";
import { decryptPassword } from "../encryption";
import { authFetch } from "./digestAuth";
import { storage } from "../storage";

interface PeopleCountData {
  in: number;
  out: number;
  occupancy: number;
}

/**
 * Query Axis People Counter ACAP for current counts.
 * Endpoint: GET /local/peoplecounter/query.cgi
 * Requires digest auth.
 */
async function queryPeopleCounter(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 5000
): Promise<PeopleCountData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Try the standard People Counter ACAP endpoint
    const url = `http://${ipAddress}/local/peoplecounter/query.cgi`;

    const response = await authFetch(url, username, password, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("People Counter ACAP not installed");
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const trimmed = text.trim();

    // Try JSON response first (newer firmware)
    if (trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed);
      return {
        in: parseInt(json.in || json.total_in || "0") || 0,
        out: parseInt(json.out || json.total_out || "0") || 0,
        occupancy: parseInt(json.occupancy || json.current || "0") || 0,
      };
    }

    // Parse key=value format (older firmware)
    const data: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || !t.includes("=")) continue;
      const idx = t.indexOf("=");
      data[t.substring(0, idx).trim().toLowerCase()] = t.substring(idx + 1).trim();
    }

    return {
      in: parseInt(data.in || data.total_in || "0") || 0,
      out: parseInt(data.out || data.total_out || "0") || 0,
      occupancy: parseInt(data.occupancy || data.current || "0") || 0,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`People counter timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Query Axis Occupancy Estimator ACAP.
 * Endpoint: GET /local/occupancy/.api
 * Requires digest auth.
 */
async function queryOccupancy(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 5000
): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `http://${ipAddress}/local/occupancy/.api?method=getOccupancy`;

    const response = await authFetch(url, username, password, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const trimmed = text.trim();

    if (trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed);
      return parseInt(json.occupancy || json.current || json.count || "0") || 0;
    }

    // Key=value fallback
    const match = text.match(/(?:occupancy|current|count)\s*=\s*(\d+)/i);
    return match ? parseInt(match[1]) : 0;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Occupancy query timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Query AXIS Object Analytics (AOA) for live counting/occupancy data.
 * Uses the getAccumulatedCounts or getData method.
 */
async function queryObjectAnalyticsData(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 8000
): Promise<Array<{ eventType: string; value: number; metadata?: Record<string, any> }>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const events: Array<{ eventType: string; value: number; metadata?: Record<string, any> }> = [];

  try {
    // Query AOA for accumulated counts from all scenarios
    const response = await authFetch(
      `http://${ipAddress}/local/objectanalytics/.api`,
      username,
      password,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiVersion: "1.0",
          method: "getAccumulatedCounts",
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return events;

    const json = await response.json();

    // Process accumulated counts from scenarios
    const scenarios = json?.data?.scenarios || json?.data?.devices?.[0]?.channels?.[0]?.scenarios || [];

    for (const scenario of scenarios) {
      const name = scenario.name || "Unnamed";
      const type = (scenario.type || "").toLowerCase();

      // Crossline counting scenarios
      if (type.includes("crossline") || type.includes("line_crossing") || type.includes("crossing")) {
        const passings = scenario.passings || scenario.counts || [];
        for (const passing of passings) {
          if (passing.in !== undefined || passing.enters !== undefined) {
            events.push({
              eventType: "people_in",
              value: parseInt(passing.in || passing.enters || "0") || 0,
              metadata: { scenario: name, source: "objectanalytics" },
            });
          }
          if (passing.out !== undefined || passing.exits !== undefined) {
            events.push({
              eventType: "people_out",
              value: parseInt(passing.out || passing.exits || "0") || 0,
              metadata: { scenario: name, source: "objectanalytics" },
            });
          }
        }

        // Also check for direct in/out counts on the scenario itself
        if (scenario.in !== undefined) {
          events.push({
            eventType: "people_in",
            value: parseInt(scenario.in) || 0,
            metadata: { scenario: name, source: "objectanalytics" },
          });
        }
        if (scenario.out !== undefined) {
          events.push({
            eventType: "people_out",
            value: parseInt(scenario.out) || 0,
            metadata: { scenario: name, source: "objectanalytics" },
          });
        }
      }

      // Occupancy in area scenarios
      if (type.includes("occupancy") || type.includes("object_in_area")) {
        const count = scenario.currentOccupancy || scenario.count || scenario.objects || 0;
        events.push({
          eventType: "occupancy",
          value: parseInt(String(count)) || 0,
          metadata: { scenario: name, source: "objectanalytics" },
        });
      }
    }

    return events;
  } catch {
    return events;
  }
}

/**
 * Query installed ACAP applications via /axis-cgi/applications/list.cgi
 * Returns list of installed application names and their status.
 */
async function queryInstalledApplications(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 8000
): Promise<Array<{ name: string; niceName: string; status: string; id?: string }>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await authFetch(
      `http://${ipAddress}/axis-cgi/applications/list.cgi`,
      username,
      password,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[Analytics] applications/list.cgi on ${ipAddress}: HTTP ${response.status}`);
      return [];
    }

    const text = await response.text();
    const apps: Array<{ name: string; niceName: string; status: string; id?: string }> = [];
    const trimmed = text.trim();

    // Format 1: XML response (most common on modern firmware)
    // <reply result="ok">
    //   <application Name="objectanalytics" NiceName="AXIS Object Analytics" Status="Running" ... />
    // </reply>
    if (trimmed.includes("<application ")) {
      const appRegex = /<application\s+([^>]*?)\/?\s*>/gi;
      let match;
      while ((match = appRegex.exec(text)) !== null) {
        const attrs = match[1];
        const getAttr = (name: string): string => {
          const m = new RegExp(`${name}="([^"]*)"`, "i").exec(attrs);
          return m ? m[1] : "";
        };
        const name = getAttr("Name");
        if (name) {
          apps.push({
            name,
            niceName: getAttr("NiceName") || name,
            status: getAttr("Status") || "Unknown",
            id: getAttr("ApplicationID"),
          });
        }
      }
      if (apps.length > 0) {
        console.log(`[Analytics] Parsed ${apps.length} apps from XML on ${ipAddress}`);
        return apps;
      }
    }

    // Format 2: JSON response (some firmware with ?type=json)
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const json = JSON.parse(trimmed);
        const appList = json.data?.applications || json.applications || (Array.isArray(json) ? json : []);
        for (const app of appList) {
          apps.push({
            name: app.name || app.Name || "",
            niceName: app.niceName || app.NiceName || app.name || app.Name || "",
            status: app.status || app.Status || "Unknown",
            id: app.applicationID || app.ApplicationID || app.id,
          });
        }
        if (apps.length > 0) return apps;
      } catch {
        // Not valid JSON, continue to text parsing
      }
    }

    // Format 3: Key=value format (ApplicationN.Key=Value)
    const appMap = new Map<string, Record<string, string>>();
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || !t.includes("=")) continue;
      const eqIdx = t.indexOf("=");
      const fullKey = t.substring(0, eqIdx).trim();
      const value = t.substring(eqIdx + 1).trim();

      const prefixMatch = fullKey.match(/^Application(\d+)\.(.+)$/i);
      if (prefixMatch) {
        const appNum = prefixMatch[1];
        const key = prefixMatch[2].toLowerCase();
        if (!appMap.has(appNum)) appMap.set(appNum, {});
        appMap.get(appNum)![key] = value;
      }
    }

    for (const entry of Array.from(appMap.values())) {
      if (entry.name) {
        apps.push({
          name: entry.name,
          niceName: entry.nicename || entry.name,
          status: entry.status || "Unknown",
          id: entry.applicationid,
        });
      }
    }

    if (apps.length === 0 && trimmed.length > 0) {
      console.log(`[Analytics] applications/list.cgi unparsed response (first 500 chars): ${trimmed.substring(0, 500)}`);
    }

    return apps;
  } catch (err: any) {
    console.log(`[Analytics] applications/list.cgi error on ${ipAddress}: ${err.message}`);
    return [];
  }
}

/**
 * Probe AXIS Object Analytics (AOA) for configured scenarios.
 * AOA is the primary analytics framework on modern Axis cameras.
 */
async function queryObjectAnalyticsScenarios(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 8000
): Promise<Array<{ name: string; type: string }>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // AOA uses JSON API
    const response = await authFetch(
      `http://${ipAddress}/local/objectanalytics/.api`,
      username,
      password,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiVersion: "1.0", method: "getConfiguration", context: "probe" }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[Analytics] AOA getConfiguration on ${ipAddress}: HTTP ${response.status}`);
      return [];
    }

    const text = await response.text();
    console.log(`[Analytics] AOA getConfiguration on ${ipAddress}: raw response (first 500 chars): ${text.substring(0, 500)}`);

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      console.log(`[Analytics] AOA getConfiguration on ${ipAddress}: non-JSON response`);
      return [];
    }

    // Check for API errors
    if (json.error) {
      console.log(`[Analytics] AOA getConfiguration on ${ipAddress}: API error: ${JSON.stringify(json.error)}`);
      return [];
    }

    // Extract scenarios from the configuration
    const scenarios: Array<{ name: string; type: string }> = [];

    // Try multiple known AOA response structures:
    // Structure 1: data.devices[].channels[].scenarios[]
    const devices = json?.data?.devices || json?.data?.configuration?.devices || [];
    for (const device of devices) {
      const channels = device.channels || [];
      for (const channel of channels) {
        const channelScenarios = channel.scenarios || [];
        for (const scenario of channelScenarios) {
          scenarios.push({
            name: scenario.name || scenario.niceName || "Unnamed",
            type: scenario.type || scenario.objectType || "unknown",
          });
        }
      }
    }

    // Structure 2: data.scenarios[] (simpler)
    if (scenarios.length === 0) {
      const simpleScenarios = json?.data?.scenarios || json?.data?.configuration?.scenarios || [];
      for (const scenario of simpleScenarios) {
        scenarios.push({
          name: scenario.name || scenario.niceName || "Unnamed",
          type: scenario.type || "unknown",
        });
      }
    }

    // Structure 3: data.cameras[].scenarios[] (some firmware)
    if (scenarios.length === 0) {
      const cams = json?.data?.cameras || [];
      for (const cam of cams) {
        for (const scenario of (cam.scenarios || [])) {
          scenarios.push({
            name: scenario.name || "Unnamed",
            type: scenario.type || "unknown",
          });
        }
      }
    }

    if (scenarios.length === 0) {
      console.log(`[Analytics] AOA getConfiguration on ${ipAddress}: no scenarios in response. Top-level keys: ${JSON.stringify(Object.keys(json || {}))}. Data keys: ${JSON.stringify(Object.keys(json?.data || {}))}`);
    }

    return scenarios;
  } catch (err: any) {
    console.log(`[Analytics] AOA getConfiguration error on ${ipAddress}: ${err.message}`);
    return [];
  }
}

/**
 * Probe a specific ACAP endpoint to check if it exists.
 * Returns true if the endpoint responds (200 or 405).
 */
async function probeEndpoint(
  ipAddress: string,
  username: string,
  password: string,
  path: string,
  timeout: number = 5000
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Use GET instead of HEAD - many Axis ACAP endpoints don't support HEAD
    const response = await authFetch(
      `http://${ipAddress}${path}`,
      username,
      password,
      { method: "GET", signal: controller.signal }
    );
    clearTimeout(timeoutId);
    const found = response.ok || response.status === 405;
    if (found) {
      console.log(`[Analytics] Endpoint probe ${path} on ${ipAddress}: found (HTTP ${response.status})`);
    }
    // 404 = not installed, 401 still means it exists (auth issue), 503 = exists but not ready
    if (response.status === 401 || response.status === 503) {
      console.log(`[Analytics] Endpoint probe ${path} on ${ipAddress}: exists but HTTP ${response.status}`);
      return true;
    }
    return found;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.log(`[Analytics] Endpoint probe ${path} on ${ipAddress}: error - ${err.message}`);
    return false;
  }
}

/**
 * Comprehensive analytics capability probe.
 * Queries the applications list, probes known ACAP endpoints,
 * and checks Object Analytics scenarios.
 */
export interface AnalyticsProbeResult {
  peopleCount: boolean;
  occupancyEstimation: boolean;
  lineCrossing: boolean;
  objectAnalytics: boolean;
  loiteringGuard: boolean;
  fenceGuard: boolean;
  motionGuard: boolean;
  acapInstalled: string[];
  objectAnalyticsScenarios: Array<{ name: string; type: string }>;
}

export async function probeAnalyticsCapabilities(
  ipAddress: string,
  username: string,
  password: string
): Promise<AnalyticsProbeResult> {
  const results: AnalyticsProbeResult = {
    peopleCount: false,
    occupancyEstimation: false,
    lineCrossing: false,
    objectAnalytics: false,
    loiteringGuard: false,
    fenceGuard: false,
    motionGuard: false,
    acapInstalled: [],
    objectAnalyticsScenarios: [],
  };

  console.log(`[Analytics] Starting probe for ${ipAddress}...`);

  // Step 1: Query installed applications list
  const apps = await queryInstalledApplications(ipAddress, username, password);

  if (apps.length > 0) {
    console.log(`[Analytics] All ACAPs on ${ipAddress}: ${apps.map((a) => `${a.niceName}(${a.status})`).join(", ")}`);

    results.acapInstalled = apps
      .filter((a) => {
        const s = a.status.toLowerCase();
        return s === "running" || s === "idle" || s === "stopped";
      })
      .map((a) => a.niceName);

    // Map known ACAP names to capability flags
    const allNames = apps.flatMap((a) => [a.name.toLowerCase(), a.niceName.toLowerCase()]);

    const hasApp = (keywords: string[]): boolean =>
      allNames.some((name) => keywords.some((kw) => name.includes(kw)));

    if (hasApp(["peoplecounter", "people counter", "people_counter"])) results.peopleCount = true;
    if (hasApp(["occupancy", "occupancy estimator"])) results.occupancyEstimation = true;
    if (hasApp(["crossline", "cross line", "linecrossing"])) results.lineCrossing = true;
    if (hasApp(["objectanalytics", "object analytics", "object_analytics", "aoa"])) results.objectAnalytics = true;
    if (hasApp(["loitering", "loiteringguard", "loitering_guard"])) results.loiteringGuard = true;
    if (hasApp(["fenceguard", "fence guard", "fence_guard"])) results.fenceGuard = true;
    if (hasApp(["motionguard", "motion guard", "motion_guard", "vmd"])) results.motionGuard = true;
  }

  console.log(`[Analytics] Installed ACAPs on ${ipAddress}: ${results.acapInstalled.join(", ") || "none found (app list empty or unavailable)"}`);

  // Step 2: Always try AOA directly via POST - this is the most common analytics platform
  // and the most reliable way to detect it (app list can fail on some firmware)
  console.log(`[Analytics] Probing AOA on ${ipAddress}...`);
  const scenarios = await queryObjectAnalyticsScenarios(ipAddress, username, password);
  if (scenarios.length > 0) {
    results.objectAnalytics = true;
    results.objectAnalyticsScenarios = scenarios;
    console.log(`[Analytics] AOA scenarios on ${ipAddress}: ${scenarios.map((s) => `${s.name}(${s.type})`).join(", ")}`);

    // Infer capabilities from scenario types
    for (const scenario of scenarios) {
      const type = scenario.type.toLowerCase();
      if (type.includes("crossline") || type.includes("line_crossing") || type.includes("crossing")) results.lineCrossing = true;
      if (type.includes("occupancy") || type.includes("object_in_area")) results.occupancyEstimation = true;
      if (type.includes("people") || type.includes("counting")) results.peopleCount = true;
    }
  } else {
    console.log(`[Analytics] AOA on ${ipAddress}: no scenarios found or not available`);
  }

  // Step 3: Probe remaining ACAP endpoints in parallel for anything not yet detected
  console.log(`[Analytics] Probing ACAP endpoints on ${ipAddress}...`);
  const [pcAvail, occAvail, oaAvail, lgAvail, fgAvail, mgAvail] = await Promise.all([
    !results.peopleCount ? probeEndpoint(ipAddress, username, password, "/local/peoplecounter/query.cgi") : Promise.resolve(true),
    !results.occupancyEstimation ? probeEndpoint(ipAddress, username, password, "/local/occupancy/.api?method=getOccupancy") : Promise.resolve(true),
    !results.objectAnalytics ? probeEndpoint(ipAddress, username, password, "/local/objectanalytics/.api") : Promise.resolve(true),
    !results.loiteringGuard ? probeEndpoint(ipAddress, username, password, "/local/loiteringguard/.api") : Promise.resolve(true),
    !results.fenceGuard ? probeEndpoint(ipAddress, username, password, "/local/fenceguard/.api") : Promise.resolve(true),
    !results.motionGuard ? probeEndpoint(ipAddress, username, password, "/local/motionguard/.api") : Promise.resolve(true),
  ]);

  if (pcAvail) results.peopleCount = true;
  if (occAvail) results.occupancyEstimation = true;
  if (oaAvail) results.objectAnalytics = true;
  if (lgAvail) results.loiteringGuard = true;
  if (fgAvail) results.fenceGuard = true;
  if (mgAvail) results.motionGuard = true;

  // If AOA was found by endpoint probe but we haven't queried scenarios yet, do it now
  if (results.objectAnalytics && results.objectAnalyticsScenarios.length === 0) {
    const lateScenarios = await queryObjectAnalyticsScenarios(ipAddress, username, password);
    if (lateScenarios.length > 0) {
      results.objectAnalyticsScenarios = lateScenarios;
      console.log(`[Analytics] AOA scenarios (late probe) on ${ipAddress}: ${lateScenarios.map((s) => `${s.name}(${s.type})`).join(", ")}`);
      for (const scenario of lateScenarios) {
        const type = scenario.type.toLowerCase();
        if (type.includes("crossline") || type.includes("line_crossing") || type.includes("crossing")) results.lineCrossing = true;
        if (type.includes("occupancy") || type.includes("object_in_area")) results.occupancyEstimation = true;
        if (type.includes("people") || type.includes("counting")) results.peopleCount = true;
      }
    }
  }

  const detected = [
    results.peopleCount && "PeopleCount",
    results.occupancyEstimation && "Occupancy",
    results.lineCrossing && "LineCrossing",
    results.objectAnalytics && "ObjectAnalytics",
    results.loiteringGuard && "LoiteringGuard",
    results.fenceGuard && "FenceGuard",
    results.motionGuard && "MotionGuard",
  ].filter(Boolean);

  console.log(`[Analytics] Probe complete for ${ipAddress}: ${detected.join(", ") || "no analytics detected"}`);

  return results;
}

/**
 * Poll a single camera for analytics data
 */
async function pollCameraAnalytics(camera: any): Promise<void> {
  const password = await decryptPassword(camera.encryptedPassword);
  const caps = camera.capabilities as CameraCapabilities | null;
  const enabled = caps?.enabledAnalytics;
  const events: Array<{ eventType: string; value: number; metadata?: Record<string, any> }> = [];

  // Check if analytic is both available AND enabled (undefined enabledAnalytics = legacy, allow)
  const pcEnabled = caps?.analytics?.peopleCount && enabled?.peopleCount !== false;
  const occEnabled = caps?.analytics?.occupancyEstimation && enabled?.occupancyEstimation !== false;
  const oaEnabled = caps?.analytics?.objectAnalytics && enabled?.objectAnalytics !== false;

  // Try People Counter ACAP first
  if (pcEnabled) {
    try {
      const data = await queryPeopleCounter(camera.ipAddress, camera.username, password);
      events.push(
        { eventType: "people_in", value: data.in },
        { eventType: "people_out", value: data.out },
        { eventType: "occupancy", value: data.occupancy }
      );
    } catch (err: any) {
      // People counter failed, try standalone occupancy
      if (occEnabled) {
        try {
          const occ = await queryOccupancy(camera.ipAddress, camera.username, password);
          events.push({ eventType: "occupancy", value: occ });
        } catch {
          // Occupancy also failed
        }
      }
    }
  } else if (occEnabled) {
    // Only occupancy estimator available and enabled
    try {
      const occ = await queryOccupancy(camera.ipAddress, camera.username, password);
      events.push({ eventType: "occupancy", value: occ });
    } catch {
      // Occupancy failed
    }
  }

  // Try Object Analytics (AOA) if enabled - this can provide crossline counting,
  // occupancy-in-area, and other scenario-based data
  if (oaEnabled && events.length === 0) {
    // Only query AOA if we didn't already get data from People Counter/Occupancy
    try {
      const aoaEvents = await queryObjectAnalyticsData(camera.ipAddress, camera.username, password);
      events.push(...aoaEvents);
    } catch {
      // AOA query failed
    }
  } else if (oaEnabled) {
    // Even if we got people counter data, still try AOA for additional scenario data
    // but don't duplicate people_in/people_out/occupancy
    try {
      const aoaEvents = await queryObjectAnalyticsData(camera.ipAddress, camera.username, password);
      const existingTypes = new Set(events.map((e) => e.eventType));
      for (const evt of aoaEvents) {
        if (!existingTypes.has(evt.eventType)) {
          events.push(evt);
        }
      }
    } catch {
      // AOA query failed
    }
  }

  // Store events if any collected
  if (events.length > 0) {
    const now = new Date();
    await storage.createAnalyticsEventBatch(
      events.map((e) => ({
        cameraId: camera.id,
        timestamp: now,
        eventType: e.eventType,
        value: e.value,
        metadata: e.metadata || null,
      }))
    );
  }
}

/**
 * Poll all cameras with analytics capabilities
 */
async function pollAllCameraAnalytics(): Promise<void> {
  try {
    const allCameras = await db.select().from(cameras);

    // Filter to cameras with analytics available AND enabled
    const analyticsCameras = allCameras.filter((c) => {
      const caps = c.capabilities as CameraCapabilities | null;
      const enabled = caps?.enabledAnalytics;
      // Require both detected and not explicitly disabled (undefined = legacy allow)
      return (
        (caps?.analytics?.peopleCount === true && enabled?.peopleCount !== false) ||
        (caps?.analytics?.occupancyEstimation === true && enabled?.occupancyEstimation !== false) ||
        (caps?.analytics?.objectAnalytics === true && enabled?.objectAnalytics !== false)
      );
    });

    if (analyticsCameras.length === 0) {
      return; // No analytics cameras, skip silently
    }

    console.log(`[Analytics] Polling ${analyticsCameras.length} cameras with analytics`);

    const results = await Promise.allSettled(
      analyticsCameras.map((camera) => pollCameraAnalytics(camera))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    if (failed > 0) {
      console.log(`[Analytics] Cycle complete: ${succeeded} ok, ${failed} failed`);
    }
  } catch (error) {
    console.error("[Analytics] Error during polling cycle:", error);
  }
}

/**
 * Start the analytics polling service.
 * Polls every 1 minute (configurable via ANALYTICS_POLL_INTERVAL env var).
 */
let analyticsPollingStarted = false;

export function startAnalyticsPolling() {
  if (analyticsPollingStarted) {
    console.log("[Analytics] Polling service already running, skipping duplicate start");
    return;
  }
  analyticsPollingStarted = true;

  const intervalMinutes = parseInt(process.env.ANALYTICS_POLL_INTERVAL || "1", 10);
  console.log(`[Analytics] Initializing analytics polling service (every ${intervalMinutes} min)...`);

  // Initial poll after startup delay
  setTimeout(() => {
    pollAllCameraAnalytics();
  }, 15000); // 15s after startup (after camera monitor's 5s delay)

  // Schedule regular polling
  cron.schedule(`*/${intervalMinutes} * * * *`, () => {
    pollAllCameraAnalytics();
  });
}

// Export for manual triggering
export { pollAllCameraAnalytics };
