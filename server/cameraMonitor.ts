import cron from "node-cron";
import { storage } from "./storage";
import { db } from "./db";
import { cameras } from "@shared/schema";
import { decryptPassword } from "./encryption";
import { detectCameraModel } from "./services/cameraDetection";
import { detectionCache } from "./services/detectionCache";
import { eq } from "drizzle-orm";
import { authFetch } from "./services/digestAuth";
import { backfillFromUptimeSeconds, backfillFromSystemLog } from "./services/historyBackfill";

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

  // M-series multi-sensor cameras may need camera parameter
  if (series === 'M' && camera.numberOfViews && camera.numberOfViews > 1) {
    return "/axis-cgi/jpg/image.cgi?camera=1"; // Default to first sensor
  }

  // All other models use standard endpoint
  return defaultEndpoint;
}

export async function checkVideoStream(
  ipAddress: string,
  username: string,
  password: string,
  endpoint: string = "/axis-cgi/jpg/image.cgi",
  timeout: number = 5000
): Promise<VideoCheckResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `http://${ipAddress}${endpoint}`;
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('image')) {
      throw new Error(`Unexpected content type: ${contentType} (expected image/*)`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
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
    throw error;
  }
}

async function pollCamera(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 5000
): Promise<SystemReadyResponse> {
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
    if (response.status === 404) {
      // Older firmware without systemready.cgi — fall back to param.cgi health check
      console.log(`[VAPIX] No systemready.cgi on ${ipAddress}, falling back to param.cgi`);
      return await pollCameraLegacyFallback(ipAddress, username, password, timeout);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    
    // Log raw response for debugging (first time only per camera)
    if (process.env.NODE_ENV === "development") {
      console.log(`[VAPIX] Raw response from ${ipAddress}:\n${text.substring(0, 500)}`);
    }

    // Detect JSON response (modern VAPIX API v1.4+)
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      console.log(`[VAPIX] Detected JSON API on ${ipAddress}, retrying with JSON POST`);
      return await pollCameraJsonApi(ipAddress, username, password, timeout);
    }

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
    console.log(`[Monitor] Checking ${allCameras.length} cameras`);

    const promises = allCameras.map(async (camera) => {
      const startTime = Date.now();

      try {
        const decryptedPassword = await decryptPassword(camera.encryptedPassword);
        
        const result = await pollCamera(
          camera.ipAddress,
          camera.username,
          decryptedPassword
        );

        // Lazy model detection (non-blocking)
        // Only detect if model is not already known
        if (!camera.model) {
          // Check cache first to avoid redundant API calls
          const cached = detectionCache.get(camera.ipAddress, camera.username);

          if (cached) {
            // Use cached result
            try {
              // TODO: Backend developer - Add storage.updateCameraModel() method
              // For now, update directly via Drizzle
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
            // Detect model asynchronously (don't block polling cycle)
            detectCameraModel(camera.ipAddress, camera.username, decryptedPassword)
              .then(async (detection) => {
                // Store in cache
                detectionCache.set(camera.ipAddress, camera.username, detection);

                // Update database
                // TODO: Backend developer - Add storage.updateCameraModel() method
                // For now, update directly via Drizzle
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
              })
              .catch((err) => {
                console.warn(`[Monitor] ⚠ Model detection failed for ${camera.name}: ${err.message}`);
              });
          }
        }

        // Detect reboot by comparing boot IDs
        const rebooted =
          camera.currentBootId && camera.currentBootId !== result.bootId;

        // Update camera status
        await storage.updateCameraStatus(
          camera.id,
          "online",
          result.bootId,
          new Date()
        );

        // Check video stream
        let videoStatus = "unknown";
        try {
          await checkVideoStream(
            camera.ipAddress,
            camera.username,
            decryptedPassword,
            getVideoEndpoint(camera),
            3000 // Shorter timeout for video check
          );

          videoStatus = "video_ok";
          await storage.updateVideoStatus(camera.id, videoStatus);

          console.log(
            `[Monitor] ✓ ${camera.name} (${camera.ipAddress}) - Online, Video OK ${rebooted ? "(REBOOTED)" : ""}`
          );
        } catch (videoError: any) {
          videoStatus = "video_failed";
          await storage.updateVideoStatus(camera.id, videoStatus);

          console.log(
            `[Monitor] ⚠ ${camera.name} (${camera.ipAddress}) - Online but Video FAILED: ${videoError.message}`
          );
        }

        // Record single combined uptime event (system + video status)
        await storage.createUptimeEvent({
          cameraId: camera.id,
          timestamp: new Date(),
          status: "online",
          uptimeSeconds: result.uptime,
          bootId: result.bootId,
          videoStatus,
          responseTimeMs: Date.now() - startTime,
        });

        // Historical uptime backfill (runs once per camera lifecycle)
        // Uses camera-reported uptimeSeconds to create synthetic boot event
        if (!camera.historyBackfilled && result.uptime > 0) {
          backfillFromUptimeSeconds(
            camera.id,
            new Date(),
            result.uptime,
            result.bootId
          ).then((backfilled) => {
            if (backfilled) {
              // Also try to get system log for historical reboots (non-blocking)
              backfillFromSystemLog(
                camera.id,
                camera.ipAddress,
                camera.username,
                decryptedPassword
              ).catch(() => {}); // System log is best-effort
            }
          }).catch(() => {}); // Backfill is non-blocking
        }
      } catch (error: any) {
        // Camera is offline or unreachable
        await storage.updateCameraStatus(camera.id, "offline");
        await storage.updateVideoStatus(camera.id, "unknown"); // Can't check video if camera is offline

        await storage.createUptimeEvent({
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
    });

    await Promise.all(promises);
    console.log("[Monitor] Polling cycle complete");
  } catch (error) {
    console.error("[Monitor] Error during polling cycle:", error);
  }
}

export function startCameraMonitoring() {
  console.log("[Monitor] Initializing camera monitoring service...");

  // Run initial check immediately
  setTimeout(() => {
    checkAllCameras();
  }, 5000); // Wait 5 seconds after startup

  // Schedule polling every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    checkAllCameras();
  });

  console.log("[Monitor] Camera monitoring scheduled (every 5 minutes)");
}

// Export for manual triggering
export { checkAllCameras };
