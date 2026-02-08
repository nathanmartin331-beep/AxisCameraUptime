import cron from "node-cron";
import pLimit from "p-limit";
import { storage } from "./storage";
import { db } from "./db";
import { cameras } from "@shared/schema";
import { decryptPassword } from "./encryption";
import { detectCameraModel } from "./services/cameraDetection";
import { detectionCache } from "./services/detectionCache";
import { eq } from "drizzle-orm";
import { authFetch } from "./services/digestAuth";
import { backfillFromUptimeSeconds, backfillFromSystemLog } from "./services/historyBackfill";
import { probeAnalyticsCapabilities } from "./services/analyticsPoller";
import type { InsertUptimeEvent } from "@shared/schema";

// Configurable concurrency for HTTP polling (default 25 parallel requests)
const POLL_CONCURRENCY = parseInt(process.env.POLL_CONCURRENCY || "25", 10);
const limit = pLimit(POLL_CONCURRENCY);

// Cache the VAPIX protocol variant per camera IP to avoid redundant GET→POST retries.
// "json" = modern JSON POST API, "legacy" = key=value GET, "param" = param.cgi fallback
const protocolCache = new Map<string, "json" | "legacy" | "param">();

/**
 * Strip ExCam explosion-proof housing prefix from model string.
 * "ExCam XF P1378" → "P1378", "ExCam XPT Q6135" → "Q6135"
 */
function stripExCamPrefix(model: string): string {
  return model.replace(/^EXCAM\s+X[A-Z]*\s+/i, '');
}

interface SystemReadyResponse {
  systemReady: boolean;
  uptime: number;
  bootId: string;
}

interface VideoCheckResponse {
  videoAvailable: boolean;
  responseTime: number;
}

/**
 * Get appropriate video endpoint based on camera model
 * Different camera series may use different endpoints
 */
function getVideoEndpoint(camera: any): string {
  // Default endpoint for most cameras
  const defaultEndpoint = "/axis-cgi/jpg/image.cgi";

  // If no model detected yet, use default
  if (!camera.model) return defaultEndpoint;

  // Model-specific endpoint selection
  const series = camera.series;

  const model = camera.model ? camera.model.toUpperCase() : '';
  const baseModel = stripExCamPrefix(model);

  // Multi-directional P-series (P3719, P3717, P3727, P3737, P3747, P3748)
  // Each sensor is an independent channel; use camera=1 for monitoring
  if (/P37[12347][789]/.test(baseModel)) {
    return "/axis-cgi/jpg/image.cgi?camera=1";
  }

  // Bispectral cameras (Q8742, Q8752) — camera=1=thermal, camera=2=visual
  // Use camera=1 (thermal) for uptime check since it validates full pipeline
  if (/Q87[45]2/.test(baseModel)) {
    return "/axis-cgi/jpg/image.cgi?camera=1";
  }

  // M-series multi-sensor cameras may need camera parameter
  if (series === 'M' && camera.numberOfViews && camera.numberOfViews > 1) {
    return "/axis-cgi/jpg/image.cgi?camera=1";
  }

  // All other models use standard endpoint
  return defaultEndpoint;
}

/**
 * Get the thumbnail resolution for a camera.
 * Panoramic/fisheye cameras (e.g. M3007) output square images and can't produce 16:9.
 * Multi-imager panoramic cameras (M43xx) output ultra-wide images.
 * See docs/axis-vapix-edge-cases.md for full model reference.
 */
function getThumbnailResolution(camera: any): string {
  if (!camera.model) return "160x90";
  const model = camera.model.toUpperCase();

  // Strip ExCam prefix to get base model for resolution logic
  const baseModel = stripExCamPrefix(model);

  // Fisheye/panoramic cameras — circular sensor, need square resolution
  // M3007, M3057, M3058, M3067, M3068, M3077
  if (/M30[0-9]7/.test(baseModel) || /M30[0-9]8/.test(baseModel)) {
    return "160x160";
  }

  // Multi-imager panoramic cameras (M43xx) — 4 sensors stitched, ultra-wide
  if (/M43\d{2}/.test(baseModel)) {
    return "320x90";
  }

  // Multi-sensor M-series with panoramic stitching (fallback for unlisted models)
  if (camera.series === 'M' && camera.numberOfViews && camera.numberOfViews > 1) {
    return "320x90";
  }
  return "160x90";
}

