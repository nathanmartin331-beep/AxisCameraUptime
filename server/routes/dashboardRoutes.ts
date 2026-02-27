import { Router } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { z } from "zod";
import {
  validateDays, sendError, getUserId,
  dashboardCache, dashboardCacheSet, DASHBOARD_CACHE_TTL_MS,
} from "./shared";

const router = Router();

// Dashboard summary (with 30s response cache per user)
router.get("/api/dashboard/summary", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);

    const cacheKey = `dashboard:${userId}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);

    const cameras = await storage.getCamerasByUserId(userId);
    const videoCameras = cameras.filter(c => c.series !== 'C');
    const speakers = cameras.filter(c => c.series === 'C');

    const totalCameras = cameras.length;
    const onlineCameras = videoCameras.filter(c => c.currentStatus === "online").length;
    const offlineCameras = videoCameras.filter(c => c.currentStatus === "offline").length;
    const unknownCameras = videoCameras.filter(c => c.currentStatus === "unknown").length;

    const videoOk = videoCameras.filter(c => c.videoStatus === "video_ok").length;
    const videoFailed = videoCameras.filter(c => c.videoStatus === "video_failed").length;
    const videoUnknown = videoCameras.filter(c => !c.videoStatus || c.videoStatus === "unknown").length;

    const speakerTotal = speakers.length;
    const speakerOnline = speakers.filter(c => c.currentStatus === "online").length;
    const speakerOffline = speakers.filter(c => c.currentStatus === "offline").length;

    let avgUptime = 0;
    let speakerAvgUptime = 0;
    if (cameras.length > 0) {
      const allIds = cameras.map(c => c.id);
      const uptimeMap = await storage.calculateBatchUptimePercentage(allIds, 30);

      if (videoCameras.length > 0) {
        let videoTotal = 0;
        for (const c of videoCameras) {
          videoTotal += uptimeMap.get(c.id)?.percentage ?? 0;
        }
        avgUptime = videoTotal / videoCameras.length;
      }

      if (speakerTotal > 0) {
        let speakerTotal2 = 0;
        for (const c of speakers) {
          speakerTotal2 += uptimeMap.get(c.id)?.percentage ?? 0;
        }
        speakerAvgUptime = speakerTotal2 / speakerTotal;
      }
    }

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
      const analyticsCamIds = analyticsCameras.map(c => c.id);

      // Start with raw events (latest per camera), include line_crossing
      // since crossline cameras report in/out via line_crossing metadata
      const latestByCamera = await storage.getLatestAnalyticsPerCamera(
        analyticsCamIds,
        ["people_in", "people_out", "occupancy", "line_crossing"]
      );

      for (const camId of analyticsCamIds) {
        const camData = latestByCamera.get(camId);
        if (!camData) continue;
        let camIn = camData.get("people_in")?.value ?? 0;
        let camOut = camData.get("people_out")?.value ?? 0;

        // Crossline cameras may only report via line_crossing metadata
        if (camIn === 0 && camOut === 0) {
          const lcData = camData.get("line_crossing");
          if (lcData?.metadata) {
            if (lcData.metadata.in !== undefined) camIn += Number(lcData.metadata.in);
            if (lcData.metadata.out !== undefined) camOut += Number(lcData.metadata.out);
          }
        }

        totalPeopleIn += camIn;
        totalPeopleOut += camOut;
        currentOccupancy += camData.get("occupancy")?.value ?? 0;
      }

      // Fall back to 3-tier merged totals independently per metric when
      // raw events show 0 (rolled up by aggregation service).
      if (totalPeopleIn === 0) {
        for (const camId of analyticsCamIds) {
          const inTotals = await storage.getAnalyticsDailyTotals(camId, "people_in", 1);
          if (inTotals.length > 0) totalPeopleIn += inTotals[inTotals.length - 1].total;
        }
        // Also check line_crossing daily totals for in metadata
        if (totalPeopleIn === 0) {
          for (const camId of analyticsCamIds) {
            const lcTotals = await storage.getAnalyticsDailyTotals(camId, "line_crossing", 1);
            if (lcTotals.length > 0 && lcTotals[lcTotals.length - 1].metadata?.in !== undefined) {
              totalPeopleIn += Number(lcTotals[lcTotals.length - 1].metadata!.in);
            }
          }
        }
      }
      if (totalPeopleOut === 0) {
        for (const camId of analyticsCamIds) {
          const outTotals = await storage.getAnalyticsDailyTotals(camId, "people_out", 1);
          if (outTotals.length > 0) totalPeopleOut += outTotals[outTotals.length - 1].total;
        }
        if (totalPeopleOut === 0) {
          for (const camId of analyticsCamIds) {
            const lcTotals = await storage.getAnalyticsDailyTotals(camId, "line_crossing", 1);
            if (lcTotals.length > 0 && lcTotals[lcTotals.length - 1].metadata?.out !== undefined) {
              totalPeopleOut += Number(lcTotals[lcTotals.length - 1].metadata!.out);
            }
          }
        }
      }
      if (currentOccupancy === 0) {
        for (const camId of analyticsCamIds) {
          const occTotals = await storage.getAnalyticsDailyTotals(camId, "occupancy", 1);
          if (occTotals.length > 0) currentOccupancy += occTotals[occTotals.length - 1].total;
        }
      }
    }

    // Total occupancy across all analytics cameras (sum of per-camera occupancy)
    let totalOccupancy = currentOccupancy;
    if (totalOccupancy === 0 && analyticsCameras.length > 0) {
      const analyticsCamIds = analyticsCameras.map(c => c.id);
      for (const camId of analyticsCamIds) {
        const occTotals = await storage.getAnalyticsDailyTotals(camId, "occupancy", 1);
        if (occTotals.length > 0) totalOccupancy += occTotals[occTotals.length - 1].total;
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
      totalOccupancy,
      analyticsEnabled,
      speakerTotal,
      speakerOnline,
      speakerOffline,
      speakerAvgUptime: Math.round(speakerAvgUptime * 100) / 100,
    };

    dashboardCacheSet(cacheKey, { data: responseData, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS });
    res.json(responseData);
  } catch (error) {
    console.error("Error fetching dashboard summary:", error);
    sendError(res, 500, "Failed to fetch dashboard summary");
  }
});

// Reliability metrics
router.get("/api/metrics/camera/:id", requireAuth, async (req: any, res) => {
  try {
    const { validateId } = await import("./shared");
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const daysResult = validateDays(req.query.days);
    if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);

    const camera = await storage.getCameraById(cameraId);
    if (!camera) return sendError(res, 404, "Camera not found");
    if (camera.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const { calculateCameraMetrics } = await import("../reliabilityMetrics");
    res.json(await calculateCameraMetrics(cameraId, daysResult));
  } catch (error) {
    console.error("Error fetching camera metrics:", error);
    sendError(res, 500, "Failed to fetch camera metrics");
  }
});

router.get("/api/metrics/sites", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const daysResult = validateDays(req.query.days);
    if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);

    const { calculateSiteMetrics } = await import("../reliabilityMetrics");
    res.json(await calculateSiteMetrics(userId, daysResult));
  } catch (error) {
    console.error("Error fetching site metrics:", error);
    sendError(res, 500, "Failed to fetch site metrics");
  }
});

router.get("/api/metrics/network", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const daysResult = validateDays(req.query.days);
    if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);

    const { calculateNetworkMetrics } = await import("../reliabilityMetrics");
    res.json(await calculateNetworkMetrics(userId, daysResult));
  } catch (error) {
    console.error("Error fetching network metrics:", error);
    sendError(res, 500, "Failed to fetch network metrics");
  }
});

// Dashboard layout
router.get("/api/dashboard/layout", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const layout = await storage.getDashboardLayout(userId);
    res.json(layout || { widgets: [] });
  } catch (error) {
    console.error("Error fetching dashboard layout:", error);
    sendError(res, 500, "Failed to fetch dashboard layout");
  }
});

router.post("/api/dashboard/layout", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    if (!req.body || typeof req.body !== "object") {
      return sendError(res, 400, "Request body is required");
    }

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
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0]?.message || "Invalid layout data");
    sendError(res, 500, "Failed to save dashboard layout");
  }
});

export default router;
