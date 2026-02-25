import { useState, useEffect, useRef } from "react";

interface PerCameraData {
  cameraId: string;
  occupancy: number;
  in: number;
  out: number;
}

interface GroupStreamEvent {
  groupId: string;
  timestamp: string;
  occupancy: number;
  totalIn: number;
  totalOut: number;
  perCamera: PerCameraData[];
}

interface GroupAnalyticsStreamState {
  occupancy: number;
  totalIn: number;
  totalOut: number;
  perCamera: PerCameraData[];
  connected: boolean;
}

export function useGroupAnalyticsStream(groupId: string | undefined): GroupAnalyticsStreamState {
  const [occupancy, setOccupancy] = useState(0);
  const [totalIn, setTotalIn] = useState(0);
  const [totalOut, setTotalOut] = useState(0);
  const [perCamera, setPerCamera] = useState<PerCameraData[]>([]);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!groupId) {
      setConnected(false);
      return;
    }

    const es = new EventSource(`/api/groups/${groupId}/analytics/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data: GroupStreamEvent = JSON.parse(event.data);
        setOccupancy(data.occupancy);
        setTotalIn(data.totalIn);
        setTotalOut(data.totalOut);
        setPerCamera(data.perCamera ?? []);
      } catch {
        // ignore malformed data
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects; no action needed
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [groupId]);

  return { occupancy, totalIn, totalOut, perCamera, connected };
}
