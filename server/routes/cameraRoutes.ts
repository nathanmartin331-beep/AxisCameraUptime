import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { encryptPassword } from "../encryption";
import { checkAllCameras, checkSingleCamera } from "../cameraMonitor";
import { calculateUptimeFromEvents } from "../uptimeCalculator";
import type { Camera } from "@shared/schema";
import { z } from "zod";
import {
  validateId, validateDays, sendError, getUserId,
  dashboardCache, createCameraSchema, ALLOWED_CAMERA_UPDATE_FIELDS,
} from "./shared";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limiter for camera write operations
const cameraWriteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 write ops per minute
  message: { message: "Too many requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Camera CRUD routes
router.get("/api/cameras", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { model, hasPTZ, hasAudio } = req.query;

    let cameras;
    if (model && typeof model === 'string') {
      cameras = await storage.getCamerasByModel(model, userId);
    } else if (hasPTZ === 'true') {
      cameras = await storage.getCamerasByCapability('hasPTZ', undefined, userId);
    } else if (hasAudio === 'true') {
      cameras = await storage.getCamerasByCapability('hasAudio', undefined, userId);
    } else {
      cameras = await storage.getCamerasByUserId(userId);
    }

    const safeCameras = cameras.map(({ encryptedPassword, ...camera }) => camera);
    res.json(safeCameras);
  } catch (error) {
    console.error("Error fetching cameras:", error);
    sendError(res, 500, "Failed to fetch cameras");
  }
});

router.get("/api/cameras/:id", requireAuth, async (req: any, res) => {
  try {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const { encryptedPassword, ...safeCamera } = camera;
    res.json(safeCamera);
  } catch (error) {
    console.error("Error fetching camera:", error);
    sendError(res, 500, "Failed to fetch camera");
  }
});

router.post("/api/cameras", cameraWriteLimiter, requireAdmin, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!req.body || typeof req.body !== "object") {
      return sendError(res, 400, "Request body is required");
    }

    const validatedData = createCameraSchema.parse(req.body);
    const encrypted = await encryptPassword(validatedData.password);
    const { password, ...cameraData } = validatedData;

    const camera = await storage.createCamera({
      ...cameraData,
      userId,
      encryptedPassword: encrypted,
    });

    const { encryptedPassword: _, ...safeCamera } = camera;
    res.status(201).json(safeCamera);

    dashboardCache.delete(`dashboard:${userId}`);
    setTimeout(() => checkAllCameras(), 2000);
  } catch (error: any) {
    console.error("Error creating camera:", error);
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0].message);
    }
    sendError(res, 400, error.message || "Failed to create camera");
  }
});

router.patch("/api/cameras/:id", cameraWriteLimiter, requireAdmin, async (req: any, res) => {
  try {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");
    if (!req.body || typeof req.body !== "object") {
      return sendError(res, 400, "Request body is required");
    }

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const updates: Record<string, any> = {};
    for (const key of Object.keys(req.body)) {
      if (ALLOWED_CAMERA_UPDATE_FIELDS.has(key)) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return sendError(res, 400, "No valid fields to update");
    }

    if (updates.password) {
      if (typeof updates.password !== "string" || updates.password.trim().length === 0) {
        return sendError(res, 400, "Password must be a non-empty string");
      }
      updates.encryptedPassword = await encryptPassword(updates.password);
      delete updates.password;
    }

    const updated = await storage.updateCamera(cameraId, updates);
    if (!updated) return sendError(res, 500, "Failed to update camera");
    const { encryptedPassword: _, ...safeCamera } = updated;

    dashboardCache.delete(`dashboard:${getUserId(req)}`);
    res.json(safeCamera);
  } catch (error: any) {
    console.error("Error updating camera:", error);
    sendError(res, 400, error.message || "Failed to update camera");
  }
});

router.delete("/api/cameras/:id", cameraWriteLimiter, requireAdmin, async (req: any, res) => {
  try {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    await storage.deleteCamera(cameraId);
    dashboardCache.delete(`dashboard:${getUserId(req)}`);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting camera:", error);
    sendError(res, 500, "Failed to delete camera");
  }
});

