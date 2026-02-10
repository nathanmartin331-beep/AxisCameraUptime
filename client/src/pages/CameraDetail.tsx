import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import CameraDetailView from "@/components/CameraDetailView";
import UptimeChart from "@/components/UptimeChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Users, ArrowDownToLine, ArrowUpFromLine, GitBranchPlus, Car, Bike, Bus, Truck, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Camera, UptimeEvent } from "@shared/schema";
import type { CameraStatus } from "@/components/StatusIndicator";
import { useState, useCallback } from "react";

interface UptimeResponse {
  percentage: number;
  days: number;
}

interface EventsResponse {
  events: UptimeEvent[];
  priorEvent: UptimeEvent | null;
}

interface AnalyticsEventWithMeta {
  eventType: string;
  value: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface AnalyticsResponse {
  latest: AnalyticsEventWithMeta | null;
  events: AnalyticsEventWithMeta[];
}

// Vehicle breakdown component for displaying category counts
function VehicleBreakdown({ metadata }: { metadata?: Record<string, any> }) {
  if (!metadata) return null;

  const categories = [
    { key: "human", label: "People", icon: Users, color: "text-blue-600" },
    { key: "car", label: "Cars", icon: Car, color: "text-slate-600" },
    { key: "truck", label: "Trucks", icon: Truck, color: "text-orange-600" },
    { key: "bus", label: "Buses", icon: Bus, color: "text-yellow-600" },
    { key: "bike", label: "Bikes", icon: Bike, color: "text-green-600" },
    { key: "otherVehicle", label: "Other", icon: Car, color: "text-gray-500" },
  ];

  const activeCategories = categories.filter(c => metadata[c.key] && metadata[c.key] > 0);
  if (activeCategories.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-dashed">
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {activeCategories.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="flex items-center gap-1 text-xs">
            <Icon className={`h-3 w-3 ${color}`} />
            <span className={`font-medium ${color}`}>{metadata[key].toLocaleString()}</span>
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ANALYTICS_VISIBILITY_KEY = "analytics-card-visibility";

type AnalyticsCardKey = "occupancy" | "entering" | "exiting" | "lineCrossing";

function getDefaultVisibility(): Record<AnalyticsCardKey, boolean> {
  return { occupancy: true, entering: true, exiting: true, lineCrossing: true };
}

function loadVisibility(): Record<AnalyticsCardKey, boolean> {
  try {
    const stored = localStorage.getItem(ANALYTICS_VISIBILITY_KEY);
    if (stored) {
      return { ...getDefaultVisibility(), ...JSON.parse(stored) };
    }
  } catch {}
  return getDefaultVisibility();
}

export default function CameraDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cameraId = params.id;
  const [detectingModel, setDetectingModel] = useState(false);
  const [probingAnalytics, setProbingAnalytics] = useState(false);

  const { data: camera, isLoading: cameraLoading, error: cameraError } = useQuery<Camera>({
    queryKey: ["/api/cameras", cameraId],
    enabled: !!cameraId,
    refetchInterval: 30000,
  });

  const { data: events, isLoading: eventsLoading } = useQuery<EventsResponse, Error, UptimeEvent[]>({
    queryKey: ["/api/cameras", cameraId, "events?limit=100"],
    enabled: !!cameraId,
    select: (data) => data.events ?? [],
    refetchInterval: 30000,
  });

  const { data: uptimeData, isLoading: uptimeLoading } = useQuery<UptimeResponse>({
    queryKey: ["/api/cameras", cameraId, "uptime?days=30"],
    enabled: !!cameraId,
    refetchInterval: 30000,
  });

  // Fetch analytics data if camera has any enabled analytics
  const caps = camera?.capabilities as any;
  const enabledAnalytics = caps?.enabledAnalytics;
  const analyticsInfo = caps?.analytics;
  const hasEnabledAnalytics = enabledAnalytics && Object.values(enabledAnalytics).some(Boolean);

  // Determine which specific analytics this camera supports
  const hasOccupancy = analyticsInfo?.occupancyEstimation && enabledAnalytics?.occupancyEstimation !== false;
  const hasCrossline = (analyticsInfo?.objectAnalytics && enabledAnalytics?.objectAnalytics !== false) ||
    (analyticsInfo?.peopleCount && enabledAnalytics?.peopleCount !== false) ||
    (analyticsInfo?.lineCrossing && enabledAnalytics?.lineCrossing !== false);

  // Analytics card visibility toggles
  const [cardVisibility, setCardVisibility] = useState<Record<AnalyticsCardKey, boolean>>(loadVisibility);

  const toggleCard = useCallback((key: AnalyticsCardKey) => {
    setCardVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(ANALYTICS_VISIBILITY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Only query occupancy if camera has occupancy capability
  const { data: analyticsData } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics"],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics?days=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: !!cameraId && !!hasOccupancy,
    refetchInterval: 15000,
  });

  // Only query crossline data if camera has counting capabilities
  const { data: peopleInData } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics-in"],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics?eventType=people_in&days=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!cameraId && !!hasCrossline,
    refetchInterval: 15000,
  });

  const { data: peopleOutData } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics-out"],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics?eventType=people_out&days=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!cameraId && !!hasCrossline,
    refetchInterval: 15000,
  });

