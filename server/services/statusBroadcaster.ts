/**
 * Status Change Broadcaster
 *
 * Pub/sub broadcaster for camera status transitions (online/offline).
 * Subscribers (SSE routes, future webhook/email handlers) receive events
 * the instant the camera monitor detects a status change.
 */

export interface StatusChangePayload {
  cameraId: string;
  cameraName: string;
  oldStatus: string;
  newStatus: string;
  timestamp: string;
  message: string;
}

type Callback = (payload: StatusChangePayload) => void;

class StatusBroadcaster {
  private listeners = new Set<Callback>();

  subscribe(cb: Callback): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  broadcast(payload: StatusChangePayload): void {
    for (const cb of this.listeners) {
      try { cb(payload); } catch { /* subscriber error — don't break others */ }
    }
  }
}

export const statusBroadcaster = new StatusBroadcaster();