// Uptime events routes
router.get("/api/cameras/:id/events", requireAuth, async (req: any, res) => {
  try {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const daysResult = validateDays(req.query.days);
    if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysResult);
    const events = await storage.getUptimeEventsInRange(cameraId, startDate, new Date());
    const priorEvent = await storage.getLatestEventBefore(cameraId, startDate);
    res.json({ events, priorEvent: priorEvent || null });
  } catch (error) {
    console.error("Error fetching events:", error);
    sendError(res, 500, "Failed to fetch events");
  }
});

router.get("/api/cameras/uptime/batch", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const daysResult = validateDays(req.query.days);
    if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);

    const cameras = await storage.getCamerasByUserId(userId);
    const uptimeMap = await storage.calculateBatchUptimePercentage(cameras.map(c => c.id), daysResult);
    const uptimeData = cameras.map(camera => ({
      cameraId: camera.id,
      uptime: uptimeMap.get(camera.id)?.percentage ?? 0,
      monitoredDays: uptimeMap.get(camera.id)?.monitoredDays ?? daysResult,
      monitoredSince: camera.createdAt,
    }));
    res.json(uptimeData);
  } catch (error) {
    console.error("Error fetching batch uptime:", error);
    sendError(res, 500, "Failed to fetch batch uptime");
  }
});

router.get("/api/uptime/events", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const daysResult = validateDays(req.query.days);
    if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);

    const cameras = await storage.getCamerasByUserId(userId);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysResult);

    const allEventsAndPrior = await Promise.all(
      cameras.map(async (camera) => {
        const events = await storage.getUptimeEventsInRange(camera.id, startDate, new Date());
        const priorEvent = await storage.getLatestEventBefore(camera.id, startDate);
        return { events, priorEvent };
      })
    );

    const flatEvents = allEventsAndPrior.flatMap(item => item.events);
    const priorEvents = allEventsAndPrior.map(item => item.priorEvent).filter(Boolean);
    res.json({ events: flatEvents, priorEvents });
  } catch (error) {
    console.error("Error fetching uptime events:", error);
    sendError(res, 500, "Failed to fetch uptime events");
  }
});

// Daily uptime percentages for the chart
router.get("/api/uptime/daily", requireAuth, async (req: any, res) => {
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

    if (camerasToProcess.length === 0) return res.json({ data: [] });

    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - days);

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
        const monitoringStart = camera.createdAt ? new Date(camera.createdAt) : null;
        if (monitoringStart && monitoringStart >= effectiveDayEnd) continue;

        const dayEvents = events
          .filter(e => {
            const t = new Date(e.timestamp).getTime();
            return t >= dayStart.getTime() && t < dayEnd.getTime();
          })
          .map(e => ({ timestamp: new Date(e.timestamp), status: e.status }));

        let priorStatus: string | undefined;
        const eventsBeforeDay = events.filter(
          e => new Date(e.timestamp).getTime() < dayStart.getTime()
        );
        if (eventsBeforeDay.length > 0) {
          priorStatus = eventsBeforeDay[eventsBeforeDay.length - 1].status;
        } else if (priorEvent) {
          priorStatus = priorEvent.status;
        }

        if (!priorStatus && camera.lastBootAt) priorStatus = "online";

        const uptime = calculateUptimeFromEvents(dayEvents, dayStart, effectiveDayEnd, priorStatus);
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

router.get("/api/cameras/:id/uptime", requireAuth, async (req: any, res) => {
  try {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const daysResult = validateDays(req.query.days);
    if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const result = await storage.calculateUptimePercentage(cameraId, daysResult);
    res.json({ percentage: result.percentage, days: daysResult, monitoredDays: result.monitoredDays });
  } catch (error) {
    console.error("Error calculating uptime:", error);
    sendError(res, 500, "Failed to calculate uptime");
  }
});

// Manual camera check trigger
router.post("/api/cameras/:id/check", cameraWriteLimiter, requireAuth, async (req: any, res) => {
  try {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    // Run the check asynchronously — respond immediately
    res.json({ message: "Camera check queued" });
    checkSingleCamera(camera).catch(err => {
      console.error(`[Monitor] Manual check failed for ${camera.name}:`, err.message);
    });
  } catch (error) {
    console.error("Error triggering camera check:", error);
    sendError(res, 500, "Failed to trigger camera check");
  }
});

// Model Management Endpoints
router.post("/api/cameras/:id/detect-model", requireAdmin, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== userId) return sendError(res, 403, "Forbidden");

    const { decryptPassword } = await import("../encryption");
    const password = await decryptPassword(camera.encryptedPassword);

    const { detectCameraModel } = await import("../services/cameraDetection");
    const result = await detectCameraModel(camera.ipAddress, camera.username, password);

    await storage.updateCameraModel(cameraId, result);

    let lifecycle = null;
    if (result.model) {
      const { lookupAxisEolWithFetch } = await import("../services/axisEolData");
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
      } catch { /* lifecycle is best-effort */ }
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

router.get("/api/cameras/:id/lifecycle", requireAuth, async (req: any, res) => {
  try {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const cached = (camera.capabilities as any)?.lifecycle;
    if (cached?.lastChecked) {
      const age = Date.now() - new Date(cached.lastChecked).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) return res.json(cached);
    }

    const { lookupAxisEolWithFetch } = await import("../services/axisEolData");
    const eolData = camera.model ? await lookupAxisEolWithFetch(camera.model) : null;

    const lifecycle = {
      status: eolData?.status || "active",
      statusLabel: eolData?.statusLabel || (camera.model ? "Active" : "Unknown Model"),
      discontinuedDate: eolData?.discontinuedDate || null,
      endOfHardwareSupport: eolData?.endOfHardwareSupport || null,
      endOfSoftwareSupport: eolData?.endOfSoftwareSupport || null,
      replacementModel: eolData?.replacementModel || null,
      lastChecked: new Date().toISOString(),
    };

    await storage.updateCameraCapabilities(cameraId, { lifecycle }, true);
    res.json(lifecycle);
  } catch (error) {
    console.error("Error fetching lifecycle data:", error);
    sendError(res, 500, "Failed to fetch lifecycle data");
  }
});

