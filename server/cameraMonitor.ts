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
import { buildCameraUrl, getCameraDispatcher, getConnectionInfo, captureSslFingerprint, type CameraConnectionInfo } from "./services/cameraUrl";
import { backfillFromUptimeSeconds, backfillFromSystemLog, backfillFromTvpcHistory } from "./services/historyBackfill";
import { probeAnalyticsCapabilities } from "./services/analyticsPoller";
import { lookupAxisEolWithFetch } from "./services/axisEolData";
import { statusBroadcaster } from "./services/statusBroadcaster";
import type { InsertUptimeEvent } from "@shared/schema";

// Configurable concurrency for HTTP polling (default 25 parallel requests)
const POLL_CONCURRENCY = parseInt(process.env.POLL_CONCURRENCY || "25", 10);
const limit = pLimit(POLL_CONCURRENCY);

// Cache the VAPIX protocol variant per camera IP to avoid redundant GET→POST retries.
// "json" = modern JSON POST API, "legacy" = key=value GET, "param" = param.cgi fallback
const protocolCache = new Map<string, "json" | "legacy" | "param">();
const PROTOCOL_CACHE_MAX_SIZE = 5000;

function protocolCacheSet(key: string, value: "json" | "legacy" | "param") {
  if (protocolCache.size >= PROTOCOL_CACHE_MAX_SIZE) {
    console.warn(`[Monitor] protocolCache exceeded ${PROTOCOL_CACHE_MAX_SIZE} entries, clearing`);
    protocolCache.clear();
  }
  protocolCache.set(key, value);
}

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
  thumbnailResolution: string = "160x90",
  conn?: CameraConnectionInfo
): Promise<VideoCheckResponse> {
  const dispatcher = getCameraDispatcher(conn);

  // Try with thumbnail resolution first, then fall back to no resolution param
  const separator = endpoint.includes('?') ? '&' : '?';
  const thumbnailUrl = buildCameraUrl(ipAddress, `${endpoint}${separator}resolution=${thumbnailResolution}`, conn);
  const fallbackUrl = buildCameraUrl(ipAddress, endpoint, conn);

  for (const url of [thumbnailUrl, fallbackUrl]) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const startTime = Date.now();

      const response = await authFetch(url, username, password, {
        signal: controller.signal,
        dispatcher,
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
          const legacyUrl = buildCameraUrl(ipAddress, "/jpg/image.jpg", conn);
          const legacyController = new AbortController();
          const legacyTimeoutId = setTimeout(() => legacyController.abort(), timeout);
          const legacyStart = Date.now();
          const legacyResponse = await authFetch(legacyUrl, username, password, { signal: legacyController.signal, dispatcher });
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
  timeout: number = 5000,
  conn?: CameraConnectionInfo
): Promise<SystemReadyResponse> {
  const dispatcher = getCameraDispatcher(conn);

  // Fast path: if we already know this camera's protocol, skip discovery
  const knownProtocol = protocolCache.get(ipAddress);
  if (knownProtocol === "json") {
    return await pollCameraJsonApi(ipAddress, username, password, timeout, conn);
  }
  if (knownProtocol === "param") {
    return await pollCameraLegacyFallback(ipAddress, username, password, timeout, conn);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = buildCameraUrl(ipAddress, "/axis-cgi/systemready.cgi", conn);
    const startTime = Date.now();

    // VAPIX Systemready API doesn't require authentication
    const fetchOpts: any = {
      signal: controller.signal,
      headers: {
        "User-Agent": "AxisCameraMonitor/1.0",
      },
    };
    if (dispatcher) fetchOpts.dispatcher = dispatcher;

    const response = await fetch(url, fetchOpts);

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    // Check HTTP status
    if (response.status === 404 || response.status === 500) {
      // Older firmware without systemready.cgi, or server error — fall back to param.cgi
      console.log(`[VAPIX] systemready.cgi returned ${response.status} on ${ipAddress}, caching param.cgi fallback`);
      protocolCacheSet(ipAddress, "param");
      return await pollCameraLegacyFallback(ipAddress, username, password, timeout, conn);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const trimmed = text.trim();

    // Guard against HTML responses (misconfigured device or web UI redirect)
    if (trimmed.startsWith('<') || (response.headers.get('content-type') || '').includes('text/html')) {
      console.log(`[VAPIX] HTML response from systemready.cgi on ${ipAddress}, falling back to param.cgi`);
      protocolCacheSet(ipAddress, "param");
      return await pollCameraLegacyFallback(ipAddress, username, password, timeout, conn);
    }

    // Detect JSON response (modern VAPIX API v1.2+/v1.4+)
    if (trimmed.startsWith('{')) {
      console.log(`[VAPIX] Detected JSON API on ${ipAddress}, caching for future polls`);
      protocolCacheSet(ipAddress, "json");
      return await pollCameraJsonApi(ipAddress, username, password, timeout, conn);
    }

    // This is a legacy key=value camera — cache it
    protocolCacheSet(ipAddress, "legacy");

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
  timeout: number = 5000,
  conn?: CameraConnectionInfo
): Promise<SystemReadyResponse> {
  const dispatcher = getCameraDispatcher(conn);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = buildCameraUrl(ipAddress, "/axis-cgi/systemready.cgi", conn);

    const fetchOpts: any = {
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
    };
    if (dispatcher) fetchOpts.dispatcher = dispatcher;

    const response = await fetch(url, fetchOpts);

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
  timeout: number = 5000,
  conn?: CameraConnectionInfo
): Promise<SystemReadyResponse> {
  const dispatcher = getCameraDispatcher(conn);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Try param.cgi which most Axis cameras support (even very old firmware)
    const url = buildCameraUrl(ipAddress, "/axis-cgi/param.cgi?action=list&group=root.Properties.System", conn);

    const response = await authFetch(url, username, password, {
      signal: controller.signal,
      dispatcher,
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

/** Result of polling a single camera, ready for batch DB writes. */
interface PollResult {
  pendingEvent: InsertUptimeEvent;
  statusUpdate: {
    id: string;
    status: string;
    bootId?: string;
    lastSeenAt?: Date;
    videoStatus: string;
  };
}

/**
 * Poll a single camera: decrypt password, check system status, detect model,
 * probe analytics, check video stream, and trigger history backfill.
 *
 * Returns the pending uptime event and status update for batch writing.
 * Throws if the camera is unreachable (caller handles offline recording).
 *
 * Background tasks (model detection, analytics probe, history backfill) are
 * fire-and-forget but log warnings on failure rather than swallowing errors.
 */
async function pollSingleCamera(camera: any, conn: CameraConnectionInfo): Promise<PollResult> {
  const startTime = Date.now();

  const decryptedPassword = await decryptPassword(camera.encryptedPassword);

  const result = await pollCamera(
    camera.ipAddress,
    camera.username,
    decryptedPassword,
    5000,
    conn
  );

  // Model detection — awaited so series is known before the video check.
  // Without this, C-series speakers would fail the video check on their first poll
  // because series is null and the non-video-device guard wouldn't trigger.
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

        // Update the local camera object so the video check uses the correct series
        camera.model = cached.model;
        camera.series = cached.series;
        camera.numberOfViews = cached.numberOfViews;

        console.log(`[Monitor] Using cached model for ${camera.name}: ${cached.model} (${cached.series}-series)`);

        // Lifecycle lookup for cached models too (fire-and-forget)
        if (!camera.capabilities?.lifecycle) {
          lookupAxisEolWithFetch(cached.model).then(async (eolData) => {
            if (eolData) {
              await storage.updateCameraCapabilities(camera.id, {
                lifecycle: {
                  status: eolData.status,
                  statusLabel: eolData.statusLabel,
                  discontinuedDate: eolData.discontinuedDate || null,
                  endOfHardwareSupport: eolData.endOfHardwareSupport || null,
                  endOfSoftwareSupport: eolData.endOfSoftwareSupport || null,
                  replacementModel: eolData.replacementModel || null,
                  lastChecked: new Date().toISOString(),
                },
              }, true);
              console.log(`[Monitor] Lifecycle for ${camera.name} (${cached.model}): ${eolData.statusLabel}`);
            }
          }).catch(() => { /* silent */ });
        }
      } catch (err: any) {
        console.warn(`[Monitor] Failed to update cached model for ${camera.name}: ${err.message}`);
      }
    } else {
      try {
        const detection = await detectCameraModel(camera.ipAddress, camera.username, decryptedPassword, undefined, conn);
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

        // Update local camera object
        camera.model = detection.model;
        camera.series = detection.series;
        camera.numberOfViews = detection.numberOfViews;

        console.log(`[Monitor] Detected model for ${camera.name}: ${detection.model} (${detection.series}-series)`);

        // Lifecycle lookup (fire-and-forget) — runs for all detected models
        lookupAxisEolWithFetch(detection.model).then(async (eolData) => {
          if (eolData) {
            await storage.updateCameraCapabilities(camera.id, {
              lifecycle: {
                status: eolData.status,
                statusLabel: eolData.statusLabel,
                discontinuedDate: eolData.discontinuedDate || null,
                endOfHardwareSupport: eolData.endOfHardwareSupport || null,
                endOfSoftwareSupport: eolData.endOfSoftwareSupport || null,
                replacementModel: eolData.replacementModel || null,
                lastChecked: new Date().toISOString(),
              },
            }, true);
            console.log(`[Monitor] Lifecycle for ${camera.name} (${detection.model}): ${eolData.statusLabel}`);
          }
        }).catch((err: any) => {
          console.warn(`[Monitor] Lifecycle lookup failed for ${camera.name}: ${err.message}`);
        });

        // Analytics probe (fire-and-forget — not needed before video check)
        probeAnalyticsCapabilities(
          camera.ipAddress,
          camera.username,
          decryptedPassword,
          conn
        ).then(async (analyticsProbe) => {
          const hasAny = analyticsProbe.peopleCount || analyticsProbe.occupancyEstimation ||
            analyticsProbe.lineCrossing || analyticsProbe.objectAnalytics ||
            analyticsProbe.loiteringGuard || analyticsProbe.fenceGuard || analyticsProbe.motionGuard ||
            analyticsProbe.tvpcAvailable;
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
                tvpcAvailable: analyticsProbe.tvpcAvailable || false,
                tvpcCounterConfig: analyticsProbe.tvpcCounterConfig,
              },
            }, true);

            // TVPC history backfill (fire-and-forget, same pattern as uptime backfill)
            if (analyticsProbe.tvpcAvailable) {
              backfillFromTvpcHistory(
                camera.id,
                camera.ipAddress,
                camera.username,
                decryptedPassword,
                getConnectionInfo(camera)
              ).then((count) => {
                if (count > 0) {
                  console.log(`[Monitor] TVPC backfill complete for ${camera.name}: ${count} hourly rows imported`);
                }
              }).catch((err: any) => {
                console.warn(`[Monitor] TVPC backfill failed for ${camera.name}: ${err.message}`);
              });
            }
          }
        }).catch((probeErr: any) => {
          console.warn(`[Monitor] Analytics probe failed for ${camera.name}: ${probeErr.message}`);
        });
      } catch (err: any) {
        console.warn(`[Monitor] Model detection failed for ${camera.name}: ${err.message}`);
      }
    }
  }

  // Lifecycle lookup for cameras that already have a model but missing lifecycle data.
  // The block above only runs for cameras without a model (first detection).
  // This catches all existing cameras that were detected before the lifecycle feature was added.
  if (camera.model && !camera.capabilities?.lifecycle) {
    lookupAxisEolWithFetch(camera.model).then(async (eolData) => {
      if (eolData) {
        await storage.updateCameraCapabilities(camera.id, {
          lifecycle: {
            status: eolData.status,
            statusLabel: eolData.statusLabel,
            discontinuedDate: eolData.discontinuedDate || null,
            endOfHardwareSupport: eolData.endOfHardwareSupport || null,
            endOfSoftwareSupport: eolData.endOfSoftwareSupport || null,
            replacementModel: eolData.replacementModel || null,
            lastChecked: new Date().toISOString(),
          },
        }, true);
        console.log(`[Monitor] Lifecycle for ${camera.name} (${camera.model}): ${eolData.statusLabel}`);
      }
    }).catch(() => { /* silent */ });
  }

  // Detect reboot by comparing boot IDs
  const rebooted =
    camera.currentBootId && camera.currentBootId !== result.bootId;

  // Check video stream (skip for non-video devices like C-series speakers)
  let videoStatus = "unknown";
  const isNonVideoDevice = camera.series === 'C'; // C-series = network speakers
  if (isNonVideoDevice) {
    videoStatus = "not_applicable";
    console.log(
      `[Monitor] ${camera.name} (${camera.ipAddress}) - Online, Non-video device (${camera.series}-series) ${rebooted ? "(REBOOTED)" : ""}`
    );
  } else {
    try {
      await checkVideoStream(
        camera.ipAddress,
        camera.username,
        decryptedPassword,
        getVideoEndpoint(camera),
        3000,
        getThumbnailResolution(camera),
        conn
      );

      videoStatus = "video_ok";

      console.log(
        `[Monitor] ${camera.name} (${camera.ipAddress}) - Online, Video OK ${rebooted ? "(REBOOTED)" : ""}`
      );
    } catch (videoError: any) {
      videoStatus = "video_failed";

      // Self-healing: if video fails on HTTPS, try HTTP to detect a bad auto-migration
      if (conn.protocol === "https") {
        try {
          const httpConn: CameraConnectionInfo = { protocol: "http", port: 80, verifySslCert: false };
          await checkVideoStream(
            camera.ipAddress,
            camera.username,
            decryptedPassword,
            getVideoEndpoint(camera),
            3000,
            getThumbnailResolution(camera),
            httpConn
          );

          // HTTP video works — revert this camera to HTTP
          videoStatus = "video_ok";
          await db.update(cameras)
            .set({ protocol: "http", port: 80, updatedAt: new Date() })
            .where(eq(cameras.id, camera.id));
          console.log(
            `[Monitor] ${camera.name} (${camera.ipAddress}) - Online, Video OK (reverted to HTTP — HTTPS video broken)`
          );
        } catch {
          // HTTP video also fails — genuine video issue
          console.log(
            `[Monitor] ${camera.name} (${camera.ipAddress}) - Online but Video FAILED: ${videoError.message}`
          );
        }
      } else {
        console.log(
          `[Monitor] ${camera.name} (${camera.ipAddress}) - Online but Video FAILED: ${videoError.message}`
        );
      }
    }
  }

  // Historical uptime backfill (runs once per camera lifecycle, fire-and-forget)
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
          decryptedPassword,
          conn
        ).catch((err) => {
          console.warn(`[Monitor] System log backfill failed for ${camera.name}: ${err.message}`);
        });
      }
    }).catch((err) => {
      console.warn(`[Monitor] Uptime backfill failed for ${camera.name}: ${err.message}`);
    });
  }

  // TOFU SSL fingerprint capture/verification (HTTPS cameras only, fire-and-forget)
  if (conn.protocol === "https") {
    const port = conn.port || 443;
    captureSslFingerprint(camera.ipAddress, port).then(async (fingerprint) => {
      if (!fingerprint) return;
      const now = new Date();

      if (!camera.sslFingerprint) {
        // First connection — trust on first use
        await db.update(cameras)
          .set({
            sslFingerprint: fingerprint,
            sslFingerprintFirstSeen: now,
            sslFingerprintLastVerified: now,
            updatedAt: now,
          })
          .where(eq(cameras.id, camera.id));
        console.log(`[Monitor] TOFU: pinned SSL cert for ${camera.name} (${fingerprint.substring(0, 16)}...)`);
      } else if (camera.sslFingerprint === fingerprint) {
        // Same cert — update last verified timestamp
        await db.update(cameras)
          .set({ sslFingerprintLastVerified: now, updatedAt: now })
          .where(eq(cameras.id, camera.id));
      } else {
        // Fingerprint changed — check if camera rebooted (cert regenerated)
        const rebooted = camera.currentBootId && camera.currentBootId !== result.bootId;
        if (rebooted) {
          // Accept new cert after reboot (Axis cameras may regenerate self-signed certs)
          await db.update(cameras)
            .set({
              sslFingerprint: fingerprint,
              sslFingerprintFirstSeen: now,
              sslFingerprintLastVerified: now,
              updatedAt: now,
            })
            .where(eq(cameras.id, camera.id));
          console.log(`[Monitor] TOFU: cert changed after reboot for ${camera.name}, re-pinned (${fingerprint.substring(0, 16)}...)`);
        } else {
          // Cert changed without reboot — potential MITM, log warning
          console.warn(
            `[Monitor] TOFU WARNING: SSL cert changed for ${camera.name} (${camera.ipAddress}) without reboot! ` +
            `Old: ${camera.sslFingerprint.substring(0, 16)}... New: ${fingerprint.substring(0, 16)}...`
          );
        }
      }
    }).catch((err: any) => {
      // Non-fatal — fingerprint capture is best-effort
      console.debug(`[Monitor] TOFU fingerprint capture failed for ${camera.name}: ${err.message}`);
    });
  }

  return {
    pendingEvent: {
      cameraId: camera.id,
      timestamp: new Date(),
      status: "online",
      uptimeSeconds: result.uptime,
      bootId: result.bootId,
      videoStatus,
      responseTimeMs: Date.now() - startTime,
    },
    statusUpdate: {
      id: camera.id,
      status: "online",
      bootId: result.bootId,
      lastSeenAt: new Date(),
      videoStatus,
    },
  };
}

