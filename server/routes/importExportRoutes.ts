import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { encryptPassword } from "../encryption";
import { checkAllCameras } from "../cameraMonitor";
import type { Camera } from "@shared/schema";
import { z } from "zod";
import { sendError, getUserId, createCameraSchema } from "./shared";

const router = Router();

// CSV import
router.post("/api/cameras/import", requireAdmin, async (req: any, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return sendError(res, 400, "Request body is required");
    }

    const { csvContent } = req.body;
    if (!csvContent || typeof csvContent !== "string") {
      return sendError(res, 400, "Missing or invalid CSV content");
    }

    if (csvContent.length > 1_000_000) {
      return sendError(res, 400, "CSV content too large. Maximum size is 1MB");
    }

    const { parseCSV } = await import("../csvUtils");
    const cameras = parseCSV(csvContent);

    const userId = getUserId(req);
    const imported = [];
    const skipped = [];
    const errors = [];

    const existingCameras = await storage.getCamerasByUserId(userId);
    const normalizeIP = (ip: string) => ip.trim().toLowerCase();
    const existingIPs = new Set(existingCameras.map((c: Camera) => normalizeIP(c.ipAddress)));
    const processedIPs = new Set<string>();

    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i];
      const rowNum = i + 2;

      try {
        const normalizedIP = normalizeIP(camera.ipAddress);

        if (existingIPs.has(normalizedIP) || processedIPs.has(normalizedIP)) {
          const reason = existingIPs.has(normalizedIP)
            ? "Duplicate IP (already exists in database)"
            : "Duplicate IP (appears earlier in this file)";
          skipped.push({ row: rowNum, name: camera.name, ipAddress: camera.ipAddress, reason });
          continue;
        }

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

        const encrypted = await encryptPassword(validatedData.password);
        const { password: _, ...cameraData } = validatedData;

        const newCamera = await storage.createCamera({
          userId,
          ...cameraData,
          encryptedPassword: encrypted,
        });

        imported.push(newCamera);
        processedIPs.add(normalizedIP);
        existingIPs.add(normalizedIP);
      } catch (validationError: any) {
        errors.push({
          row: rowNum,
          name: camera.name || "Unknown",
          ipAddress: camera.ipAddress || "Unknown",
          error: validationError.message || "Validation failed",
        });
      }
    }

    let message = `Successfully imported ${imported.length} camera${imported.length !== 1 ? 's' : ''}`;
    if (skipped.length > 0) message += `, skipped ${skipped.length} duplicate${skipped.length !== 1 ? 's' : ''}`;
    if (errors.length > 0) message += `, ${errors.length} error${errors.length !== 1 ? 's' : ''}`;

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

    if (imported.length > 0) setTimeout(() => checkAllCameras(), 2000);
  } catch (error: any) {
    console.error("Error importing cameras:", error);
    sendError(res, 400, error.message || "Failed to import cameras");
  }
});

// CSV export
router.get("/api/cameras/export", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const cameras = await storage.getCamerasByUserId(userId);
    const { generateCameraCSV } = await import("../csvUtils");
    const csv = generateCameraCSV(cameras);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=cameras.csv");
    res.send(csv);
  } catch (error) {
    console.error("Error exporting cameras:", error);
    sendError(res, 500, "Failed to export cameras");
  }
});

// Uptime report export
router.get("/api/cameras/export/uptime", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const cameras = await storage.getCamerasByUserId(userId);

    const cameraData = await Promise.all(
      cameras.map(async (camera) => {
        const { percentage } = await storage.calculateUptimePercentage(camera.id, 30);
        return { name: camera.name, ipAddress: camera.ipAddress, uptime: percentage };
      })
    );

    const { generateUptimeReportCSV } = await import("../csvUtils");
    const csv = generateUptimeReportCSV(cameraData);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=uptime-report.csv");
    res.send(csv);
  } catch (error) {
    console.error("Error exporting uptime report:", error);
    sendError(res, 500, "Failed to export uptime report");
  }
});

export default router;
