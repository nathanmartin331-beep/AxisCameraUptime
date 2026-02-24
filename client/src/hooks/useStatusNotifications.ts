import { useState, useEffect, useCallback, useRef } from "react";

interface StatusNotification {
  cameraId: string;
  cameraName: string;
  oldStatus: string;
  newStatus: string;
  timestamp: string;
  message: string;
  read: boolean;
}

export function useStatusNotifications() {
  const [notifications, setNotifications] = useState<StatusNotification[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const notification: StatusNotification = { ...data, read: false };

        setNotifications((prev) => [notification, ...prev].slice(0, 50));

        // Browser notification for offline events
        if (data.newStatus === "offline" && Notification.permission === "granted") {
          new Notification(`Camera Offline: ${data.cameraName}`, {
            body: data.message,
            icon: "/favicon.ico",
          });
        }
      } catch { /* ignore malformed data */ }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    // Request notification permission on first use
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  return { notifications, unreadCount, markAllRead };
}