export async function checkVideoStream(
  ipAddress: string,
  username: string,
  password: string,
  endpoint: string = "/axis-cgi/jpg/image.cgi",
  timeout: number = 5000,
  thumbnailResolution: string = "160x90"
): Promise<VideoCheckResponse> {
  // Try with thumbnail resolution first, then fall back to no resolution param
  const separator = endpoint.includes('?') ? '&' : '?';
  const thumbnailUrl = `http://${ipAddress}${endpoint}${separator}resolution=${thumbnailResolution}`;
  const fallbackUrl = `http://${ipAddress}${endpoint}`;

  for (const url of [thumbnailUrl, fallbackUrl]) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const startTime = Date.now();

      const response = await authFetch(url, username, password, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(`Authentication failed - invalid credentials`);
        } else if (response.status === 404) {
          throw new Error(`Video endpoint not found - camera may not support JPEG API`);
        }
        // If thumbnail resolution caused an error (e.g. 500), try fallback
        if (url === thumbnailUrl) {
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('image')) {
        // Non-image response with thumbnail param — try without
        if (url === thumbnailUrl) {
          continue;
        }
        throw new Error(`Unexpected content type: ${contentType} (expected image/*)`);
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        if (url === thumbnailUrl) {
          continue;
        }
        throw new Error(`Empty response - no image data received`);
      }

      return {
        videoAvailable: true,
        responseTime,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        throw new Error(`Video check timeout after ${timeout}ms`);
      }
      // Auth errors are terminal — don't retry with fallback
      if (error.message?.includes("Authentication failed")) {
        throw error;
      }
      // 404 on thumbnail URL → try fallback URL; 404 on fallback → try /jpg/image.jpg (very old firmware)
      if (error.message?.includes("endpoint not found") && url === fallbackUrl) {
        // Last resort: very old VAPIX 1/2 cameras use /jpg/image.jpg
        try {
          const legacyUrl = `http://${ipAddress}/jpg/image.jpg`;
          const legacyController = new AbortController();
          const legacyTimeoutId = setTimeout(() => legacyController.abort(), timeout);
          const legacyStart = Date.now();
          const legacyResponse = await authFetch(legacyUrl, username, password, { signal: legacyController.signal });
          clearTimeout(legacyTimeoutId);
          if (legacyResponse.ok) {
            const ct = legacyResponse.headers.get('content-type');
            if (ct && ct.includes('image')) {
              const buf = await legacyResponse.arrayBuffer();
              if (buf.byteLength > 0) {
                return { videoAvailable: true, responseTime: Date.now() - legacyStart };
              }
            }
          }
        } catch {
          // Legacy endpoint also failed — fall through to throw
        }
        throw error;
      }
      // For other errors on thumbnail URL, try fallback
      if (url === thumbnailUrl) {
        continue;
      }
      throw error;
    }
  }

  // Should not reach here, but just in case
  throw new Error("Video check failed on all attempts");
}

