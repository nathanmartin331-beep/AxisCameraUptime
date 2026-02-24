import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";
import { storage } from "./storage";
import { sqlite } from "./db";
import { requireAuth, requireAdmin } from "./auth";
import { encryptPassword } from "./encryption";
import { checkAllCameras } from "./cameraMonitor";
import { insertCameraSchema, type Camera } from "@shared/schema";
import { calculateUptimeFromEvents } from "./uptimeCalculator";
import { buildCameraUrl, getCameraDispatcher, getConnectionInfo } from "./services/cameraUrl";
import type { SafeUser } from "./storage";
import { z } from "zod";
import { analyticsBroadcaster } from "./services/analyticsEventBroadcaster";

// ===== Input Validation & Sanitization Helpers =====

/** Validate that a route param ID is a non-empty trimmed string */
function validateId(id: unknown): string | null {
  if (typeof id !== "string" || id.trim().length === 0) return null;
  const trimmed = id.trim();
  // Reject IDs with suspicious characters (only allow alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  // Reject excessively long IDs
  if (trimmed.length > 128) return null;
  return trimmed;
}

/** Parse and validate a 'days' query parameter. Returns validated number or default. */
function validateDays(raw: unknown, defaultVal = 30): number | { error: string } {
  if (raw === undefined || raw === null || raw === "") return defaultVal;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return { error: "days must be an integer between 1 and 365" };
  }
  return parsed;
}

/** Sanitize a string input: trim and reject dangerous patterns */
function sanitizeString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  // Reject empty strings after trim
  if (trimmed.length === 0) return null;
  // Reject excessively long strings (general limit)
  if (trimmed.length > 10000) return null;
  return trimmed;
}

/** Send a consistent error response */
function sendError(res: Response, status: number, message: string) {
  return res.status(status).json({ message, error: message });
}

// Dashboard response cache — serves stale data for up to 30s to avoid 7500+ queries per request
const dashboardCache = new Map<string, { data: any; expiresAt: number }>();
const DASHBOARD_CACHE_TTL_MS = 30_000; // 30 seconds
const DASHBOARD_CACHE_MAX_SIZE = 1000;

/** Evict expired entries from dashboardCache; if still over max, clear entirely. */
function dashboardCacheSet(key: string, value: { data: any; expiresAt: number }) {
  if (dashboardCache.size >= DASHBOARD_CACHE_MAX_SIZE) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    dashboardCache.forEach((v, k) => {
      if (v.expiresAt <= now) {
        keysToDelete.push(k);
      }
    });
    keysToDelete.forEach((k) => dashboardCache.delete(k));
    // If still over limit after evicting expired entries, clear entirely
    if (dashboardCache.size >= DASHBOARD_CACHE_MAX_SIZE) {
      dashboardCache.clear();
    }
  }
  dashboardCache.set(key, value);
}

// Schema for accepting plain password from frontend (used for both manual add and CSV import)
// Frontend doesn't send userId or encryptedPassword - userId comes from session, password is encrypted server-side
const createCameraSchema = insertCameraSchema
  .omit({ encryptedPassword: true, userId: true })
  .extend({
    password: z.string().min(1, "Password is required"),
  });

// Allowed fields for camera PATCH updates
const ALLOWED_CAMERA_UPDATE_FIELDS = new Set([
  "name", "ipAddress", "username", "password", "location", "notes",
  "currentStatus", "videoStatus", "model", "series", "capabilities",
  "protocol", "port", "verifySslCert",
]);

