import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import CameraDetailView from "@/components/CameraDetailView";
import UptimeChart from "@/components/UptimeChart";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Camera, UptimeEvent } from "@shared/schema";
import type { CameraStatus } from "@/components/StatusIndicator";

interface UptimeResponse {
  percentage: number;
  days: number;
}

export default function CameraDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const cameraId = params.id;

  const { data: camera, isLoading: cameraLoading, error: cameraError } = useQuery<Camera>({
    queryKey: ["/api/cameras", cameraId],
    enabled: !!cameraId,
  });

  const { data: events, isLoading: eventsLoading } = useQuery<UptimeEvent[]>({
    queryKey: ["/api/cameras", cameraId, "events?limit=100"],
    enabled: !!cameraId,
  });

  const { data: uptimeData, isLoading: uptimeLoading } = useQuery<UptimeResponse>({
    queryKey: ["/api/cameras", cameraId, "uptime?days=30"],
    enabled: !!cameraId,
  });

  if (cameraError) {
    if (isUnauthorizedError(cameraError as Error)) {
      toast({
        variant: "destructive",
        title: "Unauthorized",
        description: "Please log in to continue.",
      });
      window.location.href = "/api/login";
      return null;
    }
  }

  if (!cameraId || cameraError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Camera not found</p>
      </div>
    );
  }

  if (cameraLoading || eventsLoading || uptimeLoading) {
    return (
      <div className="space-y-6" data-testid="page-camera-detail">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!camera) {
    return null;
  }

  const mapStatus = (status: string | null): CameraStatus => {
    if (status === "online") return "online";
    if (status === "offline") return "offline";
    return "unknown";
  };

  const formatLastSeen = (lastSeenAt: Date | null): string => {
    if (!lastSeenAt) return "Never";
    try {
      return formatDistanceToNow(new Date(lastSeenAt), { addSuffix: true });
    } catch {
      return "Unknown";
    }
  };

  const formatAddedDate = (createdAt: Date | null): string => {
    if (!createdAt) return "Unknown";
    try {
      return new Date(createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return "Unknown";
    }
  };

  const calculateCurrentUptime = (): string => {
    if (!camera.lastSeenAt || camera.currentStatus !== "online") {
      return "N/A";
    }

    const relevantEvents = events?.filter(e => e.status === "online") || [];
    if (relevantEvents.length === 0) return "N/A";

    const latestEvent = relevantEvents[0];
    if (!latestEvent.uptimeSeconds) return "N/A";

    const seconds = latestEvent.uptimeSeconds;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const detectReboots = (): Array<{
    timestamp: string;
    duration: string;
    bootId: string;
  }> => {
    if (!events || events.length < 2) return [];

    const reboots: Array<{
      timestamp: string;
      duration: string;
      bootId: string;
    }> = [];

    for (let i = 1; i < events.length; i++) {
      const currentEvent = events[i - 1];
      const previousEvent = events[i];

      if (
        currentEvent.bootId &&
        previousEvent.bootId &&
        currentEvent.bootId !== previousEvent.bootId
      ) {
        const timestamp = new Date(currentEvent.timestamp).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const timeDiff = new Date(currentEvent.timestamp).getTime() - new Date(previousEvent.timestamp).getTime();
        const durationMinutes = Math.floor(timeDiff / 60000);
        
        let duration: string;
        if (durationMinutes < 1) {
          duration = "< 1 minute";
        } else if (durationMinutes < 60) {
          duration = `${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}`;
        } else {
          const hours = Math.floor(durationMinutes / 60);
          const mins = durationMinutes % 60;
          duration = `${hours}h ${mins}m`;
        }

        reboots.push({
          timestamp,
          duration,
          bootId: currentEvent.bootId,
        });
      }
    }

    return reboots;
  };

  const transformEventsToChartData = () => {
    if (!events || events.length === 0) {
      return [];
    }

    const dailyData = new Map<string, { online: number; total: number }>();

    events.forEach(event => {
      const date = new Date(event.timestamp).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      if (!dailyData.has(date)) {
        dailyData.set(date, { online: 0, total: 0 });
      }

      const data = dailyData.get(date)!;
      data.total++;
      if (event.status === "online") {
        data.online++;
      }
    });

    return Array.from(dailyData.entries())
      .map(([date, { online, total }]) => ({
        date,
        uptime: total > 0 ? (online / total) * 100 : 0,
      }))
      .reverse();
  };

  const cameraDetails = {
    id: camera.id,
    name: camera.name,
    ipAddress: camera.ipAddress,
    location: camera.location || "N/A",
    status: mapStatus(camera.currentStatus),
    currentUptime: calculateCurrentUptime(),
    totalUptime: uptimeData ? `${uptimeData.percentage.toFixed(1)}%` : "N/A",
    lastSeen: formatLastSeen(camera.lastSeenAt),
    addedDate: formatAddedDate(camera.createdAt),
    bootId: camera.currentBootId || "Unknown",
    reboots: detectReboots(),
  };

  const chartData = transformEventsToChartData();

  const handleBack = () => {
    setLocation("/");
  };

  const handleEdit = () => {
    console.log("Edit clicked");
  };

  const handleDelete = () => {
    console.log("Delete clicked");
  };

  return (
    <div className="space-y-6" data-testid="page-camera-detail">
      <CameraDetailView
        camera={cameraDetails}
        onBack={handleBack}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {chartData.length > 0 ? (
        <UptimeChart
          data={chartData}
          title="30-Day Uptime History"
          description="Daily availability percentage for this camera"
        />
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No uptime data available yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
