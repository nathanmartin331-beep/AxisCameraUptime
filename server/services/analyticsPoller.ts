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
import pLimit from "p-limit";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { cameras, type CameraCapabilities } from "@shared/schema";
import { decryptPassword } from "../encryption";
import { authFetch } from "./digestAuth";
import { buildCameraUrl, getCameraDispatcher, getConnectionInfo, type CameraConnectionInfo } from "./cameraUrl";
import { storage } from "../storage";

// Configurable concurrency for analytics HTTP polling (default 25 parallel requests)
const ANALYTICS_CONCURRENCY = parseInt(process.env.POLL_CONCURRENCY || "25", 10);
const analyticsLimit = pLimit(ANALYTICS_CONCURRENCY);

// Track which cameras have already had their Event2 topics logged (avoid per-poll log spam)
const event2LoggedCameras = new Set<string>();

// Track cameras where SOAP response has been debug-logged (one-time per session)
const soapDebuggedCameras = new Set<string>();

// Track cameras where getAccumulatedCounts failed — suppress repeated error logs.
// Cleared on re-probe or after 1 hour.
const aoaCountsFailedCache = new Map<string, number>(); // ip → timestamp of first failure
const AOA_FAILURE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
  timeout: number = 5000,
  conn?: CameraConnectionInfo
): Promise<PeopleCountData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const dispatcher = getCameraDispatcher(conn);

  try {
    // Try the standard People Counter ACAP endpoint
    const url = buildCameraUrl(ipAddress, "/local/peoplecounter/query.cgi", conn);

    const response = await authFetch(url, username, password, {
      signal: controller.signal,
      dispatcher,
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
  timeout: number = 5000,
  conn?: CameraConnectionInfo
): Promise<number> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const dispatcher = getCameraDispatcher(conn);

  try {
    const url = buildCameraUrl(ipAddress, "/local/occupancy/.api?method=getOccupancy", conn);

    const response = await authFetch(url, username, password, {
      signal: controller.signal,
      dispatcher,
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
 * Parse AOA accumulated counts response into analytics events.
 */
function parseAoaAccumulatedCounts(
  json: any,
  scenarioHint?: { name: string; type: string }
): Array<{ eventType: string; value: number; metadata?: Record<string, any> }> {
  const events: Array<{ eventType: string; value: number; metadata?: Record<string, any> }> = [];

  // Process accumulated counts from scenarios
  let scenarios = json?.data?.scenarios || json?.data?.devices?.[0]?.channels?.[0]?.scenarios || [];

  // Single-scenario response: data contains counts directly (AXIS getAccumulatedCounts format)
  // Response: { data: { resetTime: "...", timeStamp: "...", total: N, human: N, car: M } }
  if (scenarios.length === 0 && json?.data) {
    const d = json.data;
    if (d.total !== undefined || d.human !== undefined || d.resetTime !== undefined ||
        d.passings || d.in !== undefined || d.out !== undefined ||
        d.currentOccupancy !== undefined || d.count !== undefined) {
      if (!d.type && scenarioHint?.type) d.type = scenarioHint.type;
      if (!d.name && scenarioHint?.name) d.name = scenarioHint.name;
      scenarios = [d];
    }
  }

  for (const scenario of scenarios) {
    const name = scenario.name || "Unnamed";
    const type = (scenario.type || "").toLowerCase();

    // Crossline counting scenarios (includes "fence" which is AOA's line-crossing type)
    if (type.includes("crossline") || type.includes("line_crossing") || type.includes("crossing") ||
        type.includes("fence") || type.includes("tripwire")) {
      let scenarioIn = 0;
      let scenarioOut = 0;

      // Format A: passings array (some firmware versions)
      const passings = scenario.passings || scenario.counts || [];
      for (const passing of passings) {
        if (passing.in !== undefined || passing.enters !== undefined) {
          scenarioIn += parseInt(passing.in || passing.enters || "0") || 0;
        }
        if (passing.out !== undefined || passing.exits !== undefined) {
          scenarioOut += parseInt(passing.out || passing.exits || "0") || 0;
        }
      }

      // Format B: direct in/out on the scenario object
      if (scenario.in !== undefined) scenarioIn += parseInt(scenario.in) || 0;
      if (scenario.out !== undefined) scenarioOut += parseInt(scenario.out) || 0;

      // Format C: AXIS getAccumulatedCounts flat response
      // { total: N, totalHuman: N, totalCar: M, totalBus: B, totalTruck: T, totalBike: K, totalOtherVehicle: O }
      // Use scenario name for direction (entering vs exiting)
      const vehicleBreakdown: Record<string, number> = {};
      if (scenarioIn === 0 && scenarioOut === 0 && scenario.total !== undefined) {
        const total = parseInt(scenario.total) || 0;
        const humanCount = parseInt(scenario.totalHuman || scenario.human || "0") || 0;
        const carCount = parseInt(scenario.totalCar || "0") || 0;
        const busCount = parseInt(scenario.totalBus || "0") || 0;
        const truckCount = parseInt(scenario.totalTruck || "0") || 0;
        const bikeCount = parseInt(scenario.totalBike || "0") || 0;
        const otherVehicleCount = parseInt(scenario.totalOtherVehicle || "0") || 0;

        // Store vehicle breakdown
        if (humanCount > 0) vehicleBreakdown.human = humanCount;
        if (carCount > 0) vehicleBreakdown.car = carCount;
        if (busCount > 0) vehicleBreakdown.bus = busCount;
        if (truckCount > 0) vehicleBreakdown.truck = truckCount;
        if (bikeCount > 0) vehicleBreakdown.bike = bikeCount;
        if (otherVehicleCount > 0) vehicleBreakdown.otherVehicle = otherVehicleCount;

        const count = total;
        const nameLower = name.toLowerCase();
        if (nameLower.includes("enter") || nameLower.includes("in")) {
          scenarioIn = count;
        } else if (nameLower.includes("exit") || nameLower.includes("out") || nameLower.includes("leav")) {
          scenarioOut = count;
        } else {
          // Direction unknown — emit as generic line_crossing
          scenarioIn = count;
        }
      }

      const categoryMeta = Object.keys(vehicleBreakdown).length > 0
        ? { ...vehicleBreakdown }
        : {};

      if (scenarioIn > 0) {
        events.push({
          eventType: "people_in",
          value: scenarioIn,
          metadata: { scenario: name, source: "objectanalytics", ...categoryMeta },
        });
      }
      if (scenarioOut > 0) {
        events.push({
          eventType: "people_out",
          value: scenarioOut,
          metadata: { scenario: name, source: "objectanalytics", ...categoryMeta },
        });
      }
      const totalCrossings = scenarioIn + scenarioOut;
      if (totalCrossings > 0) {
        events.push({
          eventType: "line_crossing",
          value: totalCrossings,
          metadata: { scenario: name, source: "objectanalytics", in: scenarioIn, out: scenarioOut, ...categoryMeta },
        });
      }
    }

    // Occupancy in area scenarios
    if (type.includes("occupancy") || type.includes("object_in_area") || type.includes("occupancyinarea")) {
      const count = scenario.currentOccupancy || scenario.count || scenario.objects || 0;
      events.push({
        eventType: "occupancy",
        value: parseInt(String(count)) || 0,
        metadata: { scenario: name, source: "objectanalytics" },
      });
    }
  }

  return events;
}

/**
 * Query AXIS Object Analytics (AOA) for live counting/occupancy data.
 * Tries the stored API path first, then falls back to standard paths.
 *
 * @param storedApiPath - Previously discovered working API path from capabilities
 */
async function queryObjectAnalyticsData(
  ipAddress: string,
  username: string,
  password: string,
  storedApiPath?: string,
  timeout: number = 8000,
  conn?: CameraConnectionInfo,
  scenarios?: Array<{ name: string; type: string; id?: number; objectClassifications?: string[] }>
): Promise<Array<{ eventType: string; value: number; metadata?: Record<string, any> }>> {
  if (!storedApiPath) return [];

  // Modern AXIS OS: use Event2 API to get analytics data from event instances
  if (storedApiPath === "event2") {
    return (await queryEvent2Analytics(ipAddress, username, password, timeout, conn)).events;
  }

  // SOAP event service fallback (for cameras without Event2)
  if (storedApiPath === "soap-events") {
    return (await querySoapEventInstances(ipAddress, username, password, timeout, conn)).events;
  }

  // analytics-metadata-config.cgi path - try getAccumulatedCounts via the ACAP API
  // But also fall back to Event2 since metadata-config is for configuration, not data
  if (storedApiPath === "/axis-cgi/analytics-metadata-config.cgi") {
    const event2Result = (await queryEvent2Analytics(ipAddress, username, password, timeout, conn)).events;
    if (event2Result.length > 0) return event2Result;
    return (await querySoapEventInstances(ipAddress, username, password, timeout, conn)).events;
  }

  // ACAP local path (control.cgi or legacy .api) - use getAccumulatedCounts
  const allEvents: Array<{ eventType: string; value: number; metadata?: Record<string, any> }> = [];

  // Check failure cache — if this camera's getAccumulatedCounts has been failing,
  // skip directly to Event2/SOAP fallback to avoid log spam.
  const failedAt = aoaCountsFailedCache.get(ipAddress);
  const skipAcap = failedAt && (Date.now() - failedAt) < AOA_FAILURE_CACHE_TTL;

  if (!skipAcap) {
    // Strategy 1: Per-scenario calls using actual scenario IDs
    // AXIS docs: params key is "scenario" (NOT "scenarioID"), value is the UID integer
    if (scenarios && scenarios.length > 0) {
      const scenariosWithIds = scenarios.filter(s => s.id !== undefined && s.id !== null);
      for (const s of scenariosWithIds) {
        const json = await tryAoaPost(
          ipAddress, username, password, storedApiPath,
          "getAccumulatedCounts", timeout, conn,
          { scenario: s.id }
        );
        if (json) {
          aoaCountsFailedCache.delete(ipAddress);
          // Log first successful response to verify data format
          if (allEvents.length === 0) {
            console.log(`[Analytics] AOA getAccumulatedCounts on ${ipAddress} scenario "${s.name}": ${JSON.stringify(json.data || {}).substring(0, 300)}`);
          }
          const parsed = parseAoaAccumulatedCounts(json, { name: s.name, type: s.type });
          allEvents.push(...parsed);
        }
      }
    }

    // Strategy 2: No params (some firmware returns all scenarios)
    if (allEvents.length === 0) {
      const jsonNoParams = await tryAoaPost(
        ipAddress, username, password, storedApiPath,
        "getAccumulatedCounts", timeout, conn,
        null
      );
      if (jsonNoParams) {
        aoaCountsFailedCache.delete(ipAddress);
        const parsed = parseAoaAccumulatedCounts(jsonNoParams);
        allEvents.push(...parsed);
      } else if (!failedAt) {
        aoaCountsFailedCache.set(ipAddress, Date.now());
        console.log(`[Analytics] AOA getAccumulatedCounts failed on ${ipAddress}, suppressing retries for 1h`);
      }
    }
  }

  // If ACAP path yielded no events, try Event2 as fallback
  if (allEvents.length === 0) {
    const { events: event2Events } = await queryEvent2Analytics(ipAddress, username, password, timeout, conn);
    if (event2Events.length > 0) return event2Events;
    // Last resort: SOAP events
    const { events: soapEvents } = await querySoapEventInstances(ipAddress, username, password, timeout, conn);
    if (soapEvents.length > 0) return soapEvents;
  }

  return allEvents;
}

/**
 * Query installed ACAP applications via /axis-cgi/applications/list.cgi
 * Returns list of installed application names and their status.
 */
async function queryInstalledApplications(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 8000,
  conn?: CameraConnectionInfo
): Promise<Array<{ name: string; niceName: string; status: string; id?: string }>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const dispatcher = getCameraDispatcher(conn);

  try {
    const response = await authFetch(
      buildCameraUrl(ipAddress, "/axis-cgi/applications/list.cgi", conn),
      username,
      password,
      { signal: controller.signal, dispatcher }
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
 * Extract object classification metadata from an AOA scenario.
 * Handles both "objectClassifications" (newer) and "filters" (older) keys.
 */
function extractObjectClasses(scenario: any): string[] {
  const classes: string[] = [];

  // Newer firmware: objectClassifications array
  const classifications = scenario.objectClassifications || scenario.objectclassifications || [];
  for (const c of classifications) {
    const t = c.type || c.name || c;
    if (typeof t === "string" && t) classes.push(t);
  }

  // Older firmware: filters array with objectClassification
  if (classes.length === 0) {
    const filters = scenario.filters || scenario.filter || [];
    const filterArr = Array.isArray(filters) ? filters : [filters];
    for (const f of filterArr) {
      const oc = f.objectClassification || f.type || f.objectType;
      if (typeof oc === "string" && oc) classes.push(oc);
      // Nested array inside filter
      const inner = f.objectClassifications || [];
      for (const c of inner) {
        const t = c.type || c.name || c;
        if (typeof t === "string" && t) classes.push(t);
      }
    }
  }

  return Array.from(new Set(classes)); // deduplicate
}

/**
 * Extract AOA scenarios from a JSON response (multiple response structures supported).
 * Captures scenario id, name, type, and object classification metadata.
 */
function extractAoaScenarios(json: any): Array<{ name: string; type: string; id?: number; objectClassifications?: string[] }> {
  const scenarios: Array<{ name: string; type: string; id?: number; objectClassifications?: string[] }> = [];

  const pushScenario = (scenario: any) => {
    const entry: { name: string; type: string; id?: number; objectClassifications?: string[] } = {
      name: scenario.name || scenario.niceName || "Unnamed",
      type: scenario.type || scenario.objectType || "unknown",
    };
    // Check multiple field names for scenario ID (firmware-dependent)
    const rawId = scenario.id ?? scenario.scenarioID ?? scenario.scenarioId ?? scenario.scenario_id;
    if (rawId !== undefined && rawId !== null) entry.id = Number(rawId);
    const classes = extractObjectClasses(scenario);
    if (classes.length > 0) entry.objectClassifications = classes;
    scenarios.push(entry);
  };

  // Structure 1: data.devices[].channels[].scenarios[]
  const devices = json?.data?.devices || json?.data?.configuration?.devices || [];
  for (const device of devices) {
    const channels = device.channels || [];
    for (const channel of channels) {
      const channelScenarios = channel.scenarios || [];
      for (const scenario of channelScenarios) {
        pushScenario(scenario);
      }
    }
  }

  // Structure 2: data.scenarios[] (simpler)
  if (scenarios.length === 0) {
    const simpleScenarios = json?.data?.scenarios || json?.data?.configuration?.scenarios || [];
    for (const scenario of simpleScenarios) {
      pushScenario(scenario);
    }
  }

  // Structure 3: data.cameras[].scenarios[] (some firmware)
  if (scenarios.length === 0) {
    const cams = json?.data?.cameras || [];
    for (const cam of cams) {
      for (const scenario of (cam.scenarios || [])) {
        pushScenario(scenario);
      }
    }
  }

  return scenarios;
}

/**
 * Try a POST JSON-RPC call to an AOA API path.
 * Returns the parsed JSON response if successful, null otherwise.
 *
 * Tries apiVersion 1.0 first, then 1.3 for newer firmware.
 * Logs are compact: one line per path summarizing the outcome.
 */
async function tryAoaPost(
  ipAddress: string,
  username: string,
  password: string,
  path: string,
  method: string,
  timeout: number = 8000,
  conn?: CameraConnectionInfo,
  extraParams: Record<string, any> | null = {}
): Promise<any | null> {
  const apiVersions = method === "getAccumulatedCounts" ? ["1.0", "1.2", "1.3"] : ["1.0", "1.2", "1.3"];
  let lastStatus = 0;
  let lastApiError: any = null;

  for (const apiVersion of apiVersions) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const dispatcher = getCameraDispatcher(conn);

    try {
      const url = buildCameraUrl(ipAddress, path, conn);
      // When extraParams is null, omit the params key entirely from the JSON body
      const bodyObj: any = { apiVersion, method };
      if (extraParams !== null) bodyObj.params = extraParams;
      const response = await authFetch(
        url,
        username,
        password,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
          signal: controller.signal,
          dispatcher,
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        lastStatus = response.status;
        continue;
      }

      const text = await response.text();
      if (!text.trim()) continue;

      try {
        const json = JSON.parse(text);
        if (json.error) {
          lastApiError = json.error;
          continue;
        }
        return json;
      } catch {
        continue;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.log(`[Analytics] AOA ${path} ${method} on ${ipAddress}: timeout`);
      } else {
        console.log(`[Analytics] AOA ${path} on ${ipAddress}: ${err.message}`);
      }
      return null; // Network error - don't try more versions
    }
  }

  // Log failures once (not per version) — compact summary
  if (lastApiError) {
    console.log(`[Analytics] AOA ${path} ${method} on ${ipAddress}: API error: ${JSON.stringify(lastApiError)}`);
  } else if (lastStatus > 0 && lastStatus !== 404) {
    console.log(`[Analytics] AOA ${path} ${method} on ${ipAddress}: HTTP ${lastStatus}`);
  }

  return null;
}

/**
 * Generic helper: POST a JSON-RPC request to a VAPIX CGI endpoint.
 * Returns parsed JSON on success, null on failure.
 */
async function vapixJsonRpc(
  ipAddress: string,
  username: string,
  password: string,
  path: string,
  method: string,
  apiVersion: string = "1.0",
  timeout: number = 8000,
  conn?: CameraConnectionInfo
): Promise<any | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const dispatcher = getCameraDispatcher(conn);

  try {
    const url = buildCameraUrl(ipAddress, path, conn);
    const response = await authFetch(url, username, password, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiVersion, method, params: {} }),
      signal: controller.signal,
      dispatcher,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      // Log non-200/non-404 responses for debugging (404 = expected for missing APIs)
      if (response.status !== 404) {
        console.log(`[Analytics] VAPIX ${path} ${method} on ${ipAddress}: HTTP ${response.status}`);
      }
      return null;
    }

    const text = await response.text();
    if (!text.trim()) return null;

    try {
      const json = JSON.parse(text);
      if (json.error) {
        console.log(`[Analytics] ${path} ${method} on ${ipAddress}: API error ${JSON.stringify(json.error)}`);
        return null;
      }
      return json;
    } catch {
      // Response is not JSON - log first 200 chars for debugging
      console.log(`[Analytics] ${path} ${method} on ${ipAddress}: non-JSON response: ${text.substring(0, 200)}`);
      return null;
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      console.log(`[Analytics] VAPIX ${path} ${method} on ${ipAddress}: timeout`);
    }
    return null;
  }
}

/**
 * Query VAPIX analytics-metadata-config.cgi for AOA scene configuration.
 * This is the modern AXIS OS (11.x+) way to get analytics scenarios.
 * The ACAP doesn't serve /local/ endpoints; configuration is via this CGI.
 */
async function queryAnalyticsMetadataConfig(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 8000,
  conn?: CameraConnectionInfo
): Promise<{ scenarios: Array<{ name: string; type: string; id?: number; objectClassifications?: string[] }>; apiPath: string } | null> {
  // Try multiple path formats - the API ID is "analytics-metadata-config" but
  // the CGI path may use hyphens or underscores depending on firmware
  const paths = [
    "/axis-cgi/analytics-metadata-config.cgi",
    "/axis-cgi/analytics_metadata_config.cgi",
  ];

  for (const path of paths) {
    // Try getConfiguration directly - don't gate on getSupportedVersions
    // because some firmware supports getConfiguration but not getSupportedVersions
    const configJson = await vapixJsonRpc(ipAddress, username, password, path, "getConfiguration", "1.0", timeout, conn);
    if (configJson) {
      const scenarios = extractAoaScenarios(configJson);
      if (scenarios.length > 0) {
        console.log(`[Analytics] ${path} on ${ipAddress}: found ${scenarios.length} scenarios`);
        return { scenarios, apiPath: path };
      }
      // API responded but no scenarios extracted - log the response structure
      console.log(`[Analytics] ${path} on ${ipAddress}: getConfiguration OK but no scenarios. Data keys: ${JSON.stringify(Object.keys(configJson?.data || {}))}`);
      // Still return success - the API works even if no scenarios configured
      return { scenarios: [], apiPath: path };
    }

    // Try getSupportedVersions as a lighter existence check
    const versionJson = await vapixJsonRpc(ipAddress, username, password, path, "getSupportedVersions", "1.0", timeout, conn);
    if (versionJson) {
      console.log(`[Analytics] ${path} on ${ipAddress}: API exists (versions: ${JSON.stringify(versionJson?.data?.apiVersions || [])}), but getConfiguration failed`);
      return { scenarios: [], apiPath: path };
    }
  }

  return null;
}

/**
 * Query VAPIX Event2 API for current analytics event instances.
 * On modern AXIS OS, Object Analytics publishes counting/occupancy data
 * as events. This endpoint returns the current state of all event instances.
 *
 * Returns analytics events extracted from the event instances.
 */
async function queryEvent2Analytics(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 8000,
  conn?: CameraConnectionInfo
): Promise<{ events: Array<{ eventType: string; value: number; metadata?: Record<string, any> }>; reachable: boolean }> {
  const events: Array<{ eventType: string; value: number; metadata?: Record<string, any> }> = [];
  let reachable = false;

  // Try multiple event endpoint paths - the API may vary by firmware version
  const eventPaths = [
    "/axis-cgi/event2/instances.cgi",          // Correct modern VAPIX Event2 path
    "/axis-cgi/event2/getEventInstances.cgi",  // Legacy variant
    "/axis-cgi/eventinstances.cgi",            // Very old fallback
  ];

  let json: any = null;
  for (const ePath of eventPaths) {
    json = await vapixJsonRpc(
      ipAddress, username, password,
      ePath, "getEventInstances", "1.0", timeout, conn
    );
    if (json) {
      reachable = true;
      break;
    }
  }

  if (!json) {
    return { events, reachable };
  }

  // Parse event instances - look for analytics-related events
  const instances = json?.data?.eventInstances || json?.data?.instances || [];

  // Log available event topics for debugging (only once per camera, not every poll)
  if (instances.length > 0 && !event2LoggedCameras.has(ipAddress)) {
    event2LoggedCameras.add(ipAddress);
    const allTopics = instances.map((i: any) => i.topic || i.declaration?.topic || "?");
    const analyticsTopics = allTopics.filter((t: string) =>
      /crossline|objectanalytics|occupancy|object.?in.?area|counting|peoplecounter/i.test(t)
    );
    if (analyticsTopics.length > 0) {
      console.log(`[Analytics] Event2 on ${ipAddress}: ${instances.length} instances, ${analyticsTopics.length} analytics-related: ${analyticsTopics.slice(0, 5).join(", ")}`);
    } else {
      console.log(`[Analytics] Event2 on ${ipAddress}: ${instances.length} instances, 0 analytics matches. Sample topics: ${allTopics.slice(0, 8).join(", ")}`);
    }
  }

  for (const instance of instances) {
    const topic = (instance.topic || instance.declaration?.topic || "").toLowerCase();
    // Event data can be nested in various places depending on firmware
    const data = instance.data || instance.properties || instance.message?.data || {};

    // CrossLine counting events
    // VAPIX topics: tnsaxis:CameraApplicationPlatform/ObjectAnalytics/...
    // or tns1:RuleEngine/CrossLineDetector/...
    if (topic.includes("crossline") || topic.includes("crosslinecounting") ||
        topic.includes("objectanalytics") || topic.includes("object_analytics") ||
        topic.includes("ruleengine/crossline") || topic.includes("linedetector") ||
        topic.includes("peoplecounter")) {
      const inCount = parseInt(data.in || data.enters || data.total_in || data.totalIn || "0") || 0;
      const outCount = parseInt(data.out || data.exits || data.total_out || data.totalOut || "0") || 0;
      const total = parseInt(data.total || data.totalCount || "0") || 0;

      if (inCount > 0 || outCount > 0 || total > 0) {
        if (inCount > 0) events.push({ eventType: "people_in", value: inCount, metadata: { source: "event2", topic } });
        if (outCount > 0) events.push({ eventType: "people_out", value: outCount, metadata: { source: "event2", topic } });
        if (total > 0 && inCount === 0 && outCount === 0) {
          events.push({ eventType: "line_crossing", value: total, metadata: { source: "event2", topic } });
        }
      }
    }

    // Occupancy events
    if (topic.includes("occupancy") || topic.includes("object_in_area") || topic.includes("objectinarea") ||
        topic.includes("areacounting") || topic.includes("area_counting")) {
      const count = parseInt(data.currentOccupancy || data.occupancy || data.count || data.objects || "0") || 0;
      if (count >= 0) {
        events.push({ eventType: "occupancy", value: count, metadata: { source: "event2", topic } });
      }
    }
  }

  if (events.length > 0) {
    console.log(`[Analytics] Event2 on ${ipAddress}: found ${events.length} analytics events from ${instances.length} instances`);
  }

  return { events, reachable };
}

/**
 * Query analytics events via the classic VAPIX SOAP Event Service.
 * This works on cameras without Event2 (older AXIS OS) by calling
 * GetEventInstances at /vapix/services.
 * Returns the same event structure as queryEvent2Analytics.
 */
async function querySoapEventInstances(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 8000,
  conn?: CameraConnectionInfo
): Promise<{ events: Array<{ eventType: string; value: number; metadata?: Record<string, any> }>; reachable: boolean }> {
  const events: Array<{ eventType: string; value: number; metadata?: Record<string, any> }> = [];
  let reachable = false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const dispatcher = getCameraDispatcher(conn);

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope"
  xmlns:wsa="http://www.w3.org/2005/08/addressing"
  xmlns:tev="http://www.axis.com/vapix/ws/event1">
  <SOAP-ENV:Header>
    <wsa:Action>http://www.axis.com/vapix/ws/event1/GetEventInstances</wsa:Action>
  </SOAP-ENV:Header>
  <SOAP-ENV:Body>
    <tev:GetEventInstances />
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  try {
    const url = buildCameraUrl(ipAddress, "/vapix/services", conn);
    const response = await authFetch(url, username, password, {
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml; action=http://www.axis.com/vapix/ws/event1/GetEventInstances; charset=UTF-8",
      },
      body: soapBody,
      signal: controller.signal,
      dispatcher,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { events, reachable };
    }

    reachable = true;
    const text = await response.text();

    // Parse analytics-related data from SOAP XML response.
    // AXIS cameras use two XML formats for event data:
    //   1. Standard ONVIF: <tt:SimpleItem Name="x" Value="y"/>
    //   2. AXIS extension: <aev:SimpleItemInstance Name="x" Type="...">
    //                        <aev:Value>y</aev:Value>
    //                      </aev:SimpleItemInstance>
    // Data values live inside <DataInstance> blocks; source/key values are in <SourceInstance>.
    // We parse per-DataInstance to emit events per scenario.

    // Helper: extract name/value pairs from a section of XML using both formats
    const extractItems = (section: string): Map<string, string> => {
      const items = new Map<string, string>();

      // Format 1: <tt:SimpleItem Name="x" Value="y"/> (namespace-agnostic)
      const simpleItemRegex = /<(?:\w+:)?SimpleItem\s+[^>]*Name="([^"]+)"[^>]*Value="([^"]+)"/gi;
      let m;
      while ((m = simpleItemRegex.exec(section)) !== null) {
        items.set(m[1].toLowerCase(), m[2]);
      }
      // Also Value before Name attribute order
      const simpleItemRevRegex = /<(?:\w+:)?SimpleItem\s+[^>]*Value="([^"]+)"[^>]*Name="([^"]+)"/gi;
      while ((m = simpleItemRevRegex.exec(section)) !== null) {
        items.set(m[2].toLowerCase(), m[1]);
      }

      // Format 2: <aev:SimpleItemInstance Name="x" ...><aev:Value>y</aev:Value></aev:SimpleItemInstance>
      const itemInstanceRegex = /<(?:\w+:)?SimpleItemInstance\s+[^>]*Name="([^"]+)"[^>]*>\s*<(?:\w+:)?Value>([^<]+)<\/(?:\w+:)?Value>/gi;
      while ((m = itemInstanceRegex.exec(section)) !== null) {
        items.set(m[1].toLowerCase(), m[2]);
      }

      return items;
    }

    // Phase 1: Extract data from <DataInstance> blocks (most reliable — only data fields, no source keys)
    const dataInstanceRegex = /<(?:\w+:)?DataInstance>([\s\S]*?)<\/(?:\w+:)?DataInstance>/gi;
    let dataBlock;
    let dataBlockCount = 0;
    // Accumulators across all DataInstance blocks
    let totalAcc = 0, totalHumanAcc = 0, totalCarAcc = 0;
    let entersAcc = 0, exitsAcc = 0;
    let maxOccupancy = 0;
    let foundCounting = false, foundOccupancy = false;

    while ((dataBlock = dataInstanceRegex.exec(text)) !== null) {
      const items = extractItems(dataBlock[1]);
      if (items.size === 0) continue;
      dataBlockCount++;

      // Check for counting fields
      const total = parseInt(items.get("total") || "0") || 0;
      const totalHuman = parseInt(items.get("totalhuman") || items.get("total_human") || "0") || 0;
      const totalCar = parseInt(items.get("totalcar") || items.get("total_car") || "0") || 0;
      const enters = parseInt(items.get("enters") || items.get("in") || items.get("totalin") || items.get("total_in") || "0") || 0;
      const exits = parseInt(items.get("exits") || items.get("out") || items.get("totalout") || items.get("total_out") || "0") || 0;

      if (total > 0 || totalHuman > 0 || enters > 0 || exits > 0) {
        foundCounting = true;
        totalAcc += total;
        totalHumanAcc += totalHuman;
        totalCarAcc += totalCar;
        entersAcc += enters;
        exitsAcc += exits;
      }

      // Check for occupancy fields (take max — occupancy is a gauge, not a counter)
      const occ = parseInt(
        items.get("currentoccupancy") || items.get("occupancy") || items.get("current_occupancy") ||
        items.get("count") || items.get("objects") || items.get("currentcount") ||
        items.get("active") || "0"
      ) || 0;
      if (occ > 0) {
        foundOccupancy = true;
        maxOccupancy = Math.max(maxOccupancy, occ);
      }
    }

    // Phase 2: If no DataInstance blocks yielded analytics data, try global extraction
    if (!foundCounting && !foundOccupancy) {
      const globalItems = extractItems(text);
      if (globalItems.size > 0) {
        const total = parseInt(globalItems.get("total") || "0") || 0;
        const totalHuman = parseInt(globalItems.get("totalhuman") || globalItems.get("total_human") || "0") || 0;
        const totalCar = parseInt(globalItems.get("totalcar") || globalItems.get("total_car") || "0") || 0;
        const enters = parseInt(globalItems.get("enters") || globalItems.get("in") || globalItems.get("totalin") || globalItems.get("total_in") || "0") || 0;
        const exits = parseInt(globalItems.get("exits") || globalItems.get("out") || globalItems.get("totalout") || globalItems.get("total_out") || "0") || 0;

        if (total > 0 || totalHuman > 0 || enters > 0 || exits > 0) {
          foundCounting = true;
          totalAcc = total; totalHumanAcc = totalHuman; totalCarAcc = totalCar;
          entersAcc = enters; exitsAcc = exits;
        }

        const occ = parseInt(
          globalItems.get("currentoccupancy") || globalItems.get("occupancy") || globalItems.get("current_occupancy") ||
          globalItems.get("count") || globalItems.get("objects") || globalItems.get("currentcount") ||
          globalItems.get("active") || "0"
        ) || 0;
        if (occ > 0) { foundOccupancy = true; maxOccupancy = occ; }
      }
    }

    // Emit events from accumulated data
    if (foundCounting) {
      if (entersAcc > 0 || totalHumanAcc > 0) {
        events.push({ eventType: "people_in", value: entersAcc || totalHumanAcc, metadata: { source: "soap-events" } });
      }
      if (exitsAcc > 0) {
        events.push({ eventType: "people_out", value: exitsAcc, metadata: { source: "soap-events" } });
      }
      const crossingTotal = totalAcc || (entersAcc + exitsAcc) || totalHumanAcc;
      if (crossingTotal > 0) {
        events.push({
          eventType: "line_crossing",
          value: crossingTotal,
          metadata: { source: "soap-events", totalHuman: totalHumanAcc, totalCar: totalCarAcc, enters: entersAcc, exits: exitsAcc },
        });
      }
    }
    if (foundOccupancy && maxOccupancy > 0) {
      events.push({ eventType: "occupancy", value: maxOccupancy, metadata: { source: "soap-events" } });
    }

    // One-time log per camera showing parse results
    if (!soapDebuggedCameras.has(ipAddress)) {
      soapDebuggedCameras.add(ipAddress);
      console.log(`[Analytics] SOAP on ${ipAddress}: ${text.length} bytes, ${dataBlockCount} DataInstance blocks, ${events.length} events`);
      if (events.length > 0) {
        console.log(`[Analytics] SOAP events on ${ipAddress}: ${events.map(e => `${e.eventType}=${e.value}`).join(", ")}`);
      } else {
        // Log what we found to help diagnose zero-event situations
        const allItems = extractItems(text);
        if (allItems.size > 0) {
          const pairs = Array.from(allItems.entries()).slice(0, 20).map(([k, v]) => `${k}=${v}`).join(", ");
          console.log(`[Analytics] SOAP items on ${ipAddress} (no analytics match): ${pairs}`);
        }
        // DEBUG: Extract the ObjectAnalytics section to understand data format
        const oaMatch = text.match(/(<[^<]*ObjectAnalytics[\s\S]{0,3000})/i);
        if (oaMatch) {
          console.log(`[Analytics] SOAP ObjectAnalytics section on ${ipAddress}: ${oaMatch[1].substring(0, 1500)}`);
        }
        // DEBUG: Find all MessageInstance blocks and log their content tags
        const msgBlocks = text.match(/<(?:\w+:)?MessageInstance>[\s\S]*?<\/(?:\w+:)?MessageInstance>/gi) || [];
        console.log(`[Analytics] SOAP on ${ipAddress}: ${msgBlocks.length} MessageInstance blocks`);
        if (msgBlocks.length > 0) {
          // Log the first 2 non-trivial MessageInstance blocks
          let logged = 0;
          for (const block of msgBlocks) {
            if (logged >= 2) break;
            if (block.includes("Analytics") || block.includes("Scenario") || block.includes("counting") || block.includes("Crossed")) {
              console.log(`[Analytics] SOAP analytics MessageInstance on ${ipAddress}: ${block.substring(0, 800)}`);
              logged++;
            }
          }
        }
      }
    }

  } catch (err: any) {
    clearTimeout(timeoutId);
    // Silent - SOAP might not be supported
  }

  return { events, reachable };
}

/**
 * Use VAPIX API Discovery (apidiscovery.cgi) to find available analytics APIs.
 * Returns which APIs are available: analytics-metadata-config, event2, /local/ ACAP paths.
 */
async function discoverAnalyticsApis(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 8000,
  conn?: CameraConnectionInfo
): Promise<{ hasMetadataConfig: boolean; hasEvent2: boolean; aoaLocalPath?: string }> {
  const result = { hasMetadataConfig: false, hasEvent2: false, aoaLocalPath: undefined as string | undefined };

  const json = await vapixJsonRpc(
    ipAddress, username, password,
    "/axis-cgi/apidiscovery.cgi",
    "getApiList", "1.0", timeout, conn
  );

  if (!json) return result;

  const apiList = json?.data?.apiList || [];

  // Log analytics/event-related APIs for debugging the matching
  const analyticsRelated = apiList.filter((a: any) => {
    const id = (a.id || "").toLowerCase();
    const name = (a.name || "").toLowerCase();
    return id.includes("analytic") || id.includes("event") || name.includes("analytic") || name.includes("event");
  });
  if (analyticsRelated.length > 0) {
    console.log(`[Analytics] apidiscovery on ${ipAddress}: ${apiList.length} APIs, analytics/event-related: ${analyticsRelated.map((a: any) => `${a.id}(v${a.version})`).join(", ")}`);
  } else {
    console.log(`[Analytics] apidiscovery on ${ipAddress}: ${apiList.length} APIs, none matched analytics/event. Sample IDs: ${apiList.slice(0, 15).map((a: any) => a.id).join(", ")}`);
  }

  for (const api of apiList) {
    const id = (api.id || "").toLowerCase();
    const name = (api.name || "").toLowerCase();

    // Flexible matching for analytics-metadata-config
    if (id === "analytics-metadata-config" || id.includes("analytics-metadata") ||
        id.includes("analyticsmetadata") || name.includes("analytics metadata")) {
      result.hasMetadataConfig = true;
    }
    // Flexible matching for event2
    if (id === "event2" || id === "event-instances" || id.includes("event2") ||
        name.includes("event instance") || name.includes("event2")) {
      result.hasEvent2 = true;
    }
    // Match object analytics local path
    if (id.includes("objectanalytics") || id.includes("object-analytics") ||
        name.includes("object analytics")) {
      const path = api.path || api.url;
      if (path) result.aoaLocalPath = path;
    }
  }

  console.log(`[Analytics] API discovery on ${ipAddress}: metadataConfig=${result.hasMetadataConfig}, event2=${result.hasEvent2}, aoaLocal=${result.aoaLocalPath || "none"}`);

  return result;
}

/**
 * Probe AXIS Object Analytics (AOA) for configured scenarios.
 *
 * Discovery strategy (in order):
 * 1. VAPIX API Discovery to find available APIs
 * 2. analytics-metadata-config.cgi (modern AXIS OS 11.x+ - the correct way)
 * 3. Event2 API probe (for live analytics data)
 * 4. Legacy /local/ ACAP paths (older firmware)
 *
 * @param acapNames - ACAP package names to try (from applications list)
 * @returns scenarios and the working API path
 */
async function queryObjectAnalyticsScenarios(
  ipAddress: string,
  username: string,
  password: string,
  acapNames: string[] = [],
  timeout: number = 8000,
  conn?: CameraConnectionInfo
): Promise<{ scenarios: Array<{ name: string; type: string; id?: number; objectClassifications?: string[] }>; apiPath?: string }> {

  // Step 1: VAPIX API Discovery (for logging and optional local path discovery)
  const apis = await discoverAnalyticsApis(ipAddress, username, password, timeout, conn);

  // Step 2: Try analytics-metadata-config.cgi ALWAYS (standard VAPIX CGI, not ACAP local)
  // Don't gate this on API discovery - the discovery matching may miss it
  const metadataResult = await queryAnalyticsMetadataConfig(ipAddress, username, password, timeout, conn);
  if (metadataResult && metadataResult.apiPath) {
    return metadataResult;
  }

  // Step 3: Try Event2 API ALWAYS (standard VAPIX CGI)
  const { events: eventData, reachable: event2Reachable } = await queryEvent2Analytics(ipAddress, username, password, timeout, conn);
  if (eventData.length > 0) {
    console.log(`[Analytics] Event2 on ${ipAddress}: ${eventData.length} analytics events found - using Event2 for polling`);
    return { scenarios: [], apiPath: "event2" };
  }
  if (event2Reachable) {
    // Event2 API responded but no analytics events currently (nobody crossed yet, etc.)
    // Still use Event2 as the polling path since it's the correct modern approach
    console.log(`[Analytics] Event2 on ${ipAddress}: API reachable (0 analytics events currently) - using Event2 for polling`);
    return { scenarios: [], apiPath: "event2" };
  }

  // Step 4: Try discovered AOA local path from API discovery
  if (apis.aoaLocalPath) {
    console.log(`[Analytics] Trying discovered AOA path ${apis.aoaLocalPath} on ${ipAddress}...`);
    const configJson = await tryAoaPost(ipAddress, username, password, apis.aoaLocalPath, "getConfiguration", timeout, conn);
    if (configJson) {
      const scenarios = extractAoaScenarios(configJson);
      console.log(`[Analytics] AOA found at discovered path ${apis.aoaLocalPath} on ${ipAddress}`);
      return { scenarios, apiPath: apis.aoaLocalPath };
    }
    // getConfiguration failed, try getAccumulatedCounts as existence check
    const dataCheck = await tryAoaPost(ipAddress, username, password, apis.aoaLocalPath, "getAccumulatedCounts", timeout, conn);
    if (dataCheck) {
      console.log(`[Analytics] AOA found at discovered path ${apis.aoaLocalPath} on ${ipAddress} (data only, no config)`);
      return { scenarios: [], apiPath: apis.aoaLocalPath };
    }
    console.log(`[Analytics] AOA discovered path ${apis.aoaLocalPath} on ${ipAddress}: no config/data response`);
  }

  // Step 5: ACAP local paths (control.cgi is the correct endpoint for AOA)
  const legacyPaths: string[] = [];
  for (const name of acapNames) {
    const lowerName = name.toLowerCase();
    // control.cgi is the correct CGI for AXIS Object Analytics ACAP
    legacyPaths.push(`/local/${lowerName}/control.cgi`);
    // Also try the old .api/.apioperator convention as fallback
    legacyPaths.push(`/local/${lowerName}/.api`);
    legacyPaths.push(`/local/${lowerName}/.apioperator`);
  }
  // Ensure standard objectanalytics paths are always tried
  if (!legacyPaths.includes("/local/objectanalytics/control.cgi")) {
    legacyPaths.push("/local/objectanalytics/control.cgi");
    legacyPaths.push("/local/objectanalytics/.api");
    legacyPaths.push("/local/objectanalytics/.apioperator");
  }

  // Track scenarios found via getConfiguration even if getAccumulatedCounts fails
  let acapScenarios: Array<{ name: string; type: string; id?: number; objectClassifications?: string[] }> = [];

  for (const path of legacyPaths) {
    console.log(`[Analytics] Trying ACAP path ${path} on ${ipAddress}...`);
    // Try getConfiguration directly - don't gate on getSupportedVersions
    // because control.cgi may not implement getSupportedVersions
    const configJson = await tryAoaPost(ipAddress, username, password, path, "getConfiguration", timeout, conn);
    if (configJson) {
      const scenarios = extractAoaScenarios(configJson);
      console.log(`[Analytics] AOA config found at ${path} on ${ipAddress} (${scenarios.length} scenarios)`);
      // Debug: log full scenario details including IDs
      for (const s of scenarios) {
        console.log(`[Analytics] AOA scenario on ${ipAddress}: id=${s.id} name="${s.name}" type="${s.type}" classes=${JSON.stringify(s.objectClassifications || [])}`);
      }
      acapScenarios = scenarios;

      // Validate that getAccumulatedCounts actually works on this path.
      // Try actual scenario IDs from getConfiguration first, then generic params.
      const paramFormats: Array<{ label: string; params: Record<string, any> | null }> = [];
      // AXIS docs: correct key is "scenario" (not "scenarioID"), value is UID integer
      for (const s of scenarios) {
        if (s.id !== undefined && s.id !== null) {
          paramFormats.push({ label: `scenario:${s.id}`, params: { scenario: s.id } });
        }
      }
      // Fallbacks: no params key, empty params, channel:0
      paramFormats.push(
        { label: "no-params-key", params: null },
        { label: "empty-params", params: {} },
        { label: "channel:0", params: { channel: 0 } },
      );
      for (const fmt of paramFormats) {
        const countCheck = await tryAoaPost(ipAddress, username, password, path, "getAccumulatedCounts", timeout, conn, fmt.params);
        if (countCheck) {
          console.log(`[Analytics] AOA getAccumulatedCounts confirmed on ${path} at ${ipAddress} with params: ${fmt.label}`);
          return { scenarios, apiPath: path };
        }
      }
      console.log(`[Analytics] AOA ${path} on ${ipAddress}: getConfiguration works but getAccumulatedCounts unsupported (tried all param formats)`);
      // Don't return yet — try SOAP/Event2 for data polling below
      break;
    }
  }

  // Step 6: Try classic SOAP Event Service (/vapix/services) - works on cameras without Event2
  const { events: soapEvents, reachable: soapReachable } = await querySoapEventInstances(ipAddress, username, password, timeout, conn);
  if (soapEvents.length > 0 || soapReachable) {
    console.log(`[Analytics] SOAP events on ${ipAddress}: ${soapReachable ? "API reachable" : ""} ${soapEvents.length} analytics events - using SOAP for polling`);
    return { scenarios: acapScenarios, apiPath: "soap-events" };
  }

  // Step 7: If analytics-metadata-config exists in API discovery,
  // try getAccumulatedCounts on it (different CGI than the ACAP control.cgi)
  if (apis.hasMetadataConfig && acapScenarios.length > 0) {
    const mdPaths = ["/axis-cgi/analytics-metadata-config.cgi", "/axis-cgi/analytics_metadata_config.cgi"];
    for (const mdPath of mdPaths) {
      const mdCountCheck = await tryAoaPost(ipAddress, username, password, mdPath, "getAccumulatedCounts", timeout, conn, { channel: 0 });
      if (mdCountCheck) {
        console.log(`[Analytics] AOA getAccumulatedCounts works on ${mdPath} at ${ipAddress}`);
        return { scenarios: acapScenarios, apiPath: mdPath };
      }
    }
  }

  // Step 8: If event2 exists in API discovery, use it as fallback even without current data
  // (analytics events may not have fired yet but will during normal operation)
  if (apis.hasEvent2) {
    console.log(`[Analytics] AOA on ${ipAddress}: Event2 available in API discovery - will poll via events`);
    return { scenarios: acapScenarios, apiPath: "event2" };
  }

  // No working polling path found — return scenarios for display but no apiPath for polling
  if (acapScenarios.length > 0) {
    console.log(`[Analytics] AOA on ${ipAddress}: ${acapScenarios.length} scenarios found but no working polling API (config-only)`);
  } else {
    console.log(`[Analytics] AOA on ${ipAddress}: no working analytics API found`);
  }
  return { scenarios: acapScenarios };
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
  timeout: number = 5000,
  conn?: CameraConnectionInfo
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const dispatcher = getCameraDispatcher(conn);

  try {
    // Use GET instead of HEAD - many Axis ACAP endpoints don't support HEAD
    const response = await authFetch(
      buildCameraUrl(ipAddress, path, conn),
      username,
      password,
      { method: "GET", signal: controller.signal, dispatcher }
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
  objectAnalyticsApiPath?: string; // Working API path discovered during probe
}

export async function probeAnalyticsCapabilities(
  ipAddress: string,
  username: string,
  password: string,
  conn?: CameraConnectionInfo
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

  // Clear failure/debug caches so a re-probe can retry and log fresh data
  aoaCountsFailedCache.delete(ipAddress);
  event2LoggedCameras.delete(ipAddress);
  soapDebuggedCameras.delete(ipAddress);

  console.log(`[Analytics] Starting probe for ${ipAddress}...`);

  // Step 1: Query installed applications list
  const apps = await queryInstalledApplications(ipAddress, username, password, 8000, conn);

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
    // Note: objectAnalytics is NOT set from app list alone - we need a working API path
    // to actually poll data. It gets set below only if the API is reachable.
    if (hasApp(["loitering", "loiteringguard", "loitering_guard"])) results.loiteringGuard = true;
    if (hasApp(["fenceguard", "fence guard", "fence_guard"])) results.fenceGuard = true;
    if (hasApp(["motionguard", "motion guard", "motion_guard", "vmd"])) results.motionGuard = true;
  }

  const aoaInstalledInAppList = apps.some((a) => {
    const n = (a.name + " " + a.niceName).toLowerCase();
    return n.includes("objectanalytics") || n.includes("object analytics") || n.includes("aoa");
  });

  console.log(`[Analytics] Installed ACAPs on ${ipAddress}: ${results.acapInstalled.join(", ") || "none"}`);

  // Extract actual ACAP package names for Object Analytics (used to build correct API URLs)
  const aoaAcapNames: string[] = [];
  for (const app of apps) {
    const nameLower = app.name.toLowerCase();
    const niceNameLower = app.niceName.toLowerCase();
    if (nameLower.includes("objectanalytics") || nameLower.includes("object_analytics") ||
        nameLower.includes("aoa") || niceNameLower.includes("object analytics")) {
      aoaAcapNames.push(app.name);
      console.log(`[Analytics] AOA ACAP on ${ipAddress}: Name="${app.name}", Status="${app.status}"`);
    }
  }

  // Step 2: Probe AOA API - uses API Discovery first, then standard paths
  // Only set objectAnalytics=true if we find a reachable API path
  if (aoaInstalledInAppList || aoaAcapNames.length > 0) {
    const aoaResult = await queryObjectAnalyticsScenarios(ipAddress, username, password, aoaAcapNames, 8000, conn);
    if (aoaResult.apiPath) {
      results.objectAnalytics = true;
      results.objectAnalyticsApiPath = aoaResult.apiPath;
      console.log(`[Analytics] AOA API confirmed on ${ipAddress} at ${aoaResult.apiPath}`);
    }
    if (aoaResult.scenarios.length > 0) {
      results.objectAnalytics = true;
      results.objectAnalyticsScenarios = aoaResult.scenarios;
      console.log(`[Analytics] AOA scenarios on ${ipAddress}: ${aoaResult.scenarios.map((s) => {
        const classes = s.objectClassifications?.length ? ` [${s.objectClassifications.join(",")}]` : "";
        return `${s.name}(${s.type}${classes})`;
      }).join(", ")}`);

      for (const scenario of aoaResult.scenarios) {
        const type = scenario.type.toLowerCase();
        if (type.includes("crossline") || type.includes("line_crossing") || type.includes("crossing")) results.lineCrossing = true;
        if (type.includes("occupancy") || type.includes("object_in_area")) results.occupancyEstimation = true;
        if (type.includes("people") || type.includes("counting")) results.peopleCount = true;
      }
    } else if (!aoaResult.apiPath) {
      console.log(`[Analytics] AOA on ${ipAddress}: installed but no reachable API (will not poll for analytics data)`);
    }
  }

  // Step 3: Probe remaining ACAP endpoints in parallel for anything not yet detected
  const [pcAvail, occAvail, lgAvail, fgAvail, mgAvail] = await Promise.all([
    !results.peopleCount ? probeEndpoint(ipAddress, username, password, "/local/peoplecounter/query.cgi", 5000, conn) : Promise.resolve(true),
    !results.occupancyEstimation ? probeEndpoint(ipAddress, username, password, "/local/occupancy/.api?method=getOccupancy", 5000, conn) : Promise.resolve(true),
    !results.loiteringGuard ? probeEndpoint(ipAddress, username, password, "/local/loiteringguard/.api", 5000, conn) : Promise.resolve(true),
    !results.fenceGuard ? probeEndpoint(ipAddress, username, password, "/local/fenceguard/.api", 5000, conn) : Promise.resolve(true),
    !results.motionGuard ? probeEndpoint(ipAddress, username, password, "/local/motionguard/.api", 5000, conn) : Promise.resolve(true),
  ]);

  if (pcAvail) results.peopleCount = true;
  if (occAvail) results.occupancyEstimation = true;
  if (lgAvail) results.loiteringGuard = true;
  if (fgAvail) results.fenceGuard = true;
  if (mgAvail) results.motionGuard = true;

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
  const conn = getConnectionInfo(camera);
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
      const data = await queryPeopleCounter(camera.ipAddress, camera.username, password, 5000, conn);
      events.push(
        { eventType: "people_in", value: data.in },
        { eventType: "people_out", value: data.out },
        { eventType: "occupancy", value: data.occupancy }
      );
    } catch (err: any) {
      // People counter failed, try standalone occupancy
      if (occEnabled) {
        try {
          const occ = await queryOccupancy(camera.ipAddress, camera.username, password, 5000, conn);
          events.push({ eventType: "occupancy", value: occ });
        } catch {
          // Occupancy also failed
        }
      }
    }
  } else if (occEnabled) {
    // Only occupancy estimator available and enabled
    try {
      const occ = await queryOccupancy(camera.ipAddress, camera.username, password, 5000, conn);
      events.push({ eventType: "occupancy", value: occ });
    } catch {
      // Occupancy failed
    }
  }

  // Try Object Analytics (AOA) if enabled AND a working API path was discovered during probe.
  // Without a stored path, the probe found no working endpoint (all 404), so skip to avoid
  // spamming 404 requests every polling cycle.
  const storedAoaPath = caps?.analytics?.objectAnalyticsApiPath;
  const storedScenarios = caps?.analytics?.objectAnalyticsScenarios;
  if (oaEnabled && storedAoaPath) {
    const fetchAoa = async () => {
      return queryObjectAnalyticsData(camera.ipAddress, camera.username, password, storedAoaPath, 8000, conn, storedScenarios);
    };

    if (events.length === 0) {
      // Only query AOA if we didn't already get data from People Counter/Occupancy
      try {
        const aoaEvents = await fetchAoa();
        events.push(...aoaEvents);
      } catch {
        // AOA query failed
      }
    } else {
      // Even if we got people counter data, still try AOA for additional scenario data
      // but don't duplicate people_in/people_out/occupancy
      try {
        const aoaEvents = await fetchAoa();
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

    // Filter to cameras with analytics available, enabled, AND a working API path.
    // For objectAnalytics specifically, require objectAnalyticsApiPath - without it,
    // the AOA API is unreachable (all paths returned 404) and polling would just spam 404s.
    const analyticsCameras = allCameras.filter((c) => {
      const caps = c.capabilities as CameraCapabilities | null;
      const enabled = caps?.enabledAnalytics;
      const hasWorkingOa = caps?.analytics?.objectAnalytics === true &&
                           !!caps?.analytics?.objectAnalyticsApiPath &&
                           enabled?.objectAnalytics !== false;
      return (
        (caps?.analytics?.peopleCount === true && enabled?.peopleCount !== false) ||
        (caps?.analytics?.occupancyEstimation === true && enabled?.occupancyEstimation !== false) ||
        hasWorkingOa
      );
    });

    if (analyticsCameras.length === 0) {
      return; // No analytics cameras, skip silently
    }

    console.log(`[Analytics] Polling ${analyticsCameras.length} cameras with analytics`);

    const results = await Promise.allSettled(
      analyticsCameras.map((camera) => analyticsLimit(() => pollCameraAnalytics(camera)))
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
 * One-time startup cleanup: clear stale /local/ objectAnalyticsApiPath entries.
 * These paths were stored during previous broken probes and always return 404,
 * causing log spam every polling cycle.
 */
async function cleanupStaleAnalyticsPaths(): Promise<void> {
  try {
    const allCameras = await db.select().from(cameras);
    let cleaned = 0;

    for (const camera of allCameras) {
      const caps = camera.capabilities as CameraCapabilities | null;
      if (!caps?.analytics?.objectAnalyticsApiPath) continue;

      const storedPath = caps.analytics.objectAnalyticsApiPath;
      // Clear broken /local/.../.api and .apioperator paths (wrong endpoint format).
      // Keep /local/.../control.cgi paths (correct AOA ACAP CGI endpoint).
      if (storedPath.startsWith("/local/") && (storedPath.endsWith("/.api") || storedPath.endsWith("/.apioperator"))) {
        const updatedCaps = JSON.parse(JSON.stringify(caps));
        delete updatedCaps.analytics.objectAnalyticsApiPath;
        updatedCaps.analytics.objectAnalytics = false;

        await db.update(cameras)
          .set({ capabilities: updatedCaps })
          .where(eq(cameras.id, camera.id));
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Analytics] Startup cleanup: cleared ${cleaned} stale /local/ API paths from DB`);
    }
  } catch (err: any) {
    console.log(`[Analytics] Startup cleanup error: ${err.message}`);
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
  console.log(`[Analytics] Initializing analytics polling service (every ${intervalMinutes} min) [v2-control-cgi]...`);

  // Clean stale paths before first poll to prevent 404 spam
  cleanupStaleAnalyticsPaths().then(() => {
    // Initial poll after startup delay
    setTimeout(() => {
      pollAllCameraAnalytics();
    }, 15000); // 15s after startup (after camera monitor's 5s delay)
  });

  // Schedule regular polling
  cron.schedule(`*/${intervalMinutes} * * * *`, () => {
    pollAllCameraAnalytics();
  });
}

// Export for manual triggering
export { pollAllCameraAnalytics };