/**
 * Poll a single camera with HTTP↔HTTPS auto-fallback.
 * On success, pushes result to pendingEvents/pendingStatusUpdates arrays.
 * On failure (both protocols), records camera as offline.
 */
async function pollCameraWithFallback(
  camera: any,
  pendingEvents: InsertUptimeEvent[],
  pendingStatusUpdates: PollResult["statusUpdate"][]
): Promise<void> {
  const startTime = Date.now();
  try {
    const conn = getConnectionInfo(camera);
    const result = await pollSingleCamera(camera, conn);
    pendingStatusUpdates.push(result.statusUpdate);
    pendingEvents.push(result.pendingEvent);
  } catch (error: any) {
    const conn = getConnectionInfo(camera);

    // Auto-fallback: if camera is on HTTP and unreachable, try HTTPS
    if (conn.protocol === "http") {
      try {
        const httpsConn: CameraConnectionInfo = { protocol: "https", port: 443, verifySslCert: false };
        const result = await pollSingleCamera(camera, httpsConn);

        if (result.pendingEvent.videoStatus === "video_ok" || result.pendingEvent.videoStatus === "not_applicable") {
          await db.update(cameras)
            .set({ protocol: "https", port: 443, updatedAt: new Date() })
            .where(eq(cameras.id, camera.id));
          console.log(`[Monitor] ${camera.name} (${camera.ipAddress}) - Auto-migrated to HTTPS`);
          protocolCache.delete(camera.ipAddress);
        } else {
          console.log(`[Monitor] ${camera.name} (${camera.ipAddress}) - HTTPS reachable but video failed, keeping HTTP`);
        }

        pendingStatusUpdates.push(result.statusUpdate);
        pendingEvents.push(result.pendingEvent);
        return;
      } catch {
        // HTTPS also failed — fall through to offline
      }
    }

    // Self-healing: if camera was auto-migrated to HTTPS but is now unreachable, try HTTP
    if (conn.protocol === "https") {
      try {
        const httpConn: CameraConnectionInfo = { protocol: "http", port: 80, verifySslCert: false };
        const result = await pollSingleCamera(camera, httpConn);

        if (result.pendingEvent.videoStatus === "video_ok" || result.pendingEvent.videoStatus === "not_applicable") {
          await db.update(cameras)
            .set({ protocol: "http", port: 80, updatedAt: new Date() })
            .where(eq(cameras.id, camera.id));
          console.log(`[Monitor] ${camera.name} (${camera.ipAddress}) - Reverted to HTTP (HTTPS unreachable)`);
          protocolCache.delete(camera.ipAddress);
        }

        pendingStatusUpdates.push(result.statusUpdate);
        pendingEvents.push(result.pendingEvent);
        return;
      } catch {
        // HTTP also failed — fall through to offline
      }
    }

    // Camera is offline or unreachable on both protocols
    pendingStatusUpdates.push({ id: camera.id, status: "offline", videoStatus: "unknown" });
    pendingEvents.push({
      cameraId: camera.id,
      timestamp: new Date(),
      status: "offline",
      videoStatus: "unknown",
      errorMessage: error.message,
      responseTimeMs: Date.now() - startTime,
    });
    console.log(`[Monitor] ${camera.name} (${camera.ipAddress}) - Offline: ${error.message}`);
  }
}

