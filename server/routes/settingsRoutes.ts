import { Router } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { z } from "zod";
import { sendError, getUserId } from "./shared";
import { clearAgentCache } from "../services/cameraUrl";

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
      defaultCertValidationMode: z.enum(["none", "tofu", "ca"]).optional(),
      globalCaCert: z.string().max(65536).nullable().optional(),
    });

    const validatedSettings = settingsSchema.parse(req.body);
    if (Object.keys(validatedSettings).length === 0) {
      return sendError(res, 400, "No valid settings to update");
    }

    // Check if globalCaCert is changing so we can clear cached HTTPS agents
    const caCertChanging = validatedSettings.globalCaCert !== undefined;

    const settings = await storage.updateUserSettings(userId, validatedSettings);

    if (caCertChanging) {
      clearAgentCache();
    }

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

// === API Key Management ===

// POST /api/settings/api-keys — create a new API key
router.post("/api/settings/api-keys", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const bodySchema = z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(z.string()).optional(),
      expiresAt: z.string().datetime().optional(),
    });

    const { name, scopes, expiresAt } = bodySchema.parse(req.body);

    // Generate a random 32-byte key
    const rawKey = crypto.randomBytes(32).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 8);

    const record = await storage.createApiKey({
      userId,
      name,
      keyHash,
      keyPrefix,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    // Return the raw key exactly once — it cannot be retrieved again
    res.status(201).json({
      id: record.id,
      name: record.name,
      key: rawKey,
      prefix: keyPrefix,
      scopes: record.scopes,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    console.error("Error creating API key:", error);
    sendError(res, 500, "Failed to create API key");
  }
});

// GET /api/settings/api-keys — list API keys for user (no hash in response)
router.get("/api/settings/api-keys", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const keys = await storage.listApiKeysByUserId(userId);
    res.json(keys);
  } catch (error) {
    console.error("Error listing API keys:", error);
    sendError(res, 500, "Failed to list API keys");
  }
});

// DELETE /api/settings/api-keys/:id — revoke an API key
router.delete("/api/settings/api-keys/:id", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const keyId = req.params.id;
    if (!keyId || typeof keyId !== "string") {
      return sendError(res, 400, "Invalid key ID");
    }
    await storage.deleteApiKey(keyId, userId);
    res.json({ message: "API key revoked" });
  } catch (error) {
    console.error("Error deleting API key:", error);
    sendError(res, 500, "Failed to revoke API key");
  }
});

// === Webhook Management ===

// POST /api/settings/webhooks — create a new webhook subscription
router.post("/api/settings/webhooks", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const bodySchema = z.object({
      url: z.string().url("Invalid URL"),
      events: z.array(z.string().min(1)).min(1, "At least one event type is required"),
    });

    const { url, events } = bodySchema.parse(req.body);

    // Generate a random secret for HMAC signing
    const secret = crypto.randomBytes(32).toString("hex");

    const record = await storage.createWebhook({ userId, url, secret, events });

    // Return the full secret exactly once (subsequent list calls mask it)
    res.status(201).json({
      id: record.id,
      url: record.url,
      secret,
      events: record.events,
      active: record.active,
      createdAt: record.createdAt,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    console.error("Error creating webhook:", error);
    sendError(res, 500, "Failed to create webhook");
  }
});

// GET /api/settings/webhooks — list webhooks (secrets masked)
router.get("/api/settings/webhooks", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const hooks = await storage.listWebhooksByUserId(userId);
    res.json(hooks);
  } catch (error) {
    console.error("Error listing webhooks:", error);
    sendError(res, 500, "Failed to list webhooks");
  }
});

// DELETE /api/settings/webhooks/:id — delete a webhook
router.delete("/api/settings/webhooks/:id", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const hookId = req.params.id;
    if (!hookId || typeof hookId !== "string") {
      return sendError(res, 400, "Invalid webhook ID");
    }
    await storage.deleteWebhook(hookId, userId);
    res.json({ message: "Webhook deleted" });
  } catch (error) {
    console.error("Error deleting webhook:", error);
    sendError(res, 500, "Failed to delete webhook");
  }
});

// POST /api/settings/webhooks/:id/test — send a test event
router.post("/api/settings/webhooks/:id/test", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const hookId = req.params.id;
    if (!hookId || typeof hookId !== "string") {
      return sendError(res, 400, "Invalid webhook ID");
    }

    // Look up the webhook (unmasked) — use raw SQL since listWebhooksByUserId masks secrets
    const { db } = await import("../db");
    const { webhooks } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");

    const [hook] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, hookId), eq(webhooks.userId, userId)));

    if (!hook) {
      return sendError(res, 404, "Webhook not found");
    }

    // Deliver test payload synchronously
    const body = JSON.stringify({
      event: "test",
      timestamp: new Date().toISOString(),
      data: { message: "Webhook test" },
    });
    const signature = crypto
      .createHmac("sha256", hook.secret)
      .update(body)
      .digest("hex");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      res.json({ message: "Test event delivered", status: response.status });
    } else {
      res.json({ message: "Test event failed", status: response.status });
    }
  } catch (error: any) {
    console.error("Error testing webhook:", error);
    sendError(res, 500, `Webhook test failed: ${error.message || "Unknown error"}`);
  }
});

export default router;