async function pollCamera(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 5000
): Promise<SystemReadyResponse> {
  // Fast path: if we already know this camera's protocol, skip discovery
  const knownProtocol = protocolCache.get(ipAddress);
  if (knownProtocol === "json") {
    return await pollCameraJsonApi(ipAddress, username, password, timeout);
  }
  if (knownProtocol === "param") {
    return await pollCameraLegacyFallback(ipAddress, username, password, timeout);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `http://${ipAddress}/axis-cgi/systemready.cgi`;
    const startTime = Date.now();

    // VAPIX Systemready API doesn't require authentication
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AxisCameraMonitor/1.0",
      },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    // Check HTTP status
    if (response.status === 404 || response.status === 500) {
      // Older firmware without systemready.cgi, or server error — fall back to param.cgi
      console.log(`[VAPIX] systemready.cgi returned ${response.status} on ${ipAddress}, caching param.cgi fallback`);
      protocolCache.set(ipAddress, "param");
      return await pollCameraLegacyFallback(ipAddress, username, password, timeout);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const trimmed = text.trim();

    // Guard against HTML responses (misconfigured device or web UI redirect)
    if (trimmed.startsWith('<') || (response.headers.get('content-type') || '').includes('text/html')) {
      console.log(`[VAPIX] HTML response from systemready.cgi on ${ipAddress}, falling back to param.cgi`);
      protocolCache.set(ipAddress, "param");
      return await pollCameraLegacyFallback(ipAddress, username, password, timeout);
    }

    // Detect JSON response (modern VAPIX API v1.2+/v1.4+)
    if (trimmed.startsWith('{')) {
      console.log(`[VAPIX] Detected JSON API on ${ipAddress}, caching for future polls`);
      protocolCache.set(ipAddress, "json");
      return await pollCameraJsonApi(ipAddress, username, password, timeout);
    }

    // This is a legacy key=value camera — cache it
    protocolCache.set(ipAddress, "legacy");

    // Validate response contains expected legacy VAPIX format
    if (!text.includes("systemready=") && !text.includes("=")) {
      throw new Error(`Invalid response format - not VAPIX systemready (got: ${text.substring(0, 100)})`);
    }

    // Parse systemready response format:
    // systemready=yes
    // uptime=123456
    // bootid=abc123
    const lines = text.split(/\r?\n/); // Handle both Unix and Windows line endings
    const data: Record<string, string> = {};

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || !trimmedLine.includes("=")) continue;
      
      const separatorIndex = trimmedLine.indexOf("=");
      const key = trimmedLine.substring(0, separatorIndex).trim().toLowerCase();
      const value = trimmedLine.substring(separatorIndex + 1).trim();
      
      if (key && value) {
        data[key] = value;
      }
    }

    // Validate required fields are present
    if (!data.systemready) {
      throw new Error(`Missing 'systemready' field in response. Got keys: ${Object.keys(data).join(", ")}`);
    }

    // Validate systemready value
    const systemReady = data.systemready.toLowerCase();
    if (systemReady !== "yes" && systemReady !== "no") {
      throw new Error(`Invalid systemready value: '${data.systemready}' (expected 'yes' or 'no')`);
    }

    // Parse uptime (may not always be present)
    let uptime = 0;
    if (data.uptime) {
      const parsedUptime = parseInt(data.uptime);
      if (!isNaN(parsedUptime)) {
        uptime = parsedUptime;
      } else {
        console.warn(`[VAPIX] Invalid uptime value for ${ipAddress}: '${data.uptime}'`);
      }
    }

    // bootid is required for reboot detection
    if (!data.bootid) {
      console.warn(`[VAPIX] Missing bootid for ${ipAddress} - reboot detection will not work`);
    }

    return {
      systemReady: systemReady === "yes",
      uptime,
      bootId: data.bootid || "",
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    // Provide more context in error message
    if (error.name === "AbortError") {
      throw new Error(`Timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Poll camera using modern JSON-based VAPIX API (v1.4+)
 * Newer Axis firmware expects POST with JSON body on systemready.cgi
 * Note: systemready.cgi is unauthenticated — no credentials needed
 */
async function pollCameraJsonApi(
  ipAddress: string,
  _username: string,
  _password: string,
  timeout: number = 5000
): Promise<SystemReadyResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `http://${ipAddress}/axis-cgi/systemready.cgi`;

    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        "User-Agent": "AxisCameraMonitor/1.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiVersion: "1.0",
        method: "systemReady",
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    if (process.env.NODE_ENV === "development") {
      console.log(`[VAPIX] JSON API response from ${ipAddress}:\n${JSON.stringify(json).substring(0, 500)}`);
    }

    if (json.error) {
      throw new Error(`VAPIX API error ${json.error.code}: ${json.error.message}`);
    }

    const data = json.data || {};
    // Response keys may be all-lowercase (e.g. "systemready") or camelCase
    const readyValue = data.systemReady ?? data.systemready;
    const systemReady = readyValue === "yes" || readyValue === true;

    if (!systemReady) {
      console.warn(`[VAPIX] Camera ${ipAddress} reports systemReady=${readyValue}`);
    }

    return {
      systemReady,
      uptime: parseInt(data.uptime || '0') || 0,
      bootId: data.bootId || data.bootid || "",
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Fallback health check for older cameras without systemready.cgi
 * Uses param.cgi to verify the camera is responsive (requires auth)
 */
async function pollCameraLegacyFallback(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 5000
): Promise<SystemReadyResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Try param.cgi which most Axis cameras support (even very old firmware)
    const url = `http://${ipAddress}/axis-cgi/param.cgi?action=list&group=root.Properties.System`;

    const response = await authFetch(url, username, password, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();

    if (process.env.NODE_ENV === "development") {
      console.log(`[VAPIX] Fallback response from ${ipAddress}:\n${text.substring(0, 300)}`);
    }

    // Parse key=value response for uptime if available
    let uptime = 0;
    const uptimeMatch = text.match(/SystemUpTime=(\d+)/i);
    if (uptimeMatch) {
      uptime = parseInt(uptimeMatch[1]);
    }

    // Camera responded to param.cgi — it's alive and ready
    return {
      systemReady: true,
      uptime,
      bootId: "", // Not available via param.cgi
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Timeout after ${timeout}ms`);
    }
    throw error;
  }
}

async function checkAllCameras() {
  console.log("[Monitor] Starting camera polling cycle...");

  try {
    // Get all cameras from database
    const allCameras = await db.select().from(cameras);
    console.log(`[Monitor] Checking ${allCameras.length} cameras (concurrency: ${POLL_CONCURRENCY})`);

    // Collect results for batched DB writes
    const pendingEvents: InsertUptimeEvent[] = [];
    const pendingStatusUpdates: Array<{
      id: string;
      status: string;
      bootId?: string;
      lastSeenAt?: Date;
      videoStatus: string;
    }> = [];

    // Use p-limit to cap concurrent HTTP requests
    const promises = allCameras.map((camera) =>
      limit(async () => {
        const startTime = Date.now();

        try {
          const decryptedPassword = await decryptPassword(camera.encryptedPassword);

          const result = await pollCamera(
            camera.ipAddress,
            camera.username,
            decryptedPassword
          );

          // Lazy model detection (non-blocking)
          if (!camera.model) {
            const cached = detectionCache.get(camera.ipAddress, camera.username);

            if (cached) {
              try {
                await db.update(cameras)
                  .set({
                    model: cached.model,
                    series: cached.series,
                    numberOfViews: cached.numberOfViews,
                    capabilities: cached.capabilities,
                    updatedAt: new Date(),
                  })
                  .where(eq(cameras.id, camera.id));

                console.log(`[Monitor] ✓ Using cached model for ${camera.name}: ${cached.model} (${cached.series}-series)`);
              } catch (err: any) {
                console.warn(`[Monitor] ⚠ Failed to update cached model for ${camera.name}: ${err.message}`);
              }
            } else {
              detectCameraModel(camera.ipAddress, camera.username, decryptedPassword)
                .then(async (detection) => {
                  detectionCache.set(camera.ipAddress, camera.username, detection);

                  await db.update(cameras)
                    .set({
                      model: detection.model,
                      series: detection.series,
                      numberOfViews: detection.numberOfViews,
                      capabilities: detection.capabilities,
                      updatedAt: new Date(),
                    })
                    .where(eq(cameras.id, camera.id));

                  console.log(`[Monitor] ✓ Detected model for ${camera.name}: ${detection.model} (${detection.series}-series)`);

                  try {
                    const analyticsProbe = await probeAnalyticsCapabilities(
                      camera.ipAddress,
                      camera.username,
                      decryptedPassword
                    );
                    const hasAny = analyticsProbe.peopleCount || analyticsProbe.occupancyEstimation ||
                      analyticsProbe.lineCrossing || analyticsProbe.objectAnalytics ||
                      analyticsProbe.loiteringGuard || analyticsProbe.fenceGuard || analyticsProbe.motionGuard;
                    if (hasAny) {
                      await storage.updateCameraCapabilities(camera.id, {
                        analytics: {
                          ...detection.capabilities?.analytics,
                          peopleCount: analyticsProbe.peopleCount,
                          occupancyEstimation: analyticsProbe.occupancyEstimation,
                          lineCrossing: analyticsProbe.lineCrossing,
                          objectAnalytics: analyticsProbe.objectAnalytics,
                          loiteringGuard: analyticsProbe.loiteringGuard,
                          fenceGuard: analyticsProbe.fenceGuard,
                          motionGuard: analyticsProbe.motionGuard,
                          acapInstalled: analyticsProbe.acapInstalled,
                          objectAnalyticsScenarios: analyticsProbe.objectAnalyticsScenarios,
                          objectAnalyticsApiPath: analyticsProbe.objectAnalyticsApiPath,
                        },
                      }, true);
                    }
                  } catch (probeErr: any) {
                    console.warn(`[Monitor] ⚠ Analytics probe failed for ${camera.name}: ${probeErr.message}`);
                  }
                })
                .catch((err) => {
                  console.warn(`[Monitor] ⚠ Model detection failed for ${camera.name}: ${err.message}`);
                });
            }
          }

          // Detect reboot by comparing boot IDs
          const rebooted =
            camera.currentBootId && camera.currentBootId !== result.bootId;

          // Check video stream
          let videoStatus = "unknown";
          try {
            await checkVideoStream(
              camera.ipAddress,
              camera.username,
              decryptedPassword,
              getVideoEndpoint(camera),
              3000,
              getThumbnailResolution(camera)
            );

            videoStatus = "video_ok";

            console.log(
              `[Monitor] ✓ ${camera.name} (${camera.ipAddress}) - Online, Video OK ${rebooted ? "(REBOOTED)" : ""}`
            );
          } catch (videoError: any) {
            videoStatus = "video_failed";

            console.log(
              `[Monitor] ⚠ ${camera.name} (${camera.ipAddress}) - Online but Video FAILED: ${videoError.message}`
            );
          }

          // Collect for batch write (instead of individual DB calls)
          pendingStatusUpdates.push({
            id: camera.id,
            status: "online",
            bootId: result.bootId,
            lastSeenAt: new Date(),
            videoStatus,
          });

          pendingEvents.push({
            cameraId: camera.id,
            timestamp: new Date(),
            status: "online",
            uptimeSeconds: result.uptime,
            bootId: result.bootId,
            videoStatus,
            responseTimeMs: Date.now() - startTime,
          });

          // Historical uptime backfill (runs once per camera lifecycle)
          if (!camera.historyBackfilled && result.uptime > 0) {
            backfillFromUptimeSeconds(
              camera.id,
              new Date(),
              result.uptime,
              result.bootId
            ).then((backfilled) => {
              if (backfilled) {
                backfillFromSystemLog(
                  camera.id,
                  camera.ipAddress,
                  camera.username,
                  decryptedPassword
                ).catch(() => {});
              }
            }).catch(() => {});
          }
        } catch (error: any) {
          // Camera is offline or unreachable
          pendingStatusUpdates.push({
            id: camera.id,
            status: "offline",
            videoStatus: "unknown",
          });

          pendingEvents.push({
            cameraId: camera.id,
            timestamp: new Date(),
            status: "offline",
            videoStatus: "unknown",
            errorMessage: error.message,
            responseTimeMs: Date.now() - startTime,
          });

          console.log(
            `[Monitor] ✗ ${camera.name} (${camera.ipAddress}) - Offline: ${error.message}`
          );
        }
      })
    );

    await Promise.all(promises);

    // Batch write all status updates and uptime events
    if (pendingStatusUpdates.length > 0) {
      await storage.batchUpdateCameraStatuses(pendingStatusUpdates);
    }
    if (pendingEvents.length > 0) {
      await storage.createUptimeEventBatch(pendingEvents);
    }

    console.log(`[Monitor] Polling cycle complete (${pendingEvents.length} events batched)`);
  } catch (error) {
    console.error("[Monitor] Error during polling cycle:", error);
  }
}

// Number of cohorts to stagger across the 5-minute polling window
const NUM_COHORTS = 5;
const COHORT_STAGGER_MS = 60_000; // 60 seconds between cohorts

/**
 * Check a specific cohort of cameras (deterministic assignment by id hash).
 * Cameras are split into NUM_COHORTS groups so polling is spread across the 5-min window.
 */
async function checkCameraCohort(cohortIndex: number) {
  try {
    const allCameras = await db.select().from(cameras);
    // Assign cameras to cohorts deterministically using a simple hash of the ID
    const cohortCameras = allCameras.filter((cam) => {
      let hash = 0;
      for (let i = 0; i < cam.id.length; i++) {
        hash = ((hash << 5) - hash + cam.id.charCodeAt(i)) | 0;
      }
      return ((hash >>> 0) % NUM_COHORTS) === cohortIndex;
    });

    if (cohortCameras.length === 0) return;

    console.log(`[Monitor] Cohort ${cohortIndex}/${NUM_COHORTS - 1}: checking ${cohortCameras.length} cameras (concurrency: ${POLL_CONCURRENCY})`);

    const pendingEvents: InsertUptimeEvent[] = [];
    const pendingStatusUpdates: Array<{
      id: string;
      status: string;
      bootId?: string;
      lastSeenAt?: Date;
      videoStatus: string;
    }> = [];

    const promises = cohortCameras.map((camera) =>
      limit(async () => {
        const startTime = Date.now();

        try {
          const decryptedPassword = await decryptPassword(camera.encryptedPassword);
          const result = await pollCamera(camera.ipAddress, camera.username, decryptedPassword);

          // Lazy model detection (non-blocking)
          if (!camera.model) {
            const cached = detectionCache.get(camera.ipAddress, camera.username);
            if (cached) {
              try {
                await db.update(cameras)
                  .set({ model: cached.model, series: cached.series, numberOfViews: cached.numberOfViews, capabilities: cached.capabilities, updatedAt: new Date() })
                  .where(eq(cameras.id, camera.id));
              } catch (err: any) {
                console.warn(`[Monitor] ⚠ Failed to update cached model for ${camera.name}: ${err.message}`);
              }
            } else {
              detectCameraModel(camera.ipAddress, camera.username, decryptedPassword)
                .then(async (detection) => {
                  detectionCache.set(camera.ipAddress, camera.username, detection);
                  await db.update(cameras)
                    .set({ model: detection.model, series: detection.series, numberOfViews: detection.numberOfViews, capabilities: detection.capabilities, updatedAt: new Date() })
                    .where(eq(cameras.id, camera.id));
                  try {
                    const analyticsProbe = await probeAnalyticsCapabilities(camera.ipAddress, camera.username, decryptedPassword);
                    const hasAny = analyticsProbe.peopleCount || analyticsProbe.occupancyEstimation || analyticsProbe.lineCrossing || analyticsProbe.objectAnalytics || analyticsProbe.loiteringGuard || analyticsProbe.fenceGuard || analyticsProbe.motionGuard;
                    if (hasAny) {
                      await storage.updateCameraCapabilities(camera.id, { analytics: { ...detection.capabilities?.analytics, ...analyticsProbe } }, true);
                    }
                  } catch {}
                })
                .catch(() => {});
            }
          }

          const rebooted = camera.currentBootId && camera.currentBootId !== result.bootId;
          let videoStatus = "unknown";
          try {
            await checkVideoStream(camera.ipAddress, camera.username, decryptedPassword, getVideoEndpoint(camera), 3000, getThumbnailResolution(camera));
            videoStatus = "video_ok";
            console.log(`[Monitor] ✓ ${camera.name} (${camera.ipAddress}) - Online, Video OK ${rebooted ? "(REBOOTED)" : ""}`);
          } catch (videoError: any) {
            videoStatus = "video_failed";
            console.log(`[Monitor] ⚠ ${camera.name} (${camera.ipAddress}) - Online but Video FAILED: ${videoError.message}`);
          }

          pendingStatusUpdates.push({ id: camera.id, status: "online", bootId: result.bootId, lastSeenAt: new Date(), videoStatus });
          pendingEvents.push({ cameraId: camera.id, timestamp: new Date(), status: "online", uptimeSeconds: result.uptime, bootId: result.bootId, videoStatus, responseTimeMs: Date.now() - startTime });

          if (!camera.historyBackfilled && result.uptime > 0) {
            backfillFromUptimeSeconds(camera.id, new Date(), result.uptime, result.bootId)
              .then((backfilled) => { if (backfilled) backfillFromSystemLog(camera.id, camera.ipAddress, camera.username, decryptedPassword).catch(() => {}); })
              .catch(() => {});
          }
        } catch (error: any) {
          pendingStatusUpdates.push({ id: camera.id, status: "offline", videoStatus: "unknown" });
          pendingEvents.push({ cameraId: camera.id, timestamp: new Date(), status: "offline", videoStatus: "unknown", errorMessage: error.message, responseTimeMs: Date.now() - startTime });
          console.log(`[Monitor] ✗ ${camera.name} (${camera.ipAddress}) - Offline: ${error.message}`);
        }
      })
    );

    await Promise.all(promises);

    if (pendingStatusUpdates.length > 0) await storage.batchUpdateCameraStatuses(pendingStatusUpdates);
    if (pendingEvents.length > 0) await storage.createUptimeEventBatch(pendingEvents);

    console.log(`[Monitor] Cohort ${cohortIndex} complete (${pendingEvents.length} events)`);
  } catch (error) {
    console.error(`[Monitor] Error in cohort ${cohortIndex}:`, error);
  }
}

export function startCameraMonitoring() {
  console.log("[Monitor] Initializing camera monitoring service...");

  // Run initial full check 5 seconds after startup
  setTimeout(() => {
    checkAllCameras();
  }, 5000);

  // Schedule staggered polling: every 5 minutes, fire cohorts 60s apart
  cron.schedule("*/5 * * * *", () => {
    for (let cohort = 0; cohort < NUM_COHORTS; cohort++) {
      setTimeout(() => {
        checkCameraCohort(cohort);
      }, cohort * COHORT_STAGGER_MS);
    }
  });

  console.log(`[Monitor] Camera monitoring scheduled (every 5 minutes, ${NUM_COHORTS} staggered cohorts)`);
}

// Export for manual triggering (checks all cameras at once — used for initial poll and ad-hoc triggers)
export { checkAllCameras };