/**
 * Broadcast SSE notifications for any status changes detected in this polling cycle.
 */
function broadcastStatusChanges(
  camerasPolled: any[],
  previousStatuses: Map<string, string>,
  pendingStatusUpdates: PollResult["statusUpdate"][]
) {
  for (const update of pendingStatusUpdates) {
    const oldStatus = previousStatuses.get(update.id) || "unknown";
    const newStatus = update.status;
    if (oldStatus !== newStatus) {
      const cam = camerasPolled.find(c => c.id === update.id);
      statusBroadcaster.broadcast({
        cameraId: update.id,
        cameraName: cam?.name || update.id,
        oldStatus,
        newStatus,
        timestamp: new Date().toISOString(),
        message: `${cam?.name || update.id} changed from ${oldStatus} to ${newStatus}`,
      });
    }
  }
}

async function checkAllCameras() {
  console.log("[Monitor] Starting camera polling cycle...");

  try {
    const allCameras = await db.select().from(cameras);
    console.log(`[Monitor] Checking ${allCameras.length} cameras (concurrency: ${POLL_CONCURRENCY})`);

    // Capture previous statuses for status change detection
    const previousStatuses = new Map<string, string>();
    for (const cam of allCameras) {
      previousStatuses.set(cam.id, cam.currentStatus || "unknown");
    }

    const pendingEvents: InsertUptimeEvent[] = [];
    const pendingStatusUpdates: PollResult["statusUpdate"][] = [];

    const promises = allCameras.map((camera) =>
      limit(() => pollCameraWithFallback(camera, pendingEvents, pendingStatusUpdates))
    );

    await Promise.all(promises);

    if (pendingStatusUpdates.length > 0) {
      await storage.batchUpdateCameraStatuses(pendingStatusUpdates);
    }
    if (pendingEvents.length > 0) {
      await storage.createUptimeEventBatch(pendingEvents);
    }

    broadcastStatusChanges(allCameras, previousStatuses, pendingStatusUpdates);

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
    const cohortCameras = allCameras.filter((cam) => {
      let hash = 0;
      for (let i = 0; i < cam.id.length; i++) {
        hash = ((hash << 5) - hash + cam.id.charCodeAt(i)) | 0;
      }
      return ((hash >>> 0) % NUM_COHORTS) === cohortIndex;
    });

    if (cohortCameras.length === 0) return;

    console.log(`[Monitor] Cohort ${cohortIndex}/${NUM_COHORTS - 1}: checking ${cohortCameras.length} cameras (concurrency: ${POLL_CONCURRENCY})`);

    const previousStatuses = new Map<string, string>();
    for (const cam of cohortCameras) {
      previousStatuses.set(cam.id, cam.currentStatus || "unknown");
    }

    const pendingEvents: InsertUptimeEvent[] = [];
    const pendingStatusUpdates: PollResult["statusUpdate"][] = [];

    const promises = cohortCameras.map((camera) =>
      limit(() => pollCameraWithFallback(camera, pendingEvents, pendingStatusUpdates))
    );

    await Promise.all(promises);

    if (pendingStatusUpdates.length > 0) await storage.batchUpdateCameraStatuses(pendingStatusUpdates);
    if (pendingEvents.length > 0) await storage.createUptimeEventBatch(pendingEvents);

    broadcastStatusChanges(cohortCameras, previousStatuses, pendingStatusUpdates);

    console.log(`[Monitor] Cohort ${cohortIndex} complete (${pendingEvents.length} events)`);
  } catch (error) {
    console.error(`[Monitor] Error in cohort ${cohortIndex}:`, error);
  }
}

let cameraMonitoringStarted = false;

export function startCameraMonitoring() {
  if (cameraMonitoringStarted) {
    console.log("[Monitor] Monitoring service already running, skipping duplicate start");
    return;
  }
  cameraMonitoringStarted = true;

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
