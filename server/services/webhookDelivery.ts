/**
 * Webhook Delivery Service
 *
 * Subscribes to analytics and status broadcasters, delivering events
 * to registered webhook endpoints with HMAC-SHA256 signatures.
 *
 * Features:
 * - Automatic retry with exponential backoff (3 attempts)
 * - 10-second request timeout
 * - Auto-deactivation after 10 consecutive failures
 * - HMAC-SHA256 signature in X-Webhook-Signature header
 */

import crypto from "crypto";
import { storage } from "../storage";
import { analyticsBroadcaster } from "./analyticsEventBroadcaster";
import { statusBroadcaster } from "./statusBroadcaster";
import type { Webhook } from "@shared/schema";

class WebhookDeliveryService {
  start() {
    // Subscribe to analytics broadcasts (seqId from T3.2 ring buffer — ignored here)
    analyticsBroadcaster.subscribeAll(async (payload, _seqId) => {
      const hooks = await storage.getActiveWebhooksByEvent("analytics.update");
      for (const hook of hooks) {
        this.deliver(hook, "analytics.update", payload).catch(() => {});
      }
    });

    // Subscribe to status change broadcasts
    statusBroadcaster.subscribe(async (payload) => {
      const eventTypes = ["status.change"];
      if (payload.newStatus === "offline") eventTypes.push("camera.offline");

      for (const eventType of eventTypes) {
        const hooks = await storage.getActiveWebhooksByEvent(eventType);
        for (const hook of hooks) {
          this.deliver(hook, eventType, payload).catch(() => {});
        }
      }
    });

    console.log("[Webhooks] Delivery service started");
  }

  private async deliver(
    webhook: Webhook,
    eventType: string,
    data: unknown,
    attempt = 1,
  ): Promise<void> {
    const body = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data,
    });
    const signature = crypto
      .createHmac("sha256", webhook.secret)
      .update(body)
      .digest("hex");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        await storage.updateWebhookAfterDelivery(webhook.id, true);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      if (attempt < 3) {
        const delays = [10_000, 60_000, 300_000];
        setTimeout(
          () => this.deliver(webhook, eventType, data, attempt + 1),
          delays[attempt - 1],
        );
      } else {
        await storage.updateWebhookAfterDelivery(webhook.id, false);
      }
    }
  }
}

export const webhookDeliveryService = new WebhookDeliveryService();
