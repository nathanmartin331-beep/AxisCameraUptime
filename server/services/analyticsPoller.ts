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
import { db } from "../db";
import { cameras, type CameraCapabilities } from "@shared/schema";
import { decryptPassword } from "../encryption";
import { authFetch } from "./digestAuth";
import { buildCameraUrl, getCameraDispatcher, getConnectionInfo, type CameraConnectionInfo } from "./cameraUrl";
import { storage } from "../storage";

// Configurable concurrency for analytics HTTP polling (default 25 parallel requests)
const ANALYTICS_CONCURRENCY = parseInt(process.env.POLL_CONCURRENCY || "25", 10);
const analyticsLimit = pLimit(ANALYTICS_CONCURRENCY);

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
  json: any
): Array<{ eventType: string; value: number; metadata?: Record<string, any> }> {
  const events: Array<{ eventType: string; value: number; metadata?: Record<string, any> }> = [];

  // Process accumulated counts from scenarios
  const scenarios = json?.data?.scenarios || json?.data?.devices?.[0]?.channels?.[0]?.scenarios || [];

  for (const scenario of scenarios) {
    const name = scenario.name || "Unnamed";
    const type = (scenario.type || "").toLowerCase();

    // Crossline counting scenarios
    if (type.includes("crossline") || type.includes("line_crossing") || type.includes("crossing")) {
      let scenarioIn = 0;
      let scenarioOut = 0;

      const passings = scenario.passings || scenario.counts || [];
      for (const passing of passings) {
        if (passing.in !== undefined || passing.enters !== undefined) {
          const val = parseInt(passing.in || passing.enters || "0") || 0;
          scenarioIn += val;
          events.push({
            eventType: "people_in",
            value: val,
            metadata: { scenario: name, source: "objectanalytics" },
          });
        }
        if (passing.out !== undefined || passing.exits !== undefined) {
          const val = parseInt(passing.out || passing.exits || "0") || 0;
          scenarioOut += val;
          events.push({
            eventType: "people_out",
            value: val,
            metadata: { scenario: name, source: "objectanalytics" },
          });
        }
      }

      // Also check for direct in/out counts on the scenario itself
      if (scenario.in !== undefined) {
        const val = parseInt(scenario.in) || 0;
        scenarioIn += val;
        events.push({
          eventType: "people_in",
          value: val,
          metadata: { scenario: name, source: "objectanalytics" },
        });
      }
      if (scenario.out !== undefined) {
        const val = parseInt(scenario.out) || 0;
        scenarioOut += val;
        events.push({
          eventType: "people_out",
          value: val,
          metadata: { scenario: name, source: "objectanalytics" },
        });
      }

      // Generate a line_crossing event with total crossings (in + out)
      const totalCrossings = scenarioIn + scenarioOut;
      if (totalCrossings > 0) {
        events.push({
          eventType: "line_crossing",
          value: totalCrossings,
          metadata: { scenario: name, source: "objectanalytics", in: scenarioIn, out: scenarioOut },
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
  conn?: CameraConnectionInfo
): Promise<Array<{ eventType: string; value: number; metadata?: Record<string, any> }>> {
  // Build paths to try: stored path first, then standard paths
  const pathsToTry: string[] = [];
  if (storedApiPath) {
    pathsToTry.push(storedApiPath);
  }
  if (!pathsToTry.includes("/local/objectanalytics/.api")) {
    pathsToTry.push("/local/objectanalytics/.api");
  }
  if (!pathsToTry.includes("/local/objectanalytics/.apioperator")) {
    pathsToTry.push("/local/objectanalytics/.apioperator");
  }

  for (const path of pathsToTry) {
    const json = await tryAoaPost(ipAddress, username, password, path, "getAccumulatedCounts", timeout, conn);
    if (json) {
      return parseAoaAccumulatedCounts(json);
    }
  }

  return [];
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
    if (scenario.id !== undefined) entry.id = Number(scenario.id);
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
 * Tries multiple apiVersion values since different firmware versions
 * support different API versions (1.0, 1.1, 1.3, etc.).
 */
async function tryAoaPost(
  ipAddress: string,
  username: string,
  password: string,
  path: string,
  method: string,
  timeout: number = 8000,
  conn?: CameraConnectionInfo
): Promise<any | null> {
  // Try multiple API versions - newer AOA firmware may require specific versions
  const apiVersions = ["1.0", "1.3"];

  for (const apiVersion of apiVersions) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const dispatcher = getCameraDispatcher(conn);

    try {
      const url = buildCameraUrl(ipAddress, path, conn);
      const body = JSON.stringify({ apiVersion, method });

      const response = await authFetch(
        url,
        username,
        password,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
          dispatcher,
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`[Analytics] AOA POST ${path} ${method} (v${apiVersion}) on ${ipAddress}: HTTP ${response.status}`);
        continue;
      }

      const text = await response.text();
      if (!text.trim()) {
        console.log(`[Analytics] AOA POST ${path} ${method} (v${apiVersion}) on ${ipAddress}: empty response body`);
        continue;
      }

      try {
        const json = JSON.parse(text);
        if (json.error) {
          console.log(`[Analytics] AOA POST ${path} ${method} (v${apiVersion}) on ${ipAddress}: API error: ${JSON.stringify(json.error)}`);
          continue;
        }
        return json;
      } catch {
        console.log(`[Analytics] AOA POST ${path} ${method} (v${apiVersion}) on ${ipAddress}: invalid JSON (first 200 chars): ${text.substring(0, 200)}`);
        continue;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.log(`[Analytics] AOA POST ${path} ${method} (v${apiVersion}) on ${ipAddress}: timeout after ${timeout}ms`);
      } else {
        console.log(`[Analytics] AOA POST ${path} ${method} (v${apiVersion}) on ${ipAddress}: ${err.message}`);
      }
    }
  }

  return null;
}

/**
 * Try a GET request to an AOA path to discover the API.
 * Returns the parsed JSON response if the endpoint returns valid JSON, null otherwise.
 * Useful for discovering the API on cameras where POST to .api returns 404.
 */
async function tryAoaGet(
  ipAddress: string,
  username: string,
  password: string,
  path: string,
  timeout: number = 8000,
  conn?: CameraConnectionInfo
): Promise<any | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const dispatcher = getCameraDispatcher(conn);

  try {
    const url = buildCameraUrl(ipAddress, path, conn);
    const response = await authFetch(url, username, password, {
      method: "GET",
      signal: controller.signal,
      dispatcher,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const text = await response.text();
    const trimmed = text.trim();
    if (!trimmed) return null;

    // If JSON response, parse and return
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const json = JSON.parse(trimmed);
        if (json.error) return null;
        return json;
      } catch {
        return null;
      }
    }

    // Non-JSON response - return as a marker that the path exists
    return { _raw: trimmed.substring(0, 500), _pathExists: true };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Probe AXIS Object Analytics (AOA) for configured scenarios.
 * Tries multiple API paths and methods for compatibility across firmware versions.
 *
 * On newer AXIS OS (11.x+), AOA may be a built-in component that doesn't serve
 * the traditional /local/<name>/.api endpoint. In that case, we try:
 * - /axis-cgi/objectanalytics.cgi (CGI-based API)
 * - /axis-cgi/analytics/getConfiguration.cgi
 * - /local/<name>/.apioperator and /.apiviewer (alternate access levels)
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
  // Build list of paths to try, using actual ACAP names from the app list
  const pathsToTry: string[] = [];

  // First: try paths based on actual ACAP names discovered from applications/list.cgi
  for (const name of acapNames) {
    const lowerName = name.toLowerCase();
    pathsToTry.push(`/local/${lowerName}/.api`);
    pathsToTry.push(`/local/${lowerName}/.apioperator`);
    pathsToTry.push(`/local/${lowerName}/.apiviewer`);
  }

  // Then: standard paths as fallback
  if (!pathsToTry.includes("/local/objectanalytics/.api")) {
    pathsToTry.push("/local/objectanalytics/.api");
    pathsToTry.push("/local/objectanalytics/.apioperator");
    pathsToTry.push("/local/objectanalytics/.apiviewer");
  }

  // Newer AXIS OS: CGI-based analytics endpoints (built-in AOA doesn't use /local/)
  pathsToTry.push("/axis-cgi/objectanalytics.cgi");
  pathsToTry.push("/axis-cgi/analytics/getConfiguration.cgi");

  // Methods to try for each path (getSupportedVersions first as lightest probe)
  const methodsToTry = ["getSupportedVersions", "getConfiguration", "getScenarios"];

  console.log(`[Analytics] Probing AOA on ${ipAddress}, trying ${pathsToTry.length} paths...`);

  for (const path of pathsToTry) {
    // Try POST JSON-RPC first (standard AOA API)
    for (const method of methodsToTry) {
      const json = await tryAoaPost(ipAddress, username, password, path, method, timeout, conn);
      if (!json) continue;

      console.log(`[Analytics] AOA ${method} on ${ipAddress} at ${path}: success`);

      // getSupportedVersions just confirms the API exists, still need getConfiguration
      if (method === "getSupportedVersions") {
        console.log(`[Analytics] AOA API found at ${path} via getSupportedVersions, fetching configuration...`);
        const configJson = await tryAoaPost(ipAddress, username, password, path, "getConfiguration", timeout, conn);
        if (configJson) {
          const scenarios = extractAoaScenarios(configJson);
          if (scenarios.length > 0) {
            return { scenarios, apiPath: path };
          }
          console.log(`[Analytics] AOA getConfiguration at ${path}: no scenarios. Keys: ${JSON.stringify(Object.keys(configJson?.data || {}))}`);
        }
        // API exists but getConfiguration didn't return scenarios - still return the path
        return { scenarios: [], apiPath: path };
      }

      // getConfiguration or getScenarios - extract scenarios directly
      const scenarios = extractAoaScenarios(json);
      if (scenarios.length > 0) {
        return { scenarios, apiPath: path };
      }

      // API responded but no scenarios in response
      console.log(`[Analytics] AOA ${method} at ${path}: responded but no scenarios. Top-level keys: ${JSON.stringify(Object.keys(json || {}))}. Data keys: ${JSON.stringify(Object.keys(json?.data || {}))}`);
      // Return the path even without scenarios - the API works, scenarios might come from data polling
      return { scenarios: [], apiPath: path };
    }
  }

  // POST paths all failed (404). Try GET discovery on key paths to find where AOA serves content.
  console.log(`[Analytics] AOA on ${ipAddress}: all POST paths returned 404, trying GET discovery...`);
  const getDiscoveryPaths = [
    "/local/objectanalytics/",
    "/local/objectanalytics/config",
    "/local/objectanalytics/control.cgi",
  ];
  // Also add ACAP-specific GET paths
  for (const name of acapNames) {
    const lowerName = name.toLowerCase();
    if (lowerName !== "objectanalytics") {
      getDiscoveryPaths.push(`/local/${lowerName}/`);
    }
  }

  for (const path of getDiscoveryPaths) {
    const result = await tryAoaGet(ipAddress, username, password, path, timeout, conn);
    if (result) {
      const isRaw = result._pathExists;
      if (isRaw) {
        console.log(`[Analytics] AOA GET discovery on ${ipAddress}: ${path} responded (non-JSON, first 200 chars): ${result._raw?.substring(0, 200)}`);
      } else {
        console.log(`[Analytics] AOA GET discovery on ${ipAddress}: ${path} returned JSON. Keys: ${JSON.stringify(Object.keys(result))}`);
        const scenarios = extractAoaScenarios(result);
        if (scenarios.length > 0) {
          return { scenarios, apiPath: path };
        }
      }
      // Found content but can't extract scenarios - the ACAP exists but uses unknown API format
      // Return the path so polling can try it later
      if (!isRaw) {
        return { scenarios: [], apiPath: path };
      }
    }
  }

  console.log(`[Analytics] AOA on ${ipAddress}: no working API path found (ACAP may be built-in with no HTTP API)`);
  return { scenarios: [] };
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
    if (hasApp(["objectanalytics", "object analytics", "object_analytics", "aoa"])) results.objectAnalytics = true;
    if (hasApp(["loitering", "loiteringguard", "loitering_guard"])) results.loiteringGuard = true;
    if (hasApp(["fenceguard", "fence guard", "fence_guard"])) results.fenceGuard = true;
    if (hasApp(["motionguard", "motion guard", "motion_guard", "vmd"])) results.motionGuard = true;
  }

  console.log(`[Analytics] Installed ACAPs on ${ipAddress}: ${results.acapInstalled.join(", ") || "none found (app list empty or unavailable)"}`);

  // Extract actual ACAP package names for Object Analytics (used to build correct API URLs)
  const aoaAcapNames: string[] = [];
  for (const app of apps) {
    const nameLower = app.name.toLowerCase();
    const niceNameLower = app.niceName.toLowerCase();
    if (nameLower.includes("objectanalytics") || nameLower.includes("object_analytics") ||
        nameLower.includes("aoa") || niceNameLower.includes("object analytics")) {
      aoaAcapNames.push(app.name);
      console.log(`[Analytics] AOA ACAP on ${ipAddress}: Name="${app.name}", NiceName="${app.niceName}", Status="${app.status}", ID="${app.id || "n/a"}"`);
    }
  }

  // Step 2: Always try AOA directly via POST - this is the most common analytics platform
  // and the most reliable way to detect it (app list can fail on some firmware)
  const aoaResult = await queryObjectAnalyticsScenarios(ipAddress, username, password, aoaAcapNames, 8000, conn);
  if (aoaResult.apiPath) {
    results.objectAnalytics = true;
    results.objectAnalyticsApiPath = aoaResult.apiPath;
  }
  if (aoaResult.scenarios.length > 0) {
    results.objectAnalytics = true;
    results.objectAnalyticsScenarios = aoaResult.scenarios;
    console.log(`[Analytics] AOA scenarios on ${ipAddress}: ${aoaResult.scenarios.map((s) => {
      const classes = s.objectClassifications?.length ? ` [${s.objectClassifications.join(",")}]` : "";
      return `${s.name}(${s.type}${classes})`;
    }).join(", ")}`);

    // Infer capabilities from scenario types
    for (const scenario of aoaResult.scenarios) {
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
    !results.peopleCount ? probeEndpoint(ipAddress, username, password, "/local/peoplecounter/query.cgi", 5000, conn) : Promise.resolve(true),
    !results.occupancyEstimation ? probeEndpoint(ipAddress, username, password, "/local/occupancy/.api?method=getOccupancy", 5000, conn) : Promise.resolve(true),
    !results.objectAnalytics ? probeEndpoint(ipAddress, username, password, "/local/objectanalytics/.api", 5000, conn) : Promise.resolve(true),
    !results.loiteringGuard ? probeEndpoint(ipAddress, username, password, "/local/loiteringguard/.api", 5000, conn) : Promise.resolve(true),
    !results.fenceGuard ? probeEndpoint(ipAddress, username, password, "/local/fenceguard/.api", 5000, conn) : Promise.resolve(true),
    !results.motionGuard ? probeEndpoint(ipAddress, username, password, "/local/motionguard/.api", 5000, conn) : Promise.resolve(true),
  ]);

  if (pcAvail) results.peopleCount = true;
  if (occAvail) results.occupancyEstimation = true;
  if (oaAvail) results.objectAnalytics = true;
  if (lgAvail) results.loiteringGuard = true;
  if (fgAvail) results.fenceGuard = true;
  if (mgAvail) results.motionGuard = true;

  // If AOA was found by endpoint probe but we haven't queried scenarios yet, do it now
  if (results.objectAnalytics && results.objectAnalyticsScenarios.length === 0 && !results.objectAnalyticsApiPath) {
    const lateResult = await queryObjectAnalyticsScenarios(ipAddress, username, password, aoaAcapNames, 8000, conn);
    if (lateResult.apiPath) {
      results.objectAnalyticsApiPath = lateResult.apiPath;
    }
    if (lateResult.scenarios.length > 0) {
      results.objectAnalyticsScenarios = lateResult.scenarios;
      console.log(`[Analytics] AOA scenarios (late probe) on ${ipAddress}: ${lateResult.scenarios.map((s) => {
        const classes = s.objectClassifications?.length ? ` [${s.objectClassifications.join(",")}]` : "";
        return `${s.name}(${s.type}${classes})`;
      }).join(", ")}`);
      for (const scenario of lateResult.scenarios) {
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
  if (oaEnabled && storedAoaPath) {
    if (events.length === 0) {
      // Only query AOA if we didn't already get data from People Counter/Occupancy
      try {
        const aoaEvents = await queryObjectAnalyticsData(camera.ipAddress, camera.username, password, storedAoaPath, 8000, conn);
        events.push(...aoaEvents);
      } catch {
        // AOA query failed
      }
    } else {
      // Even if we got people counter data, still try AOA for additional scenario data
      // but don't duplicate people_in/people_out/occupancy
      try {
        const aoaEvents = await queryObjectAnalyticsData(camera.ipAddress, camera.username, password, storedAoaPath, 8000, conn);
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
