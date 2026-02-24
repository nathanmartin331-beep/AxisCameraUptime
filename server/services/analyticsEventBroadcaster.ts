/**
 * Analytics Event Broadcaster
 *
 * Simple pub/sub broadcaster so SSE routes receive analytics events
 * the instant the poller stores them, without re-querying the database.
 *
 * Singleton — imported by both analyticsPoller.ts and routes.ts.
 */

type AnalyticsPayload = {
  cameraId: string;
  timestamp: string;
  events: Array<{ eventType: string; value: number; metadata?: Record<string, any> | null }>;
};

type Callback = (payload: AnalyticsPayload) => void;

class AnalyticsEventBroadcaster {
  private cameraListeners = new Map<string, Set<Callback>>();
  private allListeners = new Set<Callback>();

  /** Subscribe to events for a specific camera. Returns an unsubscribe function. */
  subscribe(cameraId: string, cb: Callback): () => void {
    let set = this.cameraListeners.get(cameraId);
    if (!set) {
      set = new Set();
      this.cameraListeners.set(cameraId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.cameraListeners.delete(cameraId);
    };
  }

  /** Subscribe to events from all cameras. Returns an unsubscribe function. */
  subscribeAll(cb: Callback): () => void {
    this.allListeners.add(cb);
    return () => { this.allListeners.delete(cb); };
  }

  /** Broadcast new analytics events to matching subscribers. */
  broadcast(
    cameraId: string,
    events: Array<{ eventType: string; value: number; metadata?: Record<string, any> | null }>,
  ): void {
    const payload: AnalyticsPayload = {
      cameraId,
      timestamp: new Date().toISOString(),
      events,
    };

    // Camera-specific listeners
    const cameraSet = this.cameraListeners.get(cameraId);
    if (cameraSet) {
      for (const cb of cameraSet) {
        try { cb(payload); } catch { /* subscriber error — don't break others */ }
      }
    }

    // Global listeners
    for (const cb of this.allListeners) {
      try { cb(payload); } catch { /* subscriber error — don't break others */ }
    }
  }
}

export const analyticsBroadcaster = new AnalyticsEventBroadcaster();
