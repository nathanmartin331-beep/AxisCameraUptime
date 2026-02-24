import { Router } from "express";
import { storage } from "../storage";
import { sqlite } from "../db";
import { requireAuth } from "../auth";
import { analyticsBroadcaster } from "../services/analyticsEventBroadcaster";
import { validateId, validateDays, sendError, getUserId } from "./shared";

const router = Router();

// Per-camera analytics
router.get("/api/cameras/:id/analytics", requireAuth, async (req: any, res) => {
  try {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const daysResult = validateDays(req.query.days, 1);
    if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);

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
    startDate.setDate(startDate.getDate() - daysResult);

    const events = await storage.getAnalyticsEvents(cameraId, eventType, startDate, endDate);
    const latest = await storage.getLatestAnalyticsEvent(cameraId, eventType);

    const scenarioEvents = await storage.getLatestAnalyticsEventsByScenario(cameraId, eventType);
    const scenarioMap = new Map<string, { scenario: string; value: number; metadata?: Record<string, any> | null }>();
    for (const e of scenarioEvents) {
      const name = (e.metadata as Record<string, any>)?.scenario || "Default";
      const existing = scenarioMap.get(name);
      if (!existing || e.value > existing.value) {
        scenarioMap.set(name, { scenario: name, value: e.value, metadata: e.metadata });
      }
    }
    const scenarios = Array.from(scenarioMap.values());
    const total = scenarios.reduce((sum, s) => sum + s.value, 0);

    res.json({
      cameraId,
      eventType,
      latest: latest || null,
      scenarios: scenarios.length > 0 ? scenarios : undefined,
      total: total || (latest?.value ?? null),
      events,
    });
  } catch (error) {
    console.error("Error fetching camera analytics:", error);
    sendError(res, 500, "Failed to fetch camera analytics");
  }
});

// Camera analytics daily history
router.get("/api/cameras/:id/analytics/daily", requireAuth, async (req: any, res) => {
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
    let scenarioTotals: Record<string, Array<{ date: string; total: number; metadata?: Record<string, any> }>> | undefined;
    try {
      const raw = await storage.getAnalyticsDailyTotalsByScenario(cameraId, eventType, days);
      const scenarioNames = Object.keys(raw);
      if (scenarioNames.length > 1) scenarioTotals = raw;
    } catch (err) {
      console.error("Error fetching per-scenario daily totals (non-fatal):", err);
    }

    res.json({ cameraId, eventType, days, dailyTotals, scenarioTotals });
  } catch (error) {
    console.error("Error fetching daily analytics:", error);
    sendError(res, 500, "Failed to fetch daily analytics");
  }
});

// Analytics SSE Streams
router.get("/api/analytics/stream", requireAuth, async (req: any, res) => {
  const userId = getUserId(req);
  const filterCameraId = typeof req.query.cameraId === "string" ? validateId(req.query.cameraId) : null;

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

  const unsubscribe = filterCameraId
    ? analyticsBroadcaster.subscribe(filterCameraId, (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      })
    : analyticsBroadcaster.subscribeAll((payload) => {
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

// Single camera analytics stream
router.get("/api/cameras/:id/analytics/stream", requireAuth, async (req: any, res) => {
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

// Group analytics summary
router.get("/api/groups/:id/analytics", requireAuth, async (req: any, res) => {
  try {
    const groupId = validateId(req.params.id);
    if (!groupId) return sendError(res, 400, "Invalid group ID");

    const daysResult = validateDays(req.query.days, 1);
    if (typeof daysResult === "object") return sendError(res, 400, daysResult.error);

    const group = await storage.getGroupById(groupId);
    if (!group) return sendError(res, 404, "Group not found");
    if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysResult);

    const summary = await storage.getGroupAnalyticsSummary(groupId, startDate, endDate);
    res.json(summary);
  } catch (error) {
    console.error("Error fetching group analytics:", error);
    sendError(res, 500, "Failed to fetch group analytics");
  }
});

// Group analytics trend data
router.get("/api/groups/:id/analytics/trend", requireAuth, async (req: any, res) => {
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

    const members = await storage.getGroupMembers(groupId);
    const memberIds = members.map((m) => m.id);
    const allEvents: Array<{ timestamp: Date; value: number; cameraId: string }> = [];

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

      const hourlyRows = sqlite.prepare(`
        SELECT camera_id, hour_start, max_value
        FROM analytics_hourly_summary
        WHERE camera_id IN (${placeholders}) AND event_type = ? AND hour_start >= ? AND hour_start <= ?
      `).all(...memberIds, eventType, startTs, endTs) as Array<{ camera_id: string; hour_start: number; max_value: number }>;
      for (const row of hourlyRows) {
        allEvents.push({ timestamp: new Date(row.hour_start * 1000), value: row.max_value ?? 0, cameraId: row.camera_id });
      }
    }

    for (const member of members) {
      const events = await storage.getAnalyticsEvents(member.id, eventType, startDate, endDate);
      for (const e of events) {
        allEvents.push({ timestamp: new Date(e.timestamp), value: e.value, cameraId: e.cameraId });
      }
    }

    allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const buckets: Record<string, number> = {};
    if (eventType === "occupancy") {
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

export default router;
