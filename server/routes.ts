import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { encryptPassword } from "./encryption";
import { insertCameraSchema, type Camera } from "@shared/schema";
import type { SafeUser } from "./storage";
import { z } from "zod";

// Schema for accepting plain password from frontend (used for both manual add and CSV import)
// Frontend doesn't send userId or encryptedPassword - userId comes from session, password is encrypted server-side
const createCameraSchema = insertCameraSchema
  .omit({ encryptedPassword: true, userId: true })
  .extend({
    password: z.string().min(1, "Password is required"),
  });

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
        cameras = await storage.getCamerasByModel(userId, model);
      }
      // Filter by PTZ capability
      else if (hasPTZ === 'true') {
        cameras = await storage.getCamerasByCapability(userId, 'hasPTZ');
      }
      // Filter by audio capability
      else if (hasAudio === 'true') {
        cameras = await storage.getCamerasByCapability(userId, 'hasAudio');
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
      res.status(500).json({ message: "Failed to fetch cameras" });
    }
  });

  app.get("/api/cameras/:id", requireAuth, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      // Verify ownership
      if (camera.userId !== getUserId(req)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { encryptedPassword, ...safeCamera } = camera;
      res.json(safeCamera);
    } catch (error) {
      console.error("Error fetching camera:", error);
      res.status(500).json({ message: "Failed to fetch camera" });
    }
  });

  app.post("/api/cameras", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
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
    } catch (error: any) {
      console.error("Error creating camera:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(400).json({ message: error.message || "Failed to create camera" });
    }
  });

  app.patch("/api/cameras/:id", requireAuth, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== getUserId(req)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updates = { ...req.body };
      
      // Encrypt password if it's being updated (accept plain password)
      if (updates.password) {
        updates.encryptedPassword = await encryptPassword(updates.password);
        delete updates.password; // Remove plaintext password
      }

      const updated = await storage.updateCamera(req.params.id, updates);
      const { encryptedPassword: _, ...safeCamera } = updated!;
      res.json(safeCamera);
    } catch (error: any) {
      console.error("Error updating camera:", error);
      res.status(400).json({ message: error.message || "Failed to update camera" });
    }
  });

  app.delete("/api/cameras/:id", requireAuth, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== getUserId(req)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deleteCamera(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting camera:", error);
      res.status(500).json({ message: "Failed to delete camera" });
    }
  });

  // Uptime events routes
  app.get("/api/cameras/:id/events", requireAuth, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== getUserId(req)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const events = await storage.getUptimeEventsInRange(
        req.params.id,
        startDate,
        new Date()
      );

      const priorEvent = await storage.getLatestEventBefore(req.params.id, startDate);
      
      res.json({
        events,
        priorEvent: priorEvent || null,
      });
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.get("/api/cameras/uptime/batch", requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const cameras = await storage.getCamerasByUserId(userId);
      const days = req.query.days ? parseInt(req.query.days as string) : 30;

      const uptimeData = await Promise.all(
        cameras.map(async (camera) => {
          const uptime = await storage.calculateUptimePercentage(camera.id, days);
          return {
            cameraId: camera.id,
            uptime,
          };
        })
      );

      res.json(uptimeData);
    } catch (error) {
      console.error("Error fetching batch uptime:", error);
      res.status(500).json({ message: "Failed to fetch batch uptime" });
    }
  });

  app.get("/api/uptime/events", requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const cameras = await storage.getCamerasByUserId(userId);
      const days = req.query.days ? parseInt(req.query.days as string) : 30;

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
      res.status(500).json({ message: "Failed to fetch uptime events" });
    }
  });

  app.get("/api/cameras/:id/uptime", requireAuth, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== getUserId(req)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const days = req.query.days ? parseInt(req.query.days) : 30;
      const percentage = await storage.calculateUptimePercentage(req.params.id, days);
      res.json({ percentage, days });
    } catch (error) {
      console.error("Error calculating uptime:", error);
      res.status(500).json({ message: "Failed to calculate uptime" });
    }
  });

  // Dashboard summary route
  app.get("/api/dashboard/summary", requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const cameras = await storage.getCamerasByUserId(userId);

      const totalCameras = cameras.length;
      const onlineCameras = cameras.filter(c => c.currentStatus === "online").length;
      const offlineCameras = cameras.filter(c => c.currentStatus === "offline").length;
      const unknownCameras = cameras.filter(c => c.currentStatus === "unknown").length;
      
      // Video health metrics
      const videoOk = cameras.filter(c => c.videoStatus === "video_ok").length;
      const videoFailed = cameras.filter(c => c.videoStatus === "video_failed").length;
      const videoUnknown = cameras.filter(c => !c.videoStatus || c.videoStatus === "unknown").length;

      // Calculate average uptime across all cameras (30 days)
      let avgUptime = 0;
      if (totalCameras > 0) {
        const uptimePromises = cameras.map(c => 
          storage.calculateUptimePercentage(c.id, 30)
        );
        const uptimes = await Promise.all(uptimePromises);
        avgUptime = uptimes.reduce((a, b) => a + b, 0) / totalCameras;
      }

      res.json({
        totalCameras,
        onlineCameras,
        offlineCameras,
        unknownCameras,
        videoOk,
        videoFailed,
        videoUnknown,
        avgUptime: Math.round(avgUptime * 100) / 100,
      });
    } catch (error) {
      console.error("Error fetching dashboard summary:", error);
      res.status(500).json({ message: "Failed to fetch dashboard summary" });
    }
  });

  // Manual camera check trigger
  app.post("/api/cameras/:id/check", requireAuth, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);

      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== getUserId(req)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Import the checkAllCameras function and trigger a single camera check
      res.json({ message: "Camera check queued" });
    } catch (error) {
      console.error("Error triggering camera check:", error);
      res.status(500).json({ message: "Failed to trigger camera check" });
    }
  });

  // Model Management Endpoints

  // POST /api/cameras/:id/detect-model - Manually trigger model detection
  app.post("/api/cameras/:id/detect-model", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const cameraId = req.params.id;

      // Get camera
      const camera = await storage.getCameraById(cameraId);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      // Verify ownership
      if (camera.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
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

      res.json({
        success: true,
        model: result.model,
        series: result.series,
        capabilities: result.capabilities,
      });
    } catch (error: any) {
      console.error("Model detection error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to detect camera model"
      });
    }
  });

  // GET /api/cameras/:id/capabilities - Get camera capabilities
  app.get("/api/cameras/:id/capabilities", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const cameraId = req.params.id;

      // Verify camera exists and user owns it
      const camera = await storage.getCameraById(cameraId);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const model = await storage.getCameraModel(cameraId);
      if (!model) {
        return res.status(404).json({ message: "Camera model not detected yet" });
      }

      res.json(model);
    } catch (error: any) {
      console.error("Error fetching camera capabilities:", error);
      res.status(500).json({ message: error.message || "Failed to fetch capabilities" });
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
          return res.status(400).json({ message: "Invalid series. Must be one of: P, Q, M, F" });
        }
        const models = getModelsBySeries(series.toUpperCase() as 'P' | 'Q' | 'M' | 'F');
        return res.json(models);
      }

      const models = getAllModels();
      res.json(models);
    } catch (error: any) {
      console.error("Error fetching models:", error);
      res.status(500).json({ message: error.message || "Failed to fetch models" });
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
      res.status(500).json({ message: error.message || "Failed to fetch model statistics" });
    }
  });

  // Network scanning routes
  app.post("/api/scan/subnet", requireAuth, async (req: any, res) => {
    try {
      const { subnet, startRange, endRange } = req.body;

      if (!subnet || !startRange || !endRange) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      const { scanSubnet } = await import("./networkScanner");
      const results = await scanSubnet(subnet, startRange, endRange);

      res.json({
        total: results.length,
        found: results.filter((r) => r.isAxis).length,
        results: results.filter((r) => r.isAxis),
      });
    } catch (error: any) {
      console.error("Error scanning subnet:", error);
      res.status(500).json({ message: error.message || "Failed to scan subnet" });
    }
  });

  // Network scan with CIDR notation (for frontend NetworkScan page)
  app.post("/api/cameras/scan", requireAuth, async (req: any, res) => {
    try {
      const scanRequestSchema = z.object({
        subnet: z.string().min(1, "Subnet is required"),
      });

      const { subnet } = scanRequestSchema.parse(req.body);

      // Parse CIDR notation (e.g., "192.168.1.0/24", "172.16.0.0/16", "10.0.0.0/8")
      const [networkAddress, prefixLengthStr] = subnet.split('/');
      
      if (!networkAddress || !prefixLengthStr) {
        return res.status(400).json({ message: "Invalid CIDR notation. Expected format: 192.168.1.0/24" });
      }

      const prefixLength = parseInt(prefixLengthStr);
      if (prefixLength < 8 || prefixLength > 30) {
        return res.status(400).json({ message: "Prefix length must be between 8 and 30" });
      }

      // Parse IP address octets
      const octets = networkAddress.split('.').map(o => parseInt(o));
      if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) {
        return res.status(400).json({ message: "Invalid IP address format" });
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
        return res.status(400).json({ 
          message: `Scan too large: ${totalHosts} hosts. Maximum ${MAX_SCAN_SIZE} hosts per scan. Use a smaller CIDR range (e.g., /20 or higher).` 
        });
      }

      const startIP = numberToIP(startIPNum);
      const endIP = numberToIP(endIPNum);

      console.log(`[API] Scanning CIDR ${subnet}`);
      console.log(`[API] Range: ${startIP} to ${endIP} (${totalHosts} hosts)`);

      const { scanIPRange } = await import("./networkScanner");
      const results = await scanIPRange(startIP, endIP);

      // Map results to frontend expected format
      const cameras = results
        .filter(r => r.isAxis)
        .map(r => ({
          ipAddress: r.ipAddress,
          detected: r.isAxis,
        }));

      res.json({ cameras });
    } catch (error: any) {
      console.error("Error scanning network:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: error.message || "Failed to scan network" });
    }
  });

  // Test existing camera connection - polls a user's own camera and returns validation results
  app.post("/api/cameras/:id/test-connection", requireAuth, async (req: any, res) => {
    try {
      const cameraId = req.params.id;
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
      
      // Import pollCamera helper
      const cameraMonitor = await import("./cameraMonitor");
      const pollCamera = (cameraMonitor as any).pollCameraForTest || (async (ip: string, user: string, pass: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        try {
          const url = `http://${ip}/axis-cgi/systemready.cgi`;
          const startTime = Date.now();
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "AxisCameraMonitor/1.0" },
          });
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
  app.post("/api/cameras/import", requireAuth, async (req: any, res) => {
    try {
      const { csvContent } = req.body;

      if (!csvContent) {
        return res.status(400).json({ message: "Missing CSV content" });
      }

      const { parseCSV } = await import("./csvUtils");
      const cameras = parseCSV(csvContent);

      // Import cameras for the current user
      const userId = (req.user as any).id;
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
    } catch (error: any) {
      console.error("Error importing cameras:", error);
      res.status(400).json({ message: error.message || "Failed to import cameras" });
    }
  });

  // CSV export routes
  app.get("/api/cameras/export", requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const cameras = await storage.getCamerasByUserId(userId);

      const { generateCameraCSV } = await import("./csvUtils");
      const csv = generateCameraCSV(cameras);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=cameras.csv");
      res.send(csv);
    } catch (error) {
      console.error("Error exporting cameras:", error);
      res.status(500).json({ message: "Failed to export cameras" });
    }
  });

  app.get("/api/cameras/export/uptime", requireAuth, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const cameras = await storage.getCamerasByUserId(userId);

      // Calculate uptime for each camera
      const cameraData = await Promise.all(
        cameras.map(async (camera) => {
          const uptime = await storage.calculateUptimePercentage(camera.id, 30);
          return {
            name: camera.name,
            ipAddress: camera.ipAddress,
            uptime,
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
      res.status(500).json({ message: "Failed to export uptime report" });
    }
  });

  // Reliability metrics endpoints
  app.get("/api/metrics/camera/:id", requireAuth, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== getUserId(req)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const days = parseInt(req.query.days as string) || 30;
      
      const { calculateCameraMetrics } = await import("./reliabilityMetrics");
      const metrics = await calculateCameraMetrics(req.params.id, days);

      res.json(metrics);
    } catch (error) {
      console.error("Error fetching camera metrics:", error);
      res.status(500).json({ message: "Failed to fetch camera metrics" });
    }
  });

  app.get("/api/metrics/sites", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const days = parseInt(req.query.days as string) || 30;
      
      const { calculateSiteMetrics } = await import("./reliabilityMetrics");
      const metrics = await calculateSiteMetrics(userId, days);

      res.json(metrics);
    } catch (error) {
      console.error("Error fetching site metrics:", error);
      res.status(500).json({ message: "Failed to fetch site metrics" });
    }
  });

  app.get("/api/metrics/network", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const days = parseInt(req.query.days as string) || 30;
      
      const { calculateNetworkMetrics } = await import("./reliabilityMetrics");
      const metrics = await calculateNetworkMetrics(userId, days);

      res.json(metrics);
    } catch (error) {
      console.error("Error fetching network metrics:", error);
      res.status(500).json({ message: "Failed to fetch network metrics" });
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
      res.status(500).json({ message: "Failed to fetch dashboard layout" });
    }
  });

  app.post("/api/dashboard/layout", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      // Validate layout schema
      const layoutSchema = z.object({
        widgets: z.array(z.object({
          id: z.string(),
          type: z.string(),
          x: z.number(),
          y: z.number().refine(val => isFinite(val) && val >= 0, "Y must be a finite positive number"),
          w: z.number().min(1),
          h: z.number().min(1),
        })),
      });
      
      const validatedLayout = layoutSchema.parse(req.body);
      const layout = await storage.saveDashboardLayout(userId, validatedLayout);

      res.json(layout);
    } catch (error: any) {
      console.error("Error saving dashboard layout:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid layout data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to save dashboard layout" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
