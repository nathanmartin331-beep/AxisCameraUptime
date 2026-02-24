import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { z } from "zod";
import { sendError, getUserId } from "./shared";

const router = Router();

// GET /api/settings
router.get("/api/settings", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const settings = await storage.getUserSettings(userId);
    res.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    sendError(res, 500, "Failed to fetch settings");
  }
});

// PATCH /api/settings
router.patch("/api/settings", requireAdmin, async (req: any, res) => {
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
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    console.error("Error updating settings:", error);
    sendError(res, 500, "Failed to update settings");
  }
});

// POST /api/admin/cleanup
router.post("/api/admin/cleanup", requireAdmin, async (req: any, res) => {
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

export default router;
