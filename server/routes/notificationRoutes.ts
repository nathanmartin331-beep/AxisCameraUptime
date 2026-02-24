import { Router } from "express";
import { requireAuth } from "../auth";
import { statusBroadcaster } from "../services/statusBroadcaster";

const router = Router();

// SSE endpoint for camera status change notifications
router.get("/api/notifications/stream", requireAuth, async (req: any, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const unsubscribe = statusBroadcaster.subscribe((payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });

  // Keepalive every 30s
  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 30_000);

  req.on("close", () => {
    unsubscribe();
    clearInterval(keepalive);
  });
});

export default router;
