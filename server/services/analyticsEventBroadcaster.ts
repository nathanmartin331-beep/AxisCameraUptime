/**
 * Analytics Event Broadcaster
 *
 * Pub/sub broadcaster with sequence-numbered ring buffer so SSE routes
 * receive analytics events instantly and can replay missed events on
 * reconnect via Last-Event-ID.
 *
 * Singleton — imported by both analyticsPoller.ts and routes.ts.
 */

type AnalyticsPayload = {
  cameraId: string;
  timestamp: string;
  events: Array<{ eventType: string; value: number; metadata?: Record<string, any> | null }>;
};

export type HourlyRollupPayload = {
  type: "hourly_rollup";
  hourStart: string;
  cameras: Array<{ cameraId: string; byEvent: Record<string, number> }>;
};

type Callback = (payload: AnalyticsPayload, seqId: number) => void;
type RollupCallback = (payload: HourlyRollupPayload, seqId: number) => void;

class AnalyticsEventBroadcaster {
  private cameraListeners = new Map<string, Set<Callback>>();
  private allListeners = new Set<Callback>();

  private nextSeqId = 1;
  private ringBuffer: Array<{ id: number; payload: AnalyticsPayload }> = [];
  private static MAX_BUFFER = 1000;

  // Hourly rollup channel — separate seqId space, separate ring buffer.
  // SSE handlers subscribe alongside live events and emit with SSE event:hourly_rollup.
  private rollupListeners = new Set<RollupCallback>();
  private nextRollupSeqId = 1;
  private rollupBuffer: Array<{ id: number; payload: HourlyRollupPayload }> = [];

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

    const seqId = this.nextSeqId++;

    // Store in ring buffer
    this.ringBuffer.push({ id: seqId, payload });
    if (this.ringBuffer.length > AnalyticsEventBroadcaster.MAX_BUFFER) {
      this.ringBuffer.shift();
    }

    // Camera-specific listeners
    const cameraSet = this.cameraListeners.get(cameraId);
    if (cameraSet) {
      for (const cb of cameraSet) {
        try { cb(payload, seqId); } catch { /* subscriber error — don't break others */ }
      }
    }

    // Global listeners
    for (const cb of this.allListeners) {
      try { cb(payload, seqId); } catch { /* subscriber error — don't break others */ }
    }
  }

  /**
   * Return all buffered events with id > lastId, or null if the gap is
   * too large (oldest buffered event is newer than lastId + 1).
   */
  getEventsSince(lastId: number): Array<{ id: number; payload: AnalyticsPayload }> | null {
    if (this.ringBuffer.length === 0) return null;
    const oldest = this.ringBuffer[0].id;
    if (lastId < oldest - 1) return null; // gap too large
    return this.ringBuffer.filter(e => e.id > lastId);
  }

  /** Subscribe to hourly rollup events (fleet-wide). Returns an unsubscribe function. */
  subscribeAllRollups(cb: RollupCallback): () => void {
    this.rollupListeners.add(cb);
    return () => { this.rollupListeners.delete(cb); };
  }

  /** Broadcast a closed-hour rollup to all rollup subscribers. */
  broadcastHourlyRollup(payload: HourlyRollupPayload): void {
    const seqId = this.nextRollupSeqId++;

    this.rollupBuffer.push({ id: seqId, payload });
    if (this.rollupBuffer.length > AnalyticsEventBroadcaster.MAX_BUFFER) {
      this.rollupBuffer.shift();
    }

    for (const cb of this.rollupListeners) {
      try { cb(payload, seqId); } catch { /* subscriber error — don't break others */ }
    }
  }

  getRollupsSince(lastId: number): Array<{ id: number; payload: HourlyRollupPayload }> | null {
    if (this.rollupBuffer.length === 0) return null;
    const oldest = this.rollupBuffer[0].id;
    if (lastId < oldest - 1) return null;
    return this.rollupBuffer.filter(e => e.id > lastId);
  }
}

export const analyticsBroadcaster = new AnalyticsEventBroadcaster();