router.post("/api/cameras/:id/probe-analytics", requireAdmin, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== userId) return sendError(res, 403, "Forbidden");

    const { decryptPassword } = await import("../encryption");
    const password = await decryptPassword(camera.encryptedPassword);

    const { probeAnalyticsCapabilities } = await import("../services/analyticsPoller");
    const { getConnectionInfo } = await import("../services/cameraUrl");
    const conn = getConnectionInfo(camera);
    const probeResult = await probeAnalyticsCapabilities(camera.ipAddress, camera.username, password, conn);

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

router.patch("/api/cameras/:id/analytics-config", requireAdmin, async (req: any, res) => {
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
    await storage.updateCameraCapabilities(cameraId, { enabledAnalytics }, true);
    res.json({ success: true, enabledAnalytics });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0].message);
    }
    console.error("Analytics config error:", error);
    sendError(res, 500, error.message || "Failed to update analytics config");
  }
});

router.get("/api/cameras/:id/capabilities", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== userId) return sendError(res, 403, "Forbidden");

    const model = await storage.getCameraModel(cameraId);
    if (!model) return sendError(res, 404, "Camera model not detected yet");
    res.json(model);
  } catch (error: any) {
    console.error("Error fetching camera capabilities:", error);
    sendError(res, 500, error.message || "Failed to fetch capabilities");
  }
});

router.get("/api/models", requireAuth, async (req: any, res) => {
  try {
    const { getAllModels, getModelsBySeries } = await import("../models/cameraModels");
    const { series } = req.query;

    if (series && typeof series === 'string') {
      const validSeries = ['P', 'Q', 'M', 'F'];
      if (!validSeries.includes(series.toUpperCase())) {
        return sendError(res, 400, "Invalid series. Must be one of: P, Q, M, F");
      }
      return res.json(getModelsBySeries(series.toUpperCase() as 'P' | 'Q' | 'M' | 'F'));
    }

    res.json(getAllModels());
  } catch (error: any) {
    console.error("Error fetching models:", error);
    sendError(res, 500, error.message || "Failed to fetch models");
  }
});

router.get("/api/cameras/stats/models", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const allCameras = await storage.getCamerasByUserId(userId);

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

export default router;
