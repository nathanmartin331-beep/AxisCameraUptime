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

      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      const events = await storage.getUptimeEventsByCameraId(req.params.id, limit);
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
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

  const httpServer = createServer(app);

  return httpServer;
}