  const { data: lineCrossingData } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics-lc"],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics?eventType=line_crossing&days=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!cameraId && !!hasCrossline,
    refetchInterval: 15000,
  });

  // Daily analytics trends (entering + exiting history)
  const [trendDays, setTrendDays] = useState(7);

  const { data: dailyEntering } = useQuery<{
    dailyTotals: Array<{ date: string; total: number; metadata?: Record<string, any> }>;
  }>({
    queryKey: ["/api/cameras", cameraId, "analytics/daily", "people_in", trendDays],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics/daily?eventType=people_in&days=${trendDays}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!cameraId && !!hasCrossline,
    refetchInterval: 60000,
  });

  const { data: dailyExiting } = useQuery<{
    dailyTotals: Array<{ date: string; total: number; metadata?: Record<string, any> }>;
  }>({
    queryKey: ["/api/cameras", cameraId, "analytics/daily", "people_out", trendDays],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics/daily?eventType=people_out&days=${trendDays}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!cameraId && !!hasCrossline,
    refetchInterval: 60000,
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

  const handleDetectModel = async () => {
    if (!cameraId) return;

    setDetectingModel(true);
    try {
      const response = await fetch(`/api/cameras/${cameraId}/detect-model`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to detect model');
      }

      // Refresh camera data
      await queryClient.invalidateQueries({ queryKey: ["/api/cameras", cameraId] });

      toast({
        title: "Model Detected",
        description: "Camera model information has been updated.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Detection Failed",
        description: "Could not detect camera model. Please try again.",
      });
    } finally {
      setDetectingModel(false);
    }
  };

  const handleProbeAnalytics = async () => {
    if (!cameraId) return;
    setProbingAnalytics(true);
    try {
      const response = await fetch(`/api/cameras/${cameraId}/probe-analytics`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to probe analytics");
      await queryClient.invalidateQueries({ queryKey: ["/api/cameras", cameraId] });
      toast({
        title: "Analytics Probed",
        description: "Analytics capabilities have been updated.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Probe Failed",
        description: "Could not probe analytics capabilities.",
      });
    } finally {
      setProbingAnalytics(false);
    }
  };

  const handleToggleAnalytic = async (key: string, enabled: boolean) => {
    if (!cameraId) return;
    try {
      const response = await fetch(`/api/cameras/${cameraId}/analytics-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [key]: enabled }),
      });
      if (!response.ok) throw new Error("Failed to update");
      await queryClient.invalidateQueries({ queryKey: ["/api/cameras", cameraId] });
    } catch {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update analytics configuration.",
      });
    }
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
    model: camera.model ?? undefined,
    series: (camera.series ?? undefined) as 'P' | 'Q' | 'M' | 'F' | undefined,
    fullName: camera.fullName ?? undefined,
    firmwareVersion: camera.firmwareVersion ?? undefined,
    hasPTZ: camera.hasPTZ ?? undefined,
    hasAudio: camera.hasAudio ?? undefined,
    resolution: camera.capabilities?.resolution,
    maxFramerate: camera.capabilities?.maxFramerate,
    numberOfViews: camera.numberOfViews ?? undefined,
    capabilities: camera.capabilities ?? undefined,
    detectedAt: camera.detectedAt ? new Date(camera.detectedAt).toISOString() : undefined,
    protocol: (camera as any).protocol ?? undefined,
    port: (camera as any).port ?? undefined,
    verifySslCert: (camera as any).verifySslCert ?? undefined,
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
        onDetectModel={handleDetectModel}
        detectingModel={detectingModel}
        onProbeAnalytics={handleProbeAnalytics}
        probingAnalytics={probingAnalytics}
        onToggleAnalytic={handleToggleAnalytic}
      />

      <UptimeChart
        cameraId={camera.id}
        days={30}
        title="30-Day Uptime History"
        description="Daily availability percentage for this camera"
      />

      {/* Analytics Data Section - only shown when analytics are enabled */}
      {hasEnabledAnalytics && (analyticsData?.latest || peopleInData?.latest || peopleOutData?.latest || lineCrossingData?.latest) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Live Analytics
                </CardTitle>
                <CardDescription>Real-time analytics data from this camera (last 24h)</CardDescription>
              </div>
              {/* Toggle switches for card visibility */}
              <div className="flex flex-wrap items-center gap-3">
                {analyticsData?.latest && (
                  <div className="flex items-center gap-1.5">
                    <Switch id="toggle-occupancy" checked={cardVisibility.occupancy} onCheckedChange={() => toggleCard("occupancy")} className="scale-75" />
                    <Label htmlFor="toggle-occupancy" className="text-xs text-muted-foreground cursor-pointer">Occupancy</Label>
                  </div>
                )}
                {peopleInData?.latest && (
                  <div className="flex items-center gap-1.5">
                    <Switch id="toggle-entering" checked={cardVisibility.entering} onCheckedChange={() => toggleCard("entering")} className="scale-75" />
                    <Label htmlFor="toggle-entering" className="text-xs text-muted-foreground cursor-pointer">Entering</Label>
                  </div>
                )}
                {peopleOutData?.latest && (
                  <div className="flex items-center gap-1.5">
                    <Switch id="toggle-exiting" checked={cardVisibility.exiting} onCheckedChange={() => toggleCard("exiting")} className="scale-75" />
                    <Label htmlFor="toggle-exiting" className="text-xs text-muted-foreground cursor-pointer">Exiting</Label>
                  </div>
                )}
                {lineCrossingData?.latest && (
                  <div className="flex items-center gap-1.5">
                    <Switch id="toggle-linecrossing" checked={cardVisibility.lineCrossing} onCheckedChange={() => toggleCard("lineCrossing")} className="scale-75" />
                    <Label htmlFor="toggle-linecrossing" className="text-xs text-muted-foreground cursor-pointer">Crossings</Label>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Occupancy */}
              {analyticsData?.latest && cardVisibility.occupancy && (
                <div className="rounded-lg border p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">Current Occupancy</span>
                  </div>
                  <div className="text-3xl font-bold">{analyticsData.latest.value.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(analyticsData.latest.timestamp).toLocaleTimeString()}
                  </div>
                  {analyticsData.latest.metadata?.scenario && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {analyticsData.latest.metadata.scenario}
                    </div>
                  )}
                </div>
              )}

              {/* Entering (People In + Vehicles) */}
              {peopleInData?.latest && cardVisibility.entering && (
                <div className="rounded-lg border p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <ArrowDownToLine className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-muted-foreground">Entering</span>
                  </div>
                  <div className="text-3xl font-bold text-green-600">{peopleInData.latest.value.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(peopleInData.latest.timestamp).toLocaleTimeString()}
                  </div>
                  {peopleInData.latest.metadata?.scenario && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {peopleInData.latest.metadata.scenario}
                    </div>
                  )}
                  <VehicleBreakdown metadata={peopleInData.latest.metadata} />
                </div>
              )}

              {/* Exiting (People Out + Vehicles) */}
              {peopleOutData?.latest && cardVisibility.exiting && (
                <div className="rounded-lg border p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <ArrowUpFromLine className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium text-muted-foreground">Exiting</span>
                  </div>
                  <div className="text-3xl font-bold text-red-600">{peopleOutData.latest.value.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(peopleOutData.latest.timestamp).toLocaleTimeString()}
                  </div>
                  {peopleOutData.latest.metadata?.scenario && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {peopleOutData.latest.metadata.scenario}
                    </div>
                  )}
                  <VehicleBreakdown metadata={peopleOutData.latest.metadata} />
                </div>
              )}

              {/* Line Crossing Total */}
              {lineCrossingData?.latest && cardVisibility.lineCrossing && (
                <div className="rounded-lg border p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <GitBranchPlus className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium text-muted-foreground">Line Crossings</span>
                  </div>
                  <div className="text-3xl font-bold text-purple-600">{lineCrossingData.latest.value.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(lineCrossingData.latest.timestamp).toLocaleTimeString()}
                  </div>
                  {lineCrossingData.latest.metadata?.scenario && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {lineCrossingData.latest.metadata.scenario}
                    </div>
                  )}
                  {/* Show in/out breakdown if available */}
                  {(lineCrossingData.latest.metadata?.in > 0 || lineCrossingData.latest.metadata?.out > 0) && (
                    <div className="mt-2 pt-2 border-t border-dashed flex justify-center gap-4 text-xs">
                      {lineCrossingData.latest.metadata?.in > 0 && (
                        <span className="text-green-600 font-medium">{Number(lineCrossingData.latest.metadata?.in).toLocaleString()} in</span>
                      )}
                      {lineCrossingData.latest.metadata?.out > 0 && (
                        <span className="text-red-600 font-medium">{Number(lineCrossingData.latest.metadata?.out).toLocaleString()} out</span>
                      )}
                    </div>
                  )}
                  <VehicleBreakdown metadata={lineCrossingData.latest.metadata} />
                </div>
              )}
            </div>

            {/* Recent events count */}
            {analyticsData?.events && analyticsData.events.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <Badge variant="secondary">
                  {analyticsData.events.length} data points collected in last 24h
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Daily Analytics Trends Chart */}
      {hasEnabledAnalytics && (dailyEntering?.dailyTotals?.length || dailyExiting?.dailyTotals?.length) && (() => {
        // Merge entering + exiting into chart data by date
        const dateMap = new Map<string, { date: string; entering: number; exiting: number; enterMeta?: Record<string, any>; exitMeta?: Record<string, any> }>();
        for (const d of dailyEntering?.dailyTotals || []) {
          const entry = dateMap.get(d.date) || { date: d.date, entering: 0, exiting: 0 };
          entry.entering = d.total;
          entry.enterMeta = d.metadata;
          dateMap.set(d.date, entry);
        }
        for (const d of dailyExiting?.dailyTotals || []) {
          const entry = dateMap.get(d.date) || { date: d.date, entering: 0, exiting: 0 };
          entry.exiting = d.total;
          entry.exitMeta = d.metadata;
          dateMap.set(d.date, entry);
        }
        const chartData = Array.from(dateMap.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(d => ({
            ...d,
            date: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          }));

        if (chartData.length === 0) return null;

        // Get resetTime from the latest day's metadata
        const latestDay = chartData[chartData.length - 1];
        const latestMeta = (latestDay as any).enterMeta || (latestDay as any).exitMeta;

        return (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Daily Trends
                  </CardTitle>
                  <CardDescription>
                    Daily entering/exiting totals (counters reset at midnight)
                    {latestMeta?.resetTime && (
                      <span className="ml-1 text-xs">
                        — reset: {new Date(latestMeta.resetTime).toLocaleString()}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Tabs value={String(trendDays)} onValueChange={(v) => setTrendDays(parseInt(v))}>
                  <TabsList className="h-8">
                    <TabsTrigger value="7" className="text-xs px-2 h-6">7d</TabsTrigger>
                    <TabsTrigger value="14" className="text-xs px-2 h-6">14d</TabsTrigger>
                    <TabsTrigger value="30" className="text-xs px-2 h-6">30d</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: number, name: string) => [
                      value.toLocaleString(),
                      name === "entering" ? "Entering" : "Exiting"
                    ]}
                  />
                  <Legend formatter={(value) => value === "entering" ? "Entering" : "Exiting"} />
                  <Bar dataKey="entering" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="exiting" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
