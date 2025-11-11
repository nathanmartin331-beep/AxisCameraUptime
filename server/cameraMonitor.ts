import cron from "node-cron";
import { storage } from "./storage";
import { db } from "./db";
import { cameras } from "@shared/schema";
import { decryptPassword } from "./encryption";

interface SystemReadyResponse {
  systemReady: boolean;
  uptime: number;
  bootId: string;
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
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    
    // Log raw response for debugging (first time only per camera)
    if (process.env.NODE_ENV === "development") {
      console.log(`[VAPIX] Raw response from ${ipAddress}:\n${text.substring(0, 500)}`);
    }

    // Validate response contains expected VAPIX format
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

        const responseTime = Date.now() - startTime;

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

        // Record uptime event
        await storage.createUptimeEvent({
          cameraId: camera.id,
          timestamp: new Date(),
          status: "online",
          uptimeSeconds: result.uptime,
          bootId: result.bootId,
          responseTimeMs: responseTime,
        });

        console.log(
          `[Monitor] ✓ ${camera.name} (${camera.ipAddress}) - Online ${rebooted ? "(REBOOTED)" : ""}`
        );
      } catch (error: any) {
        // Camera is offline or unreachable
        await storage.updateCameraStatus(camera.id, "offline");

        await storage.createUptimeEvent({
          cameraId: camera.id,
          timestamp: new Date(),
          status: "offline",
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
