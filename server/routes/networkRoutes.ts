import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { encryptPassword } from "../encryption";
import { checkAllCameras } from "../cameraMonitor";
import { buildCameraUrl, getCameraDispatcher, getConnectionInfo } from "../services/cameraUrl";
import type { Camera } from "@shared/schema";
import { z } from "zod";
import { validateId, sendError, getUserId } from "./shared";

const router = Router();

// Subnet scan
router.post("/api/scan/subnet", requireAdmin, async (req: any, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return sendError(res, 400, "Request body is required");
    }

    const { subnet, startRange, endRange } = req.body;

    if (!subnet || typeof subnet !== "string") return sendError(res, 400, "subnet is required and must be a string");
    if (startRange === undefined || startRange === null || typeof startRange !== "number" || !Number.isInteger(startRange) || startRange < 1 || startRange > 254)
      return sendError(res, 400, "startRange must be an integer between 1 and 254");
    if (endRange === undefined || endRange === null || typeof endRange !== "number" || !Number.isInteger(endRange) || endRange < 1 || endRange > 254)
      return sendError(res, 400, "endRange must be an integer between 1 and 254");
    if (startRange > endRange) return sendError(res, 400, "startRange must be less than or equal to endRange");

    const subnetTrimmed = subnet.trim();
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnetTrimmed)) {
      return sendError(res, 400, "Invalid subnet format. Expected format: 192.168.1");
    }

    const { scanSubnet } = await import("../networkScanner");
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

// CIDR scan
router.post("/api/cameras/scan", requireAdmin, async (req: any, res) => {
  try {
    const scanRequestSchema = z.object({
      subnet: z.string().min(1, "Subnet is required"),
    });

    const { subnet } = scanRequestSchema.parse(req.body);
    const [networkAddress, prefixLengthStr] = subnet.split('/');

    if (!networkAddress || !prefixLengthStr) {
      return sendError(res, 400, "Invalid CIDR notation. Expected format: 192.168.1.0/24");
    }

    const prefixLength = parseInt(prefixLengthStr);
    if (isNaN(prefixLength) || prefixLength < 8 || prefixLength > 30) {
      return sendError(res, 400, "Prefix length must be an integer between 8 and 30");
    }

    const octets = networkAddress.split('.').map(o => parseInt(o));
    if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) {
      return sendError(res, 400, "Invalid IP address format");
    }

    const ipToNumber = (octets: number[]) =>
      (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
    const numberToIP = (num: number) =>
      `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;

    const ipNum = ipToNumber(octets);
    const hostBits = 32 - prefixLength;
    const subnetMask = ~((1 << hostBits) - 1);
    const networkNum = (ipNum & subnetMask) >>> 0;
    const broadcastNum = (networkNum | ((1 << hostBits) - 1)) >>> 0;

    const startIPNum = networkNum + 1;
    const endIPNum = broadcastNum - 1;
    const totalHosts = endIPNum - startIPNum + 1;

    const MAX_SCAN_SIZE = 10000;
    if (totalHosts > MAX_SCAN_SIZE) {
      return sendError(res, 400, `Scan too large: ${totalHosts} hosts. Maximum ${MAX_SCAN_SIZE} hosts per scan. Use a smaller CIDR range (e.g., /20 or higher).`);
    }

    const startIP = numberToIP(startIPNum);
    const endIP = numberToIP(endIPNum);

    console.log(`[API] Scanning CIDR ${subnet}`);
    console.log(`[API] Range: ${startIP} to ${endIP} (${totalHosts} hosts)`);

    const { scanIPRange } = await import("../networkScanner");
    const results = await scanIPRange(startIP, endIP);

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

// Network interfaces
router.get("/api/network/interfaces", requireAuth, async (req: any, res) => {
  try {
    const { getLocalSubnets } = await import("../networkScanner");
    const interfaces = getLocalSubnets();
    res.json({ interfaces });
  } catch (error: any) {
    console.error("Error getting network interfaces:", error);
    sendError(res, 500, error.message || "Failed to get network interfaces");
  }
});

// Unified camera discovery
router.post("/api/cameras/discover", requireAdmin, async (req: any, res) => {
  try {
    const discoverSchema = z.object({
      subnet: z.string().optional(),
      bonjour: z.boolean().optional().default(true),
      ssdp: z.boolean().optional().default(true),
      httpScan: z.boolean().optional().default(true),
    });

    const { subnet, bonjour, ssdp, httpScan } = discoverSchema.parse(req.body || {});

    if (subnet) {
      const [networkAddress, prefixLengthStr] = subnet.split('/');
      if (!networkAddress || !prefixLengthStr) return sendError(res, 400, "Invalid CIDR notation. Expected format: 192.168.1.0/24");
      const prefixLength = parseInt(prefixLengthStr);
      if (isNaN(prefixLength) || prefixLength < 8 || prefixLength > 30) return sendError(res, 400, "Prefix length must be between 8 and 30");
      const octets = networkAddress.split('.').map(Number);
      if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) return sendError(res, 400, "Invalid IP address format");
      const hostBits = 32 - prefixLength;
      const totalHosts = (1 << hostBits) - 2;
      if (totalHosts > 10000) return sendError(res, 400, `Scan too large: ${totalHosts} hosts. Use /20 or smaller.`);
    }

    console.log(`[API] Starting unified discovery${subnet ? ` on ${subnet}` : ' (multicast only)'}`);

    const { discoverCameras } = await import("../networkScanner");
    const results = await discoverCameras(subnet, { bonjour, ssdp, httpScan });

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

    res.json({ total: cameras.length, cameras });
  } catch (error: any) {
    console.error("Error discovering cameras:", error);
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    sendError(res, 500, error.message || "Failed to discover cameras");
  }
});

// Bulk add cameras
router.post("/api/cameras/bulk-add", requireAdmin, async (req: any, res) => {
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

    res.json({ added: added.length, skipped: skipped.length, addedIPs: added, skippedIPs: skipped });

    if (added.length > 0) setTimeout(() => checkAllCameras(), 2000);
  } catch (error: any) {
    console.error("Error bulk-adding cameras:", error);
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    sendError(res, 500, error.message || "Failed to add cameras");
  }
});

// Test connection
router.post("/api/cameras/:id/test-connection", requireAuth, async (req: any, res) => {
  try {
    const cameraId = validateId(req.params.id);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const userId = getUserId(req);
    const camera = await storage.getCameraById(cameraId);

    if (!camera) return res.status(404).json({ success: false, error: "Camera not found" });
    if (camera.userId !== userId) return res.status(403).json({ success: false, error: "Forbidden - you don't own this camera" });

    const { decryptPassword } = await import("../encryption");
    const decryptedPassword = await decryptPassword(camera.encryptedPassword);
    const conn = getConnectionInfo(camera);
    const dispatcher = getCameraDispatcher(conn);

    const pollCamera = async (ip: string, user: string, pass: string) => {
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

        return { responseTime, httpStatus: response.status, parsedData: data, rawText: rawText.substring(0, 200) };
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    const result = await pollCamera(camera.ipAddress, camera.username, decryptedPassword);

    res.json({
      success: true,
      cameraName: camera.name,
      ipAddress: camera.ipAddress,
      responseTime: result.responseTime,
      httpStatus: result.httpStatus,
      rawResponsePreview: result.rawText,
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
      return res.json({ success: false, error: "Timeout - camera did not respond within 10 seconds" });
    }
    res.json({ success: false, error: error.message || "Failed to connect to camera" });
  }
});

export default router;