export async function registerRoutes(app: Express): Promise<Server> {
  // Get current user helper
  function getUserId(req: any): string {
    return (req.user as SafeUser).id;
  }

  // Camera CRUD routes
  app.get("/api/cameras", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { model, hasPTZ, hasAudio } = req.query;

      let cameras;

      // Filter by model
      if (model && typeof model === 'string') {
        cameras = await storage.getCamerasByModel(model, userId);
      }
      // Filter by PTZ capability
      else if (hasPTZ === 'true') {
        cameras = await storage.getCamerasByCapability('hasPTZ', undefined, userId);
      }
      // Filter by audio capability
      else if (hasAudio === 'true') {
        cameras = await storage.getCamerasByCapability('hasAudio', undefined, userId);
      }
      // Default: return all cameras
      else {
        cameras = await storage.getCamerasByUserId(userId);
      }

      // Don't send encrypted passwords to frontend
      const safeCameras = cameras.map(({ encryptedPassword, ...camera }) => camera);
      res.json(safeCameras);
    } catch (error) {
      console.error("Error fetching cameras:", error);
      sendError(res, 500, "Failed to fetch cameras");
    }
  });

  app.get("/api/cameras/:id", requireAuth, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const camera = await storage.getCameraById(cameraId);

      if (!camera) {
        return sendError(res, 404, "Camera not found");
      }

      // Verify ownership
      if (camera.userId !== getUserId(req)) {
        return sendError(res, 403, "Forbidden");
      }

      const { encryptedPassword, ...safeCamera } = camera;
      res.json(safeCamera);
    } catch (error) {
      console.error("Error fetching camera:", error);
      sendError(res, 500, "Failed to fetch camera");
    }
  });

  app.post("/api/cameras", requireAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      if (!req.body || typeof req.body !== "object") {
        return sendError(res, 400, "Request body is required");
      }

      // Use createCameraSchema to accept plain password
      const validatedData = createCameraSchema.parse(req.body);

      // Encrypt password before storing
      const encryptedPassword = await encryptPassword(validatedData.password);

      // Remove plaintext password and add encrypted version
      const { password, ...cameraData } = validatedData;

      const camera = await storage.createCamera({
        ...cameraData,
        userId,
        encryptedPassword,
      });

      const { encryptedPassword: _, ...safeCamera } = camera;
      res.status(201).json(safeCamera);

      // Invalidate dashboard cache for this user
      dashboardCache.delete(`dashboard:${userId}`);

      // Trigger immediate poll so the new camera's status updates quickly
      setTimeout(() => checkAllCameras(), 2000);
    } catch (error: any) {
      console.error("Error creating camera:", error);
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0].message);
      }
      sendError(res, 400, error.message || "Failed to create camera");
    }
  });

  app.patch("/api/cameras/:id", requireAdmin, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      if (!req.body || typeof req.body !== "object") {
        return sendError(res, 400, "Request body is required");
      }

      const camera = await storage.getCameraById(cameraId);

      if (!camera) {
        return sendError(res, 404, "Camera not found");
      }

      if (camera.userId !== getUserId(req)) {
        return sendError(res, 403, "Forbidden");
      }

      // Filter to allowed fields only, reject unknown keys
      const updates: Record<string, any> = {};
      for (const key of Object.keys(req.body)) {
        if (ALLOWED_CAMERA_UPDATE_FIELDS.has(key)) {
          updates[key] = req.body[key];
        }
      }

      if (Object.keys(updates).length === 0) {
        return sendError(res, 400, "No valid fields to update");
      }

      // Encrypt password if it's being updated (accept plain password)
      if (updates.password) {
        if (typeof updates.password !== "string" || updates.password.trim().length === 0) {
          return sendError(res, 400, "Password must be a non-empty string");
        }
        updates.encryptedPassword = await encryptPassword(updates.password);
        delete updates.password; // Remove plaintext password
      }

      const updated = await storage.updateCamera(cameraId, updates);
      if (!updated) {
        return sendError(res, 500, "Failed to update camera");
      }
      const { encryptedPassword: _, ...safeCamera } = updated;

      // Invalidate dashboard cache for this user
      dashboardCache.delete(`dashboard:${getUserId(req)}`);

      res.json(safeCamera);
    } catch (error: any) {
      console.error("Error updating camera:", error);
      sendError(res, 400, error.message || "Failed to update camera");
    }
  });

  app.delete("/api/cameras/:id", requireAdmin, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const camera = await storage.getCameraById(cameraId);

      if (!camera) {
        return sendError(res, 404, "Camera not found");
      }

      if (camera.userId !== getUserId(req)) {
        return sendError(res, 403, "Forbidden");
      }

      await storage.deleteCamera(cameraId);

      // Invalidate dashboard cache for this user
      dashboardCache.delete(`dashboard:${getUserId(req)}`);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting camera:", error);
      sendError(res, 500, "Failed to delete camera");
    }
  });

  // Uptime events routes
  app.get("/api/cameras/:id/events", requireAuth, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const daysResult = validateDays(req.query.days);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const camera = await storage.getCameraById(cameraId);

      if (!camera) {
        return sendError(res, 404, "Camera not found");
      }

      if (camera.userId !== getUserId(req)) {
        return sendError(res, 403, "Forbidden");
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const events = await storage.getUptimeEventsInRange(
        cameraId,
        startDate,
        new Date()
      );

      const priorEvent = await storage.getLatestEventBefore(cameraId, startDate);

      res.json({
        events,
        priorEvent: priorEvent || null,
      });
    } catch (error) {
      console.error("Error fetching events:", error);
      sendError(res, 500, "Failed to fetch events");
    }
  });

  app.get("/api/cameras/uptime/batch", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const daysResult = validateDays(req.query.days);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const cameras = await storage.getCamerasByUserId(userId);

      const uptimeData = await Promise.all(
        cameras.map(async (camera) => {
          const { percentage, monitoredDays } = await storage.calculateUptimePercentage(camera.id, days);
          return {
            cameraId: camera.id,
            uptime: percentage,
            monitoredDays,
            monitoredSince: camera.createdAt,
          };
        })
      );

      res.json(uptimeData);
    } catch (error) {
      console.error("Error fetching batch uptime:", error);
      sendError(res, 500, "Failed to fetch batch uptime");
    }
  });

  app.get("/api/uptime/events", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const daysResult = validateDays(req.query.days);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const cameras = await storage.getCamerasByUserId(userId);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const allEventsAndPrior = await Promise.all(
        cameras.map(async (camera) => {
          const events = await storage.getUptimeEventsInRange(camera.id, startDate, new Date());
          const priorEvent = await storage.getLatestEventBefore(camera.id, startDate);
          return { events, priorEvent };
        })
      );

      const flatEvents = allEventsAndPrior.flatMap(item => item.events);
      const priorEvents = allEventsAndPrior
        .map(item => item.priorEvent)
        .filter(Boolean);

      res.json({
        events: flatEvents,
        priorEvents,
      });
    } catch (error) {
      console.error("Error fetching uptime events:", error);
      sendError(res, 500, "Failed to fetch uptime events");
    }
  });

  // Daily uptime percentages for the chart (server-side calculation)
  app.get("/api/uptime/daily", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const daysResult = validateDays(req.query.days);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const cameraIdParam = typeof req.query.cameraId === "string" ? req.query.cameraId.trim() : null;

      let camerasToProcess: Camera[];
      if (cameraIdParam && cameraIdParam !== "all") {
        const camId = validateId(cameraIdParam);
        if (!camId) return sendError(res, 400, "Invalid camera ID");
        const camera = await storage.getCameraById(camId);
        if (!camera) return sendError(res, 404, "Camera not found");
        if (camera.userId !== userId) return sendError(res, 403, "Forbidden");
        camerasToProcess = [camera];
      } else {
        camerasToProcess = await storage.getCamerasByUserId(userId);
      }

      if (camerasToProcess.length === 0) {
        return res.json({ data: [] });
      }

      const now = new Date();
      const rangeStart = new Date(now);
      rangeStart.setDate(rangeStart.getDate() - days);

      // Fetch events and prior event for each camera
      const cameraData = await Promise.all(
        camerasToProcess.map(async (camera) => {
          const events = await storage.getUptimeEventsInRange(camera.id, rangeStart, now);
          const priorEvent = await storage.getLatestEventBefore(camera.id, rangeStart);
          return { camera, events, priorEvent };
        })
      );

      const data: Array<{ date: string; uptime: number }> = [];

      for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date(now);
        dayStart.setDate(dayStart.getDate() - i);
        dayStart.setHours(0, 0, 0, 0);

        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const effectiveDayEnd = dayEnd.getTime() > now.getTime() ? now : dayEnd;

        let totalUptime = 0;
        let cameraCount = 0;

        for (const { camera, events, priorEvent } of cameraData) {
          // Skip cameras not yet monitored on this day
          const monitoringStart = camera.createdAt ? new Date(camera.createdAt) : null;
          if (monitoringStart && monitoringStart >= effectiveDayEnd) {
            continue;
          }

          // Events for this specific day
          const dayEvents = events
            .filter(e => {
              const t = new Date(e.timestamp).getTime();
              return t >= dayStart.getTime() && t < dayEnd.getTime();
            })
            .map(e => ({ timestamp: new Date(e.timestamp), status: e.status }));

          // Find the status just before this day starts:
          // latest event from the range that occurred before dayStart, or the prior event
          let priorStatus: string | undefined;
          const eventsBeforeDay = events.filter(
            e => new Date(e.timestamp).getTime() < dayStart.getTime()
          );
          if (eventsBeforeDay.length > 0) {
            priorStatus = eventsBeforeDay[eventsBeforeDay.length - 1].status;
          } else if (priorEvent) {
            priorStatus = priorEvent.status;
          }

          // Fall back to lastBootAt like calculateUptimePercentage does
          if (!priorStatus && camera.lastBootAt) {
            const bootTime = new Date(camera.lastBootAt);
            if (bootTime < dayStart) {
              priorStatus = "online";
            }
          }

          const uptime = calculateUptimeFromEvents(
            dayEvents,
            dayStart,
            effectiveDayEnd,
            priorStatus
          );

          totalUptime += uptime;
          cameraCount++;
        }

        if (cameraCount > 0) {
          data.push({
            date: dayStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            uptime: parseFloat((totalUptime / cameraCount).toFixed(1)),
          });
        }
      }

      res.json({ data });
    } catch (error) {
      console.error("Error fetching daily uptime:", error);
      sendError(res, 500, "Failed to fetch daily uptime data");
    }
  });

  app.get("/api/cameras/:id/uptime", requireAuth, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const daysResult = validateDays(req.query.days);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const camera = await storage.getCameraById(cameraId);

      if (!camera) {
        return sendError(res, 404, "Camera not found");
      }

      if (camera.userId !== getUserId(req)) {
        return sendError(res, 403, "Forbidden");
      }

      const result = await storage.calculateUptimePercentage(cameraId, days);
      res.json({ percentage: result.percentage, days, monitoredDays: result.monitoredDays });
    } catch (error) {
      console.error("Error calculating uptime:", error);
      sendError(res, 500, "Failed to calculate uptime");
    }
  });

  // Dashboard summary route (with 30s response cache per user)
  app.get("/api/dashboard/summary", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      // Check response cache
      const cacheKey = `dashboard:${userId}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }

      const cameras = await storage.getCamerasByUserId(userId);

      // Separate cameras from non-video devices (C-series speakers)
      const videoCameras = cameras.filter(c => c.series !== 'C');
      const speakers = cameras.filter(c => c.series === 'C');

      // Total counts include all devices
      const totalCameras = cameras.length;

      // Overview counts exclude speakers (shown in their own section)
      const onlineCameras = videoCameras.filter(c => c.currentStatus === "online").length;
      const offlineCameras = videoCameras.filter(c => c.currentStatus === "offline").length;
      const unknownCameras = videoCameras.filter(c => c.currentStatus === "unknown").length;

      // Video health metrics (only for video-capable devices)
      const videoOk = videoCameras.filter(c => c.videoStatus === "video_ok").length;
      const videoFailed = videoCameras.filter(c => c.videoStatus === "video_failed").length;
      const videoUnknown = videoCameras.filter(c => !c.videoStatus || c.videoStatus === "unknown").length;

      // Speaker metrics
      const speakerTotal = speakers.length;
      const speakerOnline = speakers.filter(c => c.currentStatus === "online").length;
      const speakerOffline = speakers.filter(c => c.currentStatus === "offline").length;

      // Average uptime for video cameras only (30 days) — speakers have their own metric
      let avgUptime = 0;
      if (videoCameras.length > 0) {
        const uptimePromises = videoCameras.map(c =>
          storage.calculateUptimePercentage(c.id, 30)
        );
        const uptimeResults = await Promise.all(uptimePromises);
        avgUptime = uptimeResults.reduce((a, b) => a + b.percentage, 0) / videoCameras.length;
      }

      // Calculate speaker-specific average uptime
      let speakerAvgUptime = 0;
      if (speakerTotal > 0) {
        const speakerUptimePromises = speakers.map(c =>
          storage.calculateUptimePercentage(c.id, 30)
        );
        const speakerUptimeResults = await Promise.all(speakerUptimePromises);
        speakerAvgUptime = speakerUptimeResults.reduce((a, b) => a + b.percentage, 0) / speakerTotal;
      }

      // Aggregate analytics metrics across all cameras with enabled analytics
      let totalPeopleIn = 0;
      let totalPeopleOut = 0;
      let currentOccupancy = 0;
      let analyticsEnabled = 0;

      const analyticsCameras = cameras.filter(c => {
        const caps = c.capabilities as any;
        const enabled = caps?.enabledAnalytics;
        return enabled && Object.values(enabled).some(Boolean);
      });

      if (analyticsCameras.length > 0) {
        analyticsEnabled = analyticsCameras.length;

        // Single batch query replaces 3×N individual queries (N+1 elimination)
        const analyticsCamIds = analyticsCameras.map(c => c.id);
        const latestByCamera = await storage.getLatestAnalyticsPerCamera(
          analyticsCamIds,
          ["people_in", "people_out", "occupancy"]
        );

        for (const camId of analyticsCamIds) {
          const camData = latestByCamera.get(camId);
          if (!camData) continue;
          totalPeopleIn += camData.get("people_in")?.value ?? 0;
          totalPeopleOut += camData.get("people_out")?.value ?? 0;
          currentOccupancy += camData.get("occupancy")?.value ?? 0;
        }
      }

      const responseData = {
        totalCameras,
        onlineCameras,
        offlineCameras,
        unknownCameras,
        videoOk,
        videoFailed,
        videoUnknown,
        avgUptime: Math.round(avgUptime * 100) / 100,
        totalPeopleIn,
        totalPeopleOut,
        currentOccupancy,
        analyticsEnabled,
        // Speaker metrics
        speakerTotal,
        speakerOnline,
        speakerOffline,
        speakerAvgUptime: Math.round(speakerAvgUptime * 100) / 100,
      };

      // Store in response cache
      dashboardCacheSet(cacheKey, { data: responseData, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS });

      res.json(responseData);
    } catch (error) {
      console.error("Error fetching dashboard summary:", error);
      sendError(res, 500, "Failed to fetch dashboard summary");
    }
  });

  // Manual camera check trigger
  app.post("/api/cameras/:id/check", requireAuth, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const camera = await storage.getCameraById(cameraId);

      if (!camera) {
        return sendError(res, 404, "Camera not found");
      }

      if (camera.userId !== getUserId(req)) {
        return sendError(res, 403, "Forbidden");
      }

      // Import the checkAllCameras function and trigger a single camera check
      res.json({ message: "Camera check queued" });
    } catch (error) {
      console.error("Error triggering camera check:", error);
      sendError(res, 500, "Failed to trigger camera check");
    }
  });

  // Model Management Endpoints

  // POST /api/cameras/:id/detect-model - Manually trigger model detection
  app.post("/api/cameras/:id/detect-model", requireAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      // Get camera
      const camera = await storage.getCameraById(cameraId);
      if (!camera) {
        return sendError(res, 404, "Camera not found");
      }

      // Verify ownership
      if (camera.userId !== userId) {
        return sendError(res, 403, "Forbidden");
      }

      // Decrypt password
      const { decryptPassword } = await import("./encryption");
      const password = await decryptPassword(camera.encryptedPassword);

      // Detect model
      const { detectCameraModel } = await import("./services/cameraDetection");
      const result = await detectCameraModel(
        camera.ipAddress,
        camera.username,
        password
      );

      // Update camera
      await storage.updateCameraModel(cameraId, result);

      // Look up lifecycle data for this model (awaited so it's in the response)
      let lifecycle = null;
      if (result.model) {
        const { lookupAxisEolWithFetch } = await import("./services/axisEolData");
        try {
          const eolData = await lookupAxisEolWithFetch(result.model);
          if (eolData) {
            lifecycle = {
              status: eolData.status,
              statusLabel: eolData.statusLabel,
              discontinuedDate: eolData.discontinuedDate || null,
              endOfHardwareSupport: eolData.endOfHardwareSupport || null,
              endOfSoftwareSupport: eolData.endOfSoftwareSupport || null,
              replacementModel: eolData.replacementModel || null,
              lastChecked: new Date().toISOString(),
            };
            await storage.updateCameraCapabilities(cameraId, { lifecycle }, true);
          }
        } catch { /* silent — lifecycle is best-effort */ }
      }

      res.json({
        success: true,
        model: result.model,
        series: result.series,
        capabilities: { ...result.capabilities, lifecycle },
      });
    } catch (error: any) {
      console.error("Model detection error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to detect camera model",
        error: error.message || "Failed to detect camera model",
      });
    }
  });

  // GET /api/cameras/:id/lifecycle - Get EOL/EOS lifecycle data for a camera
  app.get("/api/cameras/:id/lifecycle", requireAuth, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const camera = await storage.getCameraById(cameraId);
      if (!camera) return sendError(res, 404, "Camera not found");
      if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      // Return cached lifecycle data if available and recent (< 7 days old)
      const cached = (camera.capabilities as any)?.lifecycle;
      if (cached?.lastChecked) {
        const age = Date.now() - new Date(cached.lastChecked).getTime();
        if (age < 7 * 24 * 60 * 60 * 1000) {
          return res.json(cached);
        }
      }

      // Fetch fresh data
      const { lookupAxisEolWithFetch } = await import("./services/axisEolData");
      const eolData = camera.model
        ? await lookupAxisEolWithFetch(camera.model)
        : null;

      const lifecycle = {
        status: eolData?.status || "active",
        statusLabel: eolData?.statusLabel || (camera.model ? "Active" : "Unknown Model"),
        discontinuedDate: eolData?.discontinuedDate || null,
        endOfHardwareSupport: eolData?.endOfHardwareSupport || null,
        endOfSoftwareSupport: eolData?.endOfSoftwareSupport || null,
        replacementModel: eolData?.replacementModel || null,
        lastChecked: new Date().toISOString(),
      };

      // Cache in capabilities
      await storage.updateCameraCapabilities(cameraId, { lifecycle }, true);
      res.json(lifecycle);
    } catch (error) {
      console.error("Error fetching lifecycle data:", error);
      sendError(res, 500, "Failed to fetch lifecycle data");
    }
  });

  // POST /api/cameras/:id/probe-analytics - Probe for installed analytics ACAPs
  app.post("/api/cameras/:id/probe-analytics", requireAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const camera = await storage.getCameraById(cameraId);
      if (!camera) return sendError(res, 404, "Camera not found");
      if (camera.userId !== userId) return sendError(res, 403, "Forbidden");

      const { decryptPassword } = await import("./encryption");
      const password = await decryptPassword(camera.encryptedPassword);

      const { probeAnalyticsCapabilities } = await import("./services/analyticsPoller");
      const { getConnectionInfo } = await import("./services/cameraUrl");
      const conn = getConnectionInfo(camera);
      const probeResult = await probeAnalyticsCapabilities(camera.ipAddress, camera.username, password, conn);

      // Merge all probe results into capabilities.analytics
      const existingAnalytics = (camera.capabilities as any)?.analytics || {};
      await storage.updateCameraCapabilities(cameraId, {
        analytics: {
          ...existingAnalytics,
          peopleCount: probeResult.peopleCount,
          occupancyEstimation: probeResult.occupancyEstimation,
          lineCrossing: probeResult.lineCrossing,
          objectAnalytics: probeResult.objectAnalytics,
          loiteringGuard: probeResult.loiteringGuard,
          fenceGuard: probeResult.fenceGuard,
          motionGuard: probeResult.motionGuard,
          acapInstalled: probeResult.acapInstalled,
          objectAnalyticsScenarios: probeResult.objectAnalyticsScenarios,
          objectAnalyticsApiPath: probeResult.objectAnalyticsApiPath,
        },
      }, true);

      res.json({ success: true, analytics: probeResult });
    } catch (error: any) {
      console.error("Analytics probe error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to probe analytics", error: error.message || "Failed to probe analytics" });
    }
  });

  // PATCH /api/cameras/:id/analytics-config - Enable/disable analytics polling
  app.patch("/api/cameras/:id/analytics-config", requireAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      if (!req.body || typeof req.body !== "object") {
        return sendError(res, 400, "Request body is required");
      }

      const camera = await storage.getCameraById(cameraId);
      if (!camera) return sendError(res, 404, "Camera not found");
      if (camera.userId !== userId) return sendError(res, 403, "Forbidden");

      const configSchema = z.object({
        peopleCount: z.boolean().optional(),
        occupancyEstimation: z.boolean().optional(),
        lineCrossing: z.boolean().optional(),
        objectAnalytics: z.boolean().optional(),
        loiteringGuard: z.boolean().optional(),
        fenceGuard: z.boolean().optional(),
        motionGuard: z.boolean().optional(),
      });

      const enabledAnalytics = configSchema.parse(req.body);

      await storage.updateCameraCapabilities(cameraId, {
        enabledAnalytics,
      }, true);

      res.json({ success: true, enabledAnalytics });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0].message);
      }
      console.error("Analytics config error:", error);
      sendError(res, 500, error.message || "Failed to update analytics config");
    }
  });

  // GET /api/cameras/:id/capabilities - Get camera capabilities
  app.get("/api/cameras/:id/capabilities", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      // Verify camera exists and user owns it
      const camera = await storage.getCameraById(cameraId);
      if (!camera) {
        return sendError(res, 404, "Camera not found");
      }

      if (camera.userId !== userId) {
        return sendError(res, 403, "Forbidden");
      }

      const model = await storage.getCameraModel(cameraId);
      if (!model) {
        return sendError(res, 404, "Camera model not detected yet");
      }

      res.json(model);
    } catch (error: any) {
      console.error("Error fetching camera capabilities:", error);
      sendError(res, 500, error.message || "Failed to fetch capabilities");
    }
  });

  // GET /api/models - List all supported models
  app.get("/api/models", requireAuth, async (req: any, res) => {
    try {
      const { getAllModels, getModelsBySeries } = await import("./models/cameraModels");

      const { series } = req.query;

      if (series && typeof series === 'string') {
        const validSeries = ['P', 'Q', 'M', 'F'];
        if (!validSeries.includes(series.toUpperCase())) {
          return sendError(res, 400, "Invalid series. Must be one of: P, Q, M, F");
        }
        const models = getModelsBySeries(series.toUpperCase() as 'P' | 'Q' | 'M' | 'F');
        return res.json(models);
      }

      const models = getAllModels();
      res.json(models);
    } catch (error: any) {
      console.error("Error fetching models:", error);
      sendError(res, 500, error.message || "Failed to fetch models");
    }
  });

  // GET /api/cameras/stats/models - Get model statistics
  app.get("/api/cameras/stats/models", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      const allCameras = await storage.getCamerasByUserId(userId);

      // Count by model
      const modelCounts: Record<string, number> = {};
      const seriesCounts: Record<string, number> = { P: 0, Q: 0, M: 0, F: 0 };
      let detectedCount = 0;

      allCameras.forEach(camera => {
        if (camera.model) {
          modelCounts[camera.model] = (modelCounts[camera.model] || 0) + 1;
          detectedCount++;

          if (camera.series) {
            seriesCounts[camera.series] = (seriesCounts[camera.series] || 0) + 1;
          }
        }
      });

      res.json({
        total: allCameras.length,
        detected: detectedCount,
        undetected: allCameras.length - detectedCount,
        detectionRate: allCameras.length > 0 ? (detectedCount / allCameras.length) : 0,
        byModel: modelCounts,
        bySeries: seriesCounts,
      });
    } catch (error: any) {
      console.error("Error fetching model statistics:", error);
      sendError(res, 500, error.message || "Failed to fetch model statistics");
    }
  });

  // Network scanning routes
  app.post("/api/scan/subnet", requireAdmin, async (req: any, res) => {
    try {
      if (!req.body || typeof req.body !== "object") {
        return sendError(res, 400, "Request body is required");
      }

      const { subnet, startRange, endRange } = req.body;

      if (!subnet || typeof subnet !== "string") {
        return sendError(res, 400, "subnet is required and must be a string");
      }
      if (startRange === undefined || startRange === null || typeof startRange !== "number" || !Number.isInteger(startRange) || startRange < 1 || startRange > 254) {
        return sendError(res, 400, "startRange must be an integer between 1 and 254");
      }
      if (endRange === undefined || endRange === null || typeof endRange !== "number" || !Number.isInteger(endRange) || endRange < 1 || endRange > 254) {
        return sendError(res, 400, "endRange must be an integer between 1 and 254");
      }
      if (startRange > endRange) {
        return sendError(res, 400, "startRange must be less than or equal to endRange");
      }

      // Validate subnet format (basic IP prefix like "192.168.1")
      const subnetTrimmed = subnet.trim();
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnetTrimmed)) {
        return sendError(res, 400, "Invalid subnet format. Expected format: 192.168.1");
      }

      const { scanSubnet } = await import("./networkScanner");
      const results = await scanSubnet(subnetTrimmed, startRange, endRange);

      res.json({
        total: results.length,
        found: results.filter((r) => r.isAxis).length,
        results: results.filter((r) => r.isAxis),
      });
    } catch (error: any) {
      console.error("Error scanning subnet:", error);
      sendError(res, 500, error.message || "Failed to scan subnet");
    }
  });

  // Network scan with CIDR notation (for frontend NetworkScan page)
  app.post("/api/cameras/scan", requireAdmin, async (req: any, res) => {
    try {
      const scanRequestSchema = z.object({
        subnet: z.string().min(1, "Subnet is required"),
      });

      const { subnet } = scanRequestSchema.parse(req.body);

      // Parse CIDR notation (e.g., "192.168.1.0/24", "172.16.0.0/16", "10.0.0.0/8")
      const [networkAddress, prefixLengthStr] = subnet.split('/');
      
      if (!networkAddress || !prefixLengthStr) {
        return sendError(res, 400, "Invalid CIDR notation. Expected format: 192.168.1.0/24");
      }

      const prefixLength = parseInt(prefixLengthStr);
      if (isNaN(prefixLength) || prefixLength < 8 || prefixLength > 30) {
        return sendError(res, 400, "Prefix length must be an integer between 8 and 30");
      }

      // Parse IP address octets
      const octets = networkAddress.split('.').map(o => parseInt(o));
      if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) {
        return sendError(res, 400, "Invalid IP address format");
      }

      // Calculate network address and broadcast address
      const ipToNumber = (octets: number[]) =>
        (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
      
      const numberToIP = (num: number) => 
        `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;

      const ipNum = ipToNumber(octets);
      const hostBits = 32 - prefixLength;
      const subnetMask = ~((1 << hostBits) - 1);
      const networkNum = (ipNum & subnetMask) >>> 0; // Network address
      const broadcastNum = (networkNum | ((1 << hostBits) - 1)) >>> 0; // Broadcast address

      // Calculate usable host range (exclude network and broadcast)
      const startIPNum = networkNum + 1;
      const endIPNum = broadcastNum - 1;
      const totalHosts = endIPNum - startIPNum + 1;

      // Practical limit: max 10,000 IPs per scan to prevent extremely long operations
      const MAX_SCAN_SIZE = 10000;
      if (totalHosts > MAX_SCAN_SIZE) {
        return sendError(res, 400, `Scan too large: ${totalHosts} hosts. Maximum ${MAX_SCAN_SIZE} hosts per scan. Use a smaller CIDR range (e.g., /20 or higher).`);
      }

      const startIP = numberToIP(startIPNum);
      const endIP = numberToIP(endIPNum);

      console.log(`[API] Scanning CIDR ${subnet}`);
      console.log(`[API] Range: ${startIP} to ${endIP} (${totalHosts} hosts)`);

      const { scanIPRange } = await import("./networkScanner");
      const results = await scanIPRange(startIP, endIP);

      // Map results to frontend expected format (with enriched data)
      const cameras = results
        .filter(r => r.isAxis)
        .map(r => ({
          ipAddress: r.ipAddress,
          detected: r.isAxis,
          model: r.model,
          serial: r.serial,
          firmware: r.firmware,
          series: r.series,
          discoveryMethod: r.discoveryMethod,
        }));

      res.json({ cameras });
    } catch (error: any) {
      console.error("Error scanning network:", error);
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0].message);
      }
      sendError(res, 500, error.message || "Failed to scan network");
    }
  });

  // Get local network interfaces for subnet suggestions
  app.get("/api/network/interfaces", requireAuth, async (req: any, res) => {
    try {
      const { getLocalSubnets } = await import("./networkScanner");
      const interfaces = getLocalSubnets();
      res.json({ interfaces });
    } catch (error: any) {
      console.error("Error getting network interfaces:", error);
      sendError(res, 500, error.message || "Failed to get network interfaces");
    }
  });

  // Unified camera discovery (Bonjour + SSDP + HTTP scan)
  app.post("/api/cameras/discover", requireAdmin, async (req: any, res) => {
    try {
      const discoverSchema = z.object({
        subnet: z.string().optional(),
        bonjour: z.boolean().optional().default(true),
        ssdp: z.boolean().optional().default(true),
        httpScan: z.boolean().optional().default(true),
      });

      const { subnet, bonjour, ssdp, httpScan } = discoverSchema.parse(req.body || {});

      // Validate CIDR if provided
      if (subnet) {
        const [networkAddress, prefixLengthStr] = subnet.split('/');
        if (!networkAddress || !prefixLengthStr) {
          return sendError(res, 400, "Invalid CIDR notation. Expected format: 192.168.1.0/24");
        }
        const prefixLength = parseInt(prefixLengthStr);
        if (isNaN(prefixLength) || prefixLength < 8 || prefixLength > 30) {
          return sendError(res, 400, "Prefix length must be between 8 and 30");
        }
        const octets = networkAddress.split('.').map(Number);
        if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) {
          return sendError(res, 400, "Invalid IP address format");
        }
        // Check scan size
        const hostBits = 32 - prefixLength;
        const totalHosts = (1 << hostBits) - 2;
        if (totalHosts > 10000) {
          return sendError(res, 400, `Scan too large: ${totalHosts} hosts. Use /20 or smaller.`);
        }
      }

      console.log(`[API] Starting unified discovery${subnet ? ` on ${subnet}` : ' (multicast only)'}`);

      const { discoverCameras } = await import("./networkScanner");
      const results = await discoverCameras(subnet, { bonjour, ssdp, httpScan });

      // Get existing cameras for this user to flag already-added ones
      const userId = getUserId(req);
      const existingCameras = await storage.getCamerasByUserId(userId);
      const existingIPs = new Set(existingCameras.map((c: Camera) => c.ipAddress.trim().toLowerCase()));

      const cameras = results.map(r => ({
        ipAddress: r.ipAddress,
        model: r.model || 'Axis Camera',
        serial: r.serial,
        firmware: r.firmware,
        series: r.series,
        discoveryMethod: r.discoveryMethod,
        detectedProtocol: r.detectedProtocol || 'http',
        alreadyAdded: existingIPs.has(r.ipAddress.trim().toLowerCase()),
      }));

      res.json({
        total: cameras.length,
        cameras,
      });
    } catch (error: any) {
      console.error("Error discovering cameras:", error);
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0].message);
      }
      sendError(res, 500, error.message || "Failed to discover cameras");
    }
  });

  // Bulk add cameras from discovery results
  app.post("/api/cameras/bulk-add", requireAdmin, async (req: any, res) => {
    try {
      const bulkAddSchema = z.object({
        cameras: z.array(z.object({
          ipAddress: z.string().min(1),
          name: z.string().optional(),
          username: z.string().min(1),
          password: z.string().min(1),
          protocol: z.enum(["http", "https"]).optional(),
          port: z.number().int().min(1).max(65535).optional(),
          verifySslCert: z.boolean().optional(),
        })).min(1).max(50),
      });

      const { cameras } = bulkAddSchema.parse(req.body);
      const userId = getUserId(req);

      // Get existing cameras for deduplication
      const existingCameras = await storage.getCamerasByUserId(userId);
      const existingIPs = new Set(existingCameras.map((c: Camera) => c.ipAddress.trim().toLowerCase()));

      const added: string[] = [];
      const skipped: string[] = [];

      for (const cam of cameras) {
        const normalizedIP = cam.ipAddress.trim().toLowerCase();
        if (existingIPs.has(normalizedIP)) {
          skipped.push(cam.ipAddress);
          continue;
        }

        try {
          const encrypted = await encryptPassword(cam.password);
          await storage.createCamera({
            name: cam.name || `Camera ${cam.ipAddress}`,
            ipAddress: cam.ipAddress,
            username: cam.username,
            encryptedPassword: encrypted,
            userId,
            ...(cam.protocol && { protocol: cam.protocol }),
            ...(cam.port && { port: cam.port }),
            ...(cam.verifySslCert !== undefined && { verifySslCert: cam.verifySslCert }),
          });
          existingIPs.add(normalizedIP);
          added.push(cam.ipAddress);
        } catch (err: any) {
          console.error(`[BulkAdd] Failed to add ${cam.ipAddress}:`, err.message);
          skipped.push(cam.ipAddress);
        }
      }

      res.json({
        added: added.length,
        skipped: skipped.length,
        addedIPs: added,
        skippedIPs: skipped,
      });

      // Trigger immediate poll so new cameras' status updates quickly
      if (added.length > 0) {
        setTimeout(() => checkAllCameras(), 2000);
      }
    } catch (error: any) {
      console.error("Error bulk-adding cameras:", error);
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0].message);
      }
      sendError(res, 500, error.message || "Failed to add cameras");
    }
  });

  // Test existing camera connection - polls a user's own camera and returns validation results
  app.post("/api/cameras/:id/test-connection", requireAuth, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const userId = getUserId(req);

      // Get camera and verify ownership
      const camera = await storage.getCameraById(cameraId);

      if (!camera) {
        return res.status(404).json({
          success: false,
          error: "Camera not found"
        });
      }

      if (camera.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden - you don't own this camera"
        });
      }

      // Import and use the actual pollCamera function
      const { decryptPassword } = await import("./encryption");
      const decryptedPassword = await decryptPassword(camera.encryptedPassword);
      const conn = getConnectionInfo(camera);
      const dispatcher = getCameraDispatcher(conn);

      // Import pollCamera helper
      const cameraMonitor = await import("./cameraMonitor");
      const pollCamera = (cameraMonitor as any).pollCameraForTest || (async (ip: string, user: string, pass: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
          const url = buildCameraUrl(ip, "/axis-cgi/systemready.cgi", conn);
          const startTime = Date.now();
          const fetchOpts: any = {
            signal: controller.signal,
            headers: { "User-Agent": "AxisCameraMonitor/2.0" },
          };
          if (dispatcher) fetchOpts.dispatcher = dispatcher;
          const response = await fetch(url, fetchOpts);
          clearTimeout(timeoutId);
          const responseTime = Date.now() - startTime;
          const rawText = await response.text();

          const lines = rawText.split(/\r?\n/);
          const data: Record<string, string> = {};
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.includes("=")) continue;
            const idx = trimmed.indexOf("=");
            const key = trimmed.substring(0, idx).trim().toLowerCase();
            const value = trimmed.substring(idx + 1).trim();
            if (key && value) data[key] = value;
          }

          return {
            responseTime,
            httpStatus: response.status,
            parsedData: data,
            rawText: rawText.substring(0, 200), // Only first 200 chars for safety
          };
        } catch (err: any) {
          clearTimeout(timeoutId);
          throw err;
        }
      });

      const result = await pollCamera(camera.ipAddress, camera.username, decryptedPassword);

      // Return safe validation results (no full raw response)
      res.json({
        success: true,
        cameraName: camera.name,
        ipAddress: camera.ipAddress,
        responseTime: result.responseTime,
        httpStatus: result.httpStatus,
        rawResponsePreview: result.rawText, // Only preview, not full response
        parsedFields: result.parsedData,
        validation: {
          hasSystemReady: !!result.parsedData.systemready,
          systemReadyValue: result.parsedData.systemready || null,
          hasBootId: !!result.parsedData.bootid,
          bootIdValue: result.parsedData.bootid || null,
          hasUptime: !!result.parsedData.uptime,
          uptimeValue: result.parsedData.uptime || null,
          isValidAxisFormat: !!result.parsedData.systemready && 
            (result.parsedData.systemready === "yes" || result.parsedData.systemready === "no"),
        },
        interpretation: {
          isOnline: result.parsedData.systemready === "yes",
          uptime: result.parsedData.uptime ? parseInt(result.parsedData.uptime) : null,
          bootId: result.parsedData.bootid || null,
          canDetectReboots: !!result.parsedData.bootid,
        },
      });
    } catch (error: any) {
      if (error.name === "AbortError") {
        return res.json({
          success: false,
          error: "Timeout - camera did not respond within 10 seconds",
        });
      }
      
      res.json({
        success: false,
        error: error.message || "Failed to connect to camera",
      });
    }
  });

  // CSV import route
  app.post("/api/cameras/import", requireAdmin, async (req: any, res) => {
    try {
      if (!req.body || typeof req.body !== "object") {
        return sendError(res, 400, "Request body is required");
      }

      const { csvContent } = req.body;

      if (!csvContent || typeof csvContent !== "string") {
        return sendError(res, 400, "Missing or invalid CSV content");
      }

      // Limit CSV size to prevent abuse (1MB max)
      if (csvContent.length > 1_000_000) {
        return sendError(res, 400, "CSV content too large. Maximum size is 1MB");
      }

      const { parseCSV } = await import("./csvUtils");
      const cameras = parseCSV(csvContent);

      // Import cameras for the current user
      const userId = getUserId(req);
      const imported = [];
      const skipped = [];
      const errors = [];

      // Get existing cameras for deduplication
      const existingCameras = await storage.getCamerasByUserId(userId);
      const normalizeIP = (ip: string) => ip.trim().toLowerCase();
      const existingIPs = new Set(existingCameras.map((c: Camera) => normalizeIP(c.ipAddress)));
      const processedIPs = new Set<string>(); // Track IPs processed in this import

      for (let i = 0; i < cameras.length; i++) {
        const camera = cameras[i];
        const rowNum = i + 2; // +2 because row 1 is headers and arrays are 0-indexed

        try {
          const normalizedIP = normalizeIP(camera.ipAddress);

          // Check for duplicates (both in DB and within this import)
          if (existingIPs.has(normalizedIP) || processedIPs.has(normalizedIP)) {
            const reason = existingIPs.has(normalizedIP) 
              ? "Duplicate IP (already exists in database)"
              : "Duplicate IP (appears earlier in this file)";
            skipped.push({
              row: rowNum,
              name: camera.name,
              ipAddress: camera.ipAddress,
              reason,
            });
            continue;
          }

          // Validate camera data using create schema (accepts plain password, userId comes from session)
          const validatedData = createCameraSchema.parse({
            name: camera.name,
            ipAddress: camera.ipAddress,
            username: camera.username,
            password: camera.password,
            location: camera.location || null,
            notes: camera.notes || null,
            ...(camera.protocol && { protocol: camera.protocol }),
            ...(camera.port && { port: camera.port }),
            ...(camera.verifySslCert !== undefined && { verifySslCert: camera.verifySslCert }),
          });

          // Encrypt password and create camera
          const encryptedPassword = await encryptPassword(validatedData.password);
          const { password: _, ...cameraData } = validatedData;
          
          const newCamera = await storage.createCamera({
            userId, // From session, not validation
            ...cameraData,
            encryptedPassword,
          });
          
          imported.push(newCamera);
          processedIPs.add(normalizedIP); // Track this IP as processed
          existingIPs.add(normalizedIP); // Also add to existing to catch future duplicates
        } catch (validationError: any) {
          errors.push({
            row: rowNum,
            name: camera.name || "Unknown",
            ipAddress: camera.ipAddress || "Unknown",
            error: validationError.message || "Validation failed",
          });
        }
      }

      // Build response message
      let message = `Successfully imported ${imported.length} camera${imported.length !== 1 ? 's' : ''}`;
      if (skipped.length > 0) {
        message += `, skipped ${skipped.length} duplicate${skipped.length !== 1 ? 's' : ''}`;
      }
      if (errors.length > 0) {
        message += `, ${errors.length} error${errors.length !== 1 ? 's' : ''}`;
      }

      res.json({
        message,
        count: imported.length,
        imported: imported.length,
        skipped: skipped.length,
        errors: errors.length,
        details: {
          skippedRows: skipped.length > 0 ? skipped : undefined,
          errorRows: errors.length > 0 ? errors : undefined,
        },
      });

      // Trigger immediate poll so new cameras' status updates quickly
      if (imported.length > 0) {
        setTimeout(() => checkAllCameras(), 2000);
      }
    } catch (error: any) {
      console.error("Error importing cameras:", error);
      sendError(res, 400, error.message || "Failed to import cameras");
    }
  });

  // CSV export routes
  app.get("/api/cameras/export", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const cameras = await storage.getCamerasByUserId(userId);

      const { generateCameraCSV } = await import("./csvUtils");
      const csv = generateCameraCSV(cameras);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=cameras.csv");
      res.send(csv);
    } catch (error) {
      console.error("Error exporting cameras:", error);
      sendError(res, 500, "Failed to export cameras");
    }
  });

  app.get("/api/cameras/export/uptime", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const cameras = await storage.getCamerasByUserId(userId);

      // Calculate uptime for each camera
      const cameraData = await Promise.all(
        cameras.map(async (camera) => {
          const { percentage } = await storage.calculateUptimePercentage(camera.id, 30);
          return {
            name: camera.name,
            ipAddress: camera.ipAddress,
            uptime: percentage,
          };
        })
      );

      const { generateUptimeReportCSV } = await import("./csvUtils");
      const csv = generateUptimeReportCSV(cameraData);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=uptime-report.csv"
      );
      res.send(csv);
    } catch (error) {
      console.error("Error exporting uptime report:", error);
      sendError(res, 500, "Failed to export uptime report");
    }
  });

  // Reliability metrics endpoints
  app.get("/api/metrics/camera/:id", requireAuth, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const daysResult = validateDays(req.query.days);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const camera = await storage.getCameraById(cameraId);

      if (!camera) {
        return sendError(res, 404, "Camera not found");
      }

      if (camera.userId !== getUserId(req)) {
        return sendError(res, 403, "Forbidden");
      }

      const { calculateCameraMetrics } = await import("./reliabilityMetrics");
      const metrics = await calculateCameraMetrics(cameraId, days);

      res.json(metrics);
    } catch (error) {
      console.error("Error fetching camera metrics:", error);
      sendError(res, 500, "Failed to fetch camera metrics");
    }
  });

  app.get("/api/metrics/sites", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const daysResult = validateDays(req.query.days);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const { calculateSiteMetrics } = await import("./reliabilityMetrics");
      const metrics = await calculateSiteMetrics(userId, days);

      res.json(metrics);
    } catch (error) {
      console.error("Error fetching site metrics:", error);
      sendError(res, 500, "Failed to fetch site metrics");
    }
  });

  app.get("/api/metrics/network", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const daysResult = validateDays(req.query.days);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const { calculateNetworkMetrics } = await import("./reliabilityMetrics");
      const metrics = await calculateNetworkMetrics(userId, days);

      res.json(metrics);
    } catch (error) {
      console.error("Error fetching network metrics:", error);
      sendError(res, 500, "Failed to fetch network metrics");
    }
  });

  // Dashboard layout endpoints
  app.get("/api/dashboard/layout", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const layout = await storage.getDashboardLayout(userId);

      res.json(layout || { widgets: [] });
    } catch (error) {
      console.error("Error fetching dashboard layout:", error);
      sendError(res, 500, "Failed to fetch dashboard layout");
    }
  });

  app.post("/api/dashboard/layout", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      if (!req.body || typeof req.body !== "object") {
        return sendError(res, 400, "Request body is required");
      }

      // Validate layout schema
      const layoutSchema = z.object({
        widgets: z.array(z.object({
          id: z.string().min(1).max(100),
          type: z.string().min(1).max(100),
          x: z.number().int().min(0),
          y: z.number().refine(val => isFinite(val) && val >= 0, "Y must be a finite positive number"),
          w: z.number().int().min(1).max(24),
          h: z.number().int().min(1).max(24),
        })).max(50, "Maximum 50 widgets per layout"),
      });

      const validatedLayout = layoutSchema.parse(req.body);
      const layout = await storage.saveDashboardLayout(userId, validatedLayout);

      res.json(layout);
    } catch (error: any) {
      console.error("Error saving dashboard layout:", error);
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0]?.message || "Invalid layout data");
      }
      sendError(res, 500, "Failed to save dashboard layout");
    }
  });

  // ===== Camera Groups CRUD =====

  // List user's groups with member count
  app.get("/api/groups", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const groups = await storage.getGroupsByUserId(userId);

      // Attach member count and current occupancy to each group
      const groupsWithCounts = await Promise.all(
        groups.map(async (group) => {
          const [members, occupancy] = await Promise.all([
            storage.getGroupMembers(group.id),
            storage.getGroupCurrentOccupancy(group.id),
          ]);
          return { ...group, memberCount: members.length, totalOccupancy: occupancy.total };
        })
      );

      res.json(groupsWithCounts);
    } catch (error) {
      console.error("Error fetching groups:", error);
      sendError(res, 500, "Failed to fetch groups");
    }
  });

  // Create group
  app.post("/api/groups", requireAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const createGroupSchema = z.object({
        name: z.string().min(1, "Group name is required"),
        description: z.string().optional(),
        color: z.string().optional(),
      });

      const validatedData = createGroupSchema.parse(req.body);
      const group = await storage.createGroup({ ...validatedData, userId });
      res.status(201).json(group);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0].message);
      }
      console.error("Error creating group:", error);
      sendError(res, 500, "Failed to create group");
    }
  });

  // Get group detail
  app.get("/api/groups/:id", requireAuth, async (req: any, res) => {
    try {
      const groupId = validateId(req.params.id);
      if (!groupId) return sendError(res, 400, "Invalid group ID");

      const group = await storage.getGroupById(groupId);
      if (!group) return sendError(res, 404, "Group not found");
      if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      const members = await storage.getGroupMembers(group.id);
      const safeMembersList = members.map(({ encryptedPassword, ...c }) => c);

      res.json({ ...group, members: safeMembersList });
    } catch (error) {
      console.error("Error fetching group:", error);
      sendError(res, 500, "Failed to fetch group");
    }
  });

  // Update group
  app.patch("/api/groups/:id", requireAdmin, async (req: any, res) => {
    try {
      const groupId = validateId(req.params.id);
      if (!groupId) return sendError(res, 400, "Invalid group ID");

      if (!req.body || typeof req.body !== "object") {
        return sendError(res, 400, "Request body is required");
      }

      const updateGroupSchema = z.object({
        name: z.string().min(1, "Group name cannot be empty").max(200).optional(),
        description: z.string().max(1000).optional(),
        color: z.string().max(50).optional(),
      });

      const validatedData = updateGroupSchema.parse(req.body);
      if (Object.keys(validatedData).length === 0) {
        return sendError(res, 400, "No valid fields to update");
      }

      const group = await storage.getGroupById(groupId);
      if (!group) return sendError(res, 404, "Group not found");
      if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      const updated = await storage.updateGroup(groupId, validatedData);
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0].message);
      }
      console.error("Error updating group:", error);
      sendError(res, 500, "Failed to update group");
    }
  });

  // Delete group
  app.delete("/api/groups/:id", requireAdmin, async (req: any, res) => {
    try {
      const groupId = validateId(req.params.id);
      if (!groupId) return sendError(res, 400, "Invalid group ID");

      const group = await storage.getGroupById(groupId);
      if (!group) return sendError(res, 404, "Group not found");
      if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      await storage.deleteGroup(groupId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting group:", error);
      sendError(res, 500, "Failed to delete group");
    }
  });

  // Add cameras to group
  app.post("/api/groups/:id/members", requireAdmin, async (req: any, res) => {
    try {
      const groupId = validateId(req.params.id);
      if (!groupId) return sendError(res, 400, "Invalid group ID");

      const group = await storage.getGroupById(groupId);
      if (!group) return sendError(res, 404, "Group not found");
      if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      const memberSchema = z.object({
        cameraIds: z.array(z.string().min(1)).min(1, "At least one camera ID required").max(100, "Maximum 100 cameras per request"),
      });
      const { cameraIds } = memberSchema.parse(req.body);

      // Validate each camera ID format
      for (const camId of cameraIds) {
        if (!validateId(camId)) {
          return sendError(res, 400, `Invalid camera ID format: ${camId.substring(0, 20)}`);
        }
      }

      // Verify all cameras belong to user
      const userId = getUserId(req);
      for (const camId of cameraIds) {
        const camera = await storage.getCameraById(camId);
        if (!camera || camera.userId !== userId) {
          return sendError(res, 400, `Camera ${camId} not found or not owned by you`);
        }
      }

      for (const camId of cameraIds) {
        await storage.addCameraToGroup(groupId, camId);
      }

      const members = await storage.getGroupMembers(groupId);
      const safeMembers = members.map(({ encryptedPassword, ...c }) => c);
      res.json({ members: safeMembers });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0].message);
      }
      console.error("Error adding members:", error);
      sendError(res, 500, "Failed to add members");
    }
  });

  // Remove camera from group
  app.delete("/api/groups/:id/members/:cameraId", requireAdmin, async (req: any, res) => {
    try {
      const groupId = validateId(req.params.id);
      if (!groupId) return sendError(res, 400, "Invalid group ID");

      const cameraId = validateId(req.params.cameraId);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const group = await storage.getGroupById(groupId);
      if (!group) return sendError(res, 404, "Group not found");
      if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      await storage.removeCameraFromGroup(groupId, cameraId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing member:", error);
      sendError(res, 500, "Failed to remove member");
    }
  });

  // ===== Analytics Routes =====

  // Per-camera analytics
  app.get("/api/cameras/:id/analytics", requireAuth, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const daysResult = validateDays(req.query.days, 1);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const VALID_EVENT_TYPES = ["occupancy", "people_in", "people_out", "line_crossing", "avg_dwell_time"];
      const eventType = (req.query.eventType as string) || "occupancy";
      if (!VALID_EVENT_TYPES.includes(eventType)) {
        return sendError(res, 400, `Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(", ")}`);
      }

      const camera = await storage.getCameraById(cameraId);
      if (!camera) return sendError(res, 404, "Camera not found");
      if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const events = await storage.getAnalyticsEvents(cameraId, eventType, startDate, endDate);
      const latest = await storage.getLatestAnalyticsEvent(cameraId, eventType);

      // Get all scenario events at the latest timestamp so the frontend can
      // display per-scenario breakdown instead of just one arbitrary scenario.
      const scenarioEvents = await storage.getLatestAnalyticsEventsByScenario(cameraId, eventType);
      const scenarios = scenarioEvents.map((e) => ({
        scenario: (e.metadata as Record<string, any>)?.scenario || "Default",
        value: e.value,
        metadata: e.metadata,
      }));
      const total = scenarioEvents.reduce((sum, e) => sum + e.value, 0);

      res.json({
        cameraId,
        eventType,
        latest: latest || null,
        // Per-scenario breakdown at the latest timestamp
        scenarios: scenarios.length > 1 ? scenarios : undefined,
        // Total across all scenarios (sum). When only 1 scenario, equals latest.value
        total: scenarios.length > 1 ? total : (latest?.value ?? null),
        events,
      });
    } catch (error) {
      console.error("Error fetching camera analytics:", error);
      sendError(res, 500, "Failed to fetch camera analytics");
    }
  });

  // Camera analytics daily history (max value per day = daily total since counters reset at midnight)
  app.get("/api/cameras/:id/analytics/daily", requireAuth, async (req: any, res) => {
    try {
      const cameraId = validateId(req.params.id);
      if (!cameraId) return sendError(res, 400, "Invalid camera ID");

      const days = Math.min(parseInt(req.query.days as string) || 30, 90);
      const VALID_EVENT_TYPES = ["occupancy", "people_in", "people_out", "line_crossing", "avg_dwell_time"];
      const eventType = (req.query.eventType as string) || "people_in";
      if (!VALID_EVENT_TYPES.includes(eventType)) {
        return sendError(res, 400, `Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(", ")}`);
      }

      const camera = await storage.getCameraById(cameraId);
      if (!camera) return sendError(res, 404, "Camera not found");
      if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      const dailyTotals = await storage.getAnalyticsDailyTotals(cameraId, eventType, days);
      res.json({ cameraId, eventType, days, dailyTotals });
    } catch (error) {
      console.error("Error fetching daily analytics:", error);
      sendError(res, 500, "Failed to fetch daily analytics");
    }
  });

  // ===== Analytics SSE Streams =====

  // Stream all cameras' analytics (optionally filtered by cameraId query param)
  app.get("/api/analytics/stream", requireAuth, async (req: any, res) => {
    const userId = getUserId(req);
    const filterCameraId = typeof req.query.cameraId === "string" ? validateId(req.query.cameraId) : null;

    // If filtering by camera, verify ownership
    if (filterCameraId) {
      const camera = await storage.getCameraById(filterCameraId);
      if (!camera || camera.userId !== userId) {
        return sendError(res, 403, "Camera not found or not owned by you");
      }
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // Subscribe to broadcaster
    const unsubscribe = filterCameraId
      ? analyticsBroadcaster.subscribe(filterCameraId, (payload) => {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        })
      : analyticsBroadcaster.subscribeAll((payload) => {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        });

    // Keepalive comment every 30s to prevent proxy timeouts
    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 30_000);

    // Cleanup on client disconnect
    req.on("close", () => {
      unsubscribe();
      clearInterval(keepalive);
    });
  });

  // Stream single camera's analytics (for UI detail views)
  app.get("/api/cameras/:id/analytics/stream", requireAuth, async (req: any, res) => {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    const unsubscribe = analyticsBroadcaster.subscribe(cameraId, (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    });

    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 30_000);

    req.on("close", () => {
      unsubscribe();
      clearInterval(keepalive);
    });
  });

  // Group real-time occupancy
  app.get("/api/groups/:id/occupancy", requireAuth, async (req: any, res) => {
    try {
      const groupId = validateId(req.params.id);
      if (!groupId) return sendError(res, 400, "Invalid group ID");

      const group = await storage.getGroupById(groupId);
      if (!group) return sendError(res, 404, "Group not found");
      if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      const occupancy = await storage.getGroupCurrentOccupancy(groupId);
      res.json(occupancy);
    } catch (error) {
      console.error("Error fetching group occupancy:", error);
      sendError(res, 500, "Failed to fetch group occupancy");
    }
  });

  // Group analytics summary
  app.get("/api/groups/:id/analytics", requireAuth, async (req: any, res) => {
    try {
      const groupId = validateId(req.params.id);
      if (!groupId) return sendError(res, 400, "Invalid group ID");

      const daysResult = validateDays(req.query.days, 1);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const group = await storage.getGroupById(groupId);
      if (!group) return sendError(res, 404, "Group not found");
      if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const summary = await storage.getGroupAnalyticsSummary(groupId, startDate, endDate);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching group analytics:", error);
      sendError(res, 500, "Failed to fetch group analytics");
    }
  });

  // Group analytics trend data (time-series for charts)
  app.get("/api/groups/:id/analytics/trend", requireAuth, async (req: any, res) => {
    try {
      const groupId = validateId(req.params.id);
      if (!groupId) return sendError(res, 400, "Invalid group ID");

      const daysResult = validateDays(req.query.days, 1);
      if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);
      const days = daysResult;

      const VALID_EVENT_TYPES = ["occupancy", "people_in", "people_out", "line_crossing", "avg_dwell_time"];
      const eventType = (req.query.eventType as string) || "occupancy";
      if (!VALID_EVENT_TYPES.includes(eventType)) {
        return sendError(res, 400, `Invalid eventType. Must be one of: ${VALID_EVENT_TYPES.join(", ")}`);
      }

      const group = await storage.getGroupById(groupId);
      if (!group) return sendError(res, 404, "Group not found");
      if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startTs = Math.floor(startDate.getTime() / 1000);
      const endTs = Math.floor(endDate.getTime() / 1000);

      // Get members and aggregate their events from all 3 data tiers
      // (raw events are purged after 6h, hourly summaries after 48h)
      const members = await storage.getGroupMembers(groupId);
      const memberIds = members.map((m) => m.id);
      const allEvents: Array<{ timestamp: Date; value: number; cameraId: string }> = [];

      // Tier 1: Daily summaries (data older than 48h)
      if (memberIds.length > 0) {
        const placeholders = memberIds.map(() => "?").join(",");
        const dailyRows = sqlite.prepare(`
          SELECT camera_id, day_start, max_value
          FROM analytics_daily_summary
          WHERE camera_id IN (${placeholders}) AND event_type = ? AND day_start >= ? AND day_start <= ?
        `).all(...memberIds, eventType, startTs, endTs) as Array<{ camera_id: string; day_start: number; max_value: number }>;
        for (const row of dailyRows) {
          allEvents.push({ timestamp: new Date(row.day_start * 1000), value: row.max_value ?? 0, cameraId: row.camera_id });
        }

        // Tier 2: Hourly summaries (data 6h–48h old)
        const hourlyRows = sqlite.prepare(`
          SELECT camera_id, hour_start, max_value
          FROM analytics_hourly_summary
          WHERE camera_id IN (${placeholders}) AND event_type = ? AND hour_start >= ? AND hour_start <= ?
        `).all(...memberIds, eventType, startTs, endTs) as Array<{ camera_id: string; hour_start: number; max_value: number }>;
        for (const row of hourlyRows) {
          allEvents.push({ timestamp: new Date(row.hour_start * 1000), value: row.max_value ?? 0, cameraId: row.camera_id });
        }
      }

      // Tier 3: Raw events (recent data < 6h, not yet rolled up)
      for (const member of members) {
        const events = await storage.getAnalyticsEvents(member.id, eventType, startDate, endDate);
        for (const e of events) {
          allEvents.push({ timestamp: new Date(e.timestamp), value: e.value, cameraId: e.cameraId });
        }
      }

      // Sort by timestamp
      allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Bucket into hourly intervals
      const buckets: Record<string, number> = {};
      if (eventType === "occupancy") {
        // For occupancy, take the latest reading per camera per bucket,
        // then sum across cameras to get group total per bucket
        const perCameraBuckets: Record<string, Record<string, number>> = {};
        for (const event of allEvents) {
          const hour = new Date(event.timestamp);
          hour.setMinutes(0, 0, 0);
          const key = hour.toISOString();
          if (!perCameraBuckets[key]) perCameraBuckets[key] = {};
          perCameraBuckets[key][event.cameraId] = event.value;
        }
        for (const [key, cameraValues] of Object.entries(perCameraBuckets)) {
          buckets[key] = Object.values(cameraValues).reduce((sum, v) => sum + v, 0);
        }
      } else {
        // For people_in/out/line_crossing, sum all values per bucket
        for (const event of allEvents) {
          const hour = new Date(event.timestamp);
          hour.setMinutes(0, 0, 0);
          const key = hour.toISOString();
          buckets[key] = (buckets[key] || 0) + event.value;
        }
      }

      const trend = Object.entries(buckets)
        .map(([timestamp, value]) => ({ timestamp, value }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      res.json({ eventType, trend });
    } catch (error) {
      console.error("Error fetching analytics trend:", error);
      sendError(res, 500, "Failed to fetch analytics trend");
    }
  });

  // ===== User Settings Routes =====

  // GET /api/settings - get current user settings
  app.get("/api/settings", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const settings = await storage.getUserSettings(userId);
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      sendError(res, 500, "Failed to fetch settings");
    }
  });

  // PATCH /api/settings - update user settings (admin only)
  app.patch("/api/settings", requireAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      if (!req.body || typeof req.body !== "object") {
        return sendError(res, 400, "Request body is required");
      }

      const settingsSchema = z.object({
        pollingInterval: z.number().int().min(1).max(60).optional(),
        dataRetentionDays: z.number().int().min(7).max(365).optional(),
        emailNotifications: z.boolean().optional(),
      });

      const validatedSettings = settingsSchema.parse(req.body);

      if (Object.keys(validatedSettings).length === 0) {
        return sendError(res, 400, "No valid settings to update");
      }

      const settings = await storage.updateUserSettings(userId, validatedSettings);
      res.json(settings);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, error.errors[0].message);
      }
      console.error("Error updating settings:", error);
      sendError(res, 500, "Failed to update settings");
    }
  });

  // ===== Admin Routes =====

  // POST /api/admin/cleanup - delete old uptime events based on user's retention setting
  app.post("/api/admin/cleanup", requireAdmin, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const settings = await storage.getUserSettings(userId);
      const retentionDays = settings.dataRetentionDays ?? 90;

      const beforeDate = new Date();
      beforeDate.setDate(beforeDate.getDate() - retentionDays);

      const deletedCount = await storage.deleteOldUptimeEvents(beforeDate);

      res.json({
        message: `Cleanup complete. Deleted events older than ${retentionDays} days.`,
        deletedCount,
        beforeDate: beforeDate.toISOString(),
      });
    } catch (error) {
      console.error("Error running cleanup:", error);
      sendError(res, 500, "Failed to run cleanup");
    }
  });

  // Create HTTPS server if SSL certificate and key are provided via environment variables.
  // Set SSL_CERT_PATH and SSL_KEY_PATH to enable native HTTPS for the web UI.
  // Falls back to plain HTTP if not configured.
  const sslCertPath = process.env.SSL_CERT_PATH;
  const sslKeyPath = process.env.SSL_KEY_PATH;

  if (sslCertPath && sslKeyPath && existsSync(sslCertPath) && existsSync(sslKeyPath)) {
    const httpsOptions: { key: Buffer; cert: Buffer; ca?: Buffer } = {
      key: readFileSync(sslKeyPath),
      cert: readFileSync(sslCertPath),
    };
    // Optional CA chain for intermediate certificates
    const sslCaPath = process.env.SSL_CA_PATH;
    if (sslCaPath && existsSync(sslCaPath)) {
      httpsOptions.ca = readFileSync(sslCaPath);
    }
    console.log("[Server] HTTPS enabled — serving with TLS");
    return createHttpsServer(httpsOptions, app);
  }

  return createServer(app);
}
