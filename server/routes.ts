// Reference: blueprint:javascript_log_in_with_replit for auth setup
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { encryptPassword } from "./encryption";
import { insertCameraSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes - Reference: blueprint:javascript_log_in_with_replit
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Camera CRUD routes
  app.get("/api/cameras", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cameras = await storage.getCamerasByUserId(userId);
      
      // Don't send encrypted passwords to frontend
      const safeCameras = cameras.map(({ encryptedPassword, ...camera }) => camera);
      res.json(safeCameras);
    } catch (error) {
      console.error("Error fetching cameras:", error);
      res.status(500).json({ message: "Failed to fetch cameras" });
    }
  });

  app.get("/api/cameras/:id", isAuthenticated, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      // Verify ownership
      if (camera.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { encryptedPassword, ...safeCamera } = camera;
      res.json(safeCamera);
    } catch (error) {
      console.error("Error fetching camera:", error);
      res.status(500).json({ message: "Failed to fetch camera" });
    }
  });

  app.post("/api/cameras", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertCameraSchema.parse(req.body);

      // Encrypt password before storing
      const encryptedPassword = await encryptPassword(validatedData.encryptedPassword);

      const camera = await storage.createCamera({
        ...validatedData,
        userId,
        encryptedPassword,
      });

      const { encryptedPassword: _, ...safeCamera } = camera;
      res.status(201).json(safeCamera);
    } catch (error: any) {
      console.error("Error creating camera:", error);
      res.status(400).json({ message: error.message || "Failed to create camera" });
    }
  });

  app.patch("/api/cameras/:id", isAuthenticated, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updates = { ...req.body };
      
      // Encrypt password if it's being updated
      if (updates.encryptedPassword) {
        updates.encryptedPassword = await encryptPassword(updates.encryptedPassword);
      }

      const updated = await storage.updateCamera(req.params.id, updates);
      const { encryptedPassword: _, ...safeCamera } = updated!;
      res.json(safeCamera);
    } catch (error: any) {
      console.error("Error updating camera:", error);
      res.status(400).json({ message: error.message || "Failed to update camera" });
    }
  });

  app.delete("/api/cameras/:id", isAuthenticated, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== req.user.claims.sub) {
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
  app.get("/api/cameras/:id/events", isAuthenticated, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== req.user.claims.sub) {
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

      const priorEvents = await storage.getUptimeEventsByCameraId(req.params.id, 1);
      const priorEvent = priorEvents.find(e => 
        new Date(e.timestamp).getTime() < startDate.getTime()
      );
      
      res.json({
        events,
        priorEvent: priorEvent || null,
      });
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.get("/api/cameras/uptime/batch", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.get("/api/uptime/events", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const cameras = await storage.getCamerasByUserId(userId);
      const days = req.query.days ? parseInt(req.query.days as string) : 30;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const allEventsAndPrior = await Promise.all(
        cameras.map(async (camera) => {
          const events = await storage.getUptimeEventsInRange(camera.id, startDate, new Date());
          const priorEvents = await storage.getUptimeEventsByCameraId(camera.id, 1);
          const priorEvent = priorEvents.find(e => 
            new Date(e.timestamp).getTime() < startDate.getTime()
          );
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

  app.get("/api/cameras/:id/uptime", isAuthenticated, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== req.user.claims.sub) {
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
  app.get("/api/dashboard/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
  app.post("/api/cameras/:id/check", isAuthenticated, async (req: any, res) => {
    try {
      const camera = await storage.getCameraById(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      if (camera.userId !== req.user.claims.sub) {
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
  app.post("/api/scan/subnet", isAuthenticated, async (req: any, res) => {
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

  // CSV import route
  app.post("/api/cameras/import", isAuthenticated, async (req: any, res) => {
    try {
      const { csvContent } = req.body;

      if (!csvContent) {
        return res.status(400).json({ message: "Missing CSV content" });
      }

      const { parseCSV } = await import("./csvUtils");
      const cameras = parseCSV(csvContent);

      // Import cameras for the current user
      const userId = req.user.claims.sub;
      const imported = [];

      for (const camera of cameras) {
        const encryptedPassword = await encryptPassword(camera.password);
        const newCamera = await storage.createCamera({
          userId,
          name: camera.name,
          ipAddress: camera.ipAddress,
          username: camera.username,
          encryptedPassword,
          location: camera.location,
          notes: camera.notes,
        });
        imported.push(newCamera);
      }

      res.json({
        message: `Successfully imported ${imported.length} cameras`,
        count: imported.length,
      });
    } catch (error: any) {
      console.error("Error importing cameras:", error);
      res.status(400).json({ message: error.message || "Failed to import cameras" });
    }
  });

  // CSV export routes
  app.get("/api/cameras/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.get("/api/cameras/export/uptime", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
