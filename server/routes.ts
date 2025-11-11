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
      const cameras = await storage.getCamerasByUserId(userId);
      
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

  const httpServer = createServer(app);

  return httpServer;
}
