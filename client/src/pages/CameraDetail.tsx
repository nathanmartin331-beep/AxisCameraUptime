import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import CameraDetailView from "@/components/CameraDetailView";
import UptimeChart from "@/components/UptimeChart";
import AddCameraModal, { CameraFormData } from "@/components/AddCameraModal";
import AnalyticsSection from "@/components/analytics/AnalyticsSection";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import type { Camera, UptimeEvent } from "@shared/schema";
import type { CameraStatus } from "@/components/StatusIndicator";
import { useState } from "react";

interface UptimeResponse {
  percentage: number;
  days: number;
}

interface EventsResponse {
  events: UptimeEvent[];
  priorEvent: UptimeEvent | null;
}

export default function CameraDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cameraId = params.id;
  const [detectingModel, setDetectingModel] = useState(false);
  const [probingAnalytics, setProbingAnalytics] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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

  // Determine which specific analytics this camera supports
  const caps = camera?.capabilities as any;
  const enabledAnalytics = caps?.enabledAnalytics;
  const analyticsInfo = caps?.analytics;
  const hasOccupancy = analyticsInfo?.occupancyEstimation && enabledAnalytics?.occupancyEstimation !== false;
  const hasCrossline = (analyticsInfo?.objectAnalytics && enabledAnalytics?.objectAnalytics !== false) ||
    (analyticsInfo?.peopleCount && enabledAnalytics?.peopleCount !== false) ||
    (analyticsInfo?.lineCrossing && enabledAnalytics?.lineCrossing !== false);

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
    series: (camera.series ?? undefined) as 'P' | 'Q' | 'M' | 'F' | 'A' | 'C' | 'D' | 'I' | 'T' | 'W' | undefined,
    fullName: camera.fullName ?? undefined,
    firmwareVersion: camera.firmwareVersion ?? undefined,
    hasPTZ: camera.hasPTZ ?? undefined,
    hasAudio: camera.hasAudio ?? undefined,
    resolution: camera.capabilities?.resolution,
    maxFramerate: camera.capabilities?.maxFramerate,
    numberOfViews: camera.numberOfViews ?? undefined,
    capabilities: camera.capabilities ?? undefined,
    lifecycle: (camera.capabilities as any)?.lifecycle ?? undefined,
    detectedAt: camera.detectedAt ? new Date(camera.detectedAt).toISOString() : undefined,
    protocol: (camera as any).protocol ?? undefined,
    port: (camera as any).port ?? undefined,
    verifySslCert: (camera as any).verifySslCert ?? undefined,
    sslFingerprint: (camera as any).sslFingerprint ?? undefined,
    sslFingerprintFirstSeen: (camera as any).sslFingerprintFirstSeen ?? undefined,
    sslFingerprintLastVerified: (camera as any).sslFingerprintLastVerified ?? undefined,
  };

  const handleBack = () => {
    setLocation("/");
  };

  const handleEdit = () => {
    setEditOpen(true);
  };

  const editMutation = useMutation({
    mutationFn: async (data: CameraFormData) => {
      const payload: Record<string, string> = {
        name: data.name,
        ipAddress: data.ipAddress,
        username: data.username,
        location: data.location,
        notes: data.notes,
      };
      if (data.password) payload.password = data.password;
      await apiRequest("PATCH", `/api/cameras/${cameraId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras", cameraId] });
      toast({ title: "Success", description: "Camera updated successfully" });
      setEditOpen(false);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session Expired", description: "Please log in again", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to update camera", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/cameras/${cameraId}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Camera deleted successfully" });
      setLocation("/");
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session Expired", description: "Please log in again", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to delete camera", variant: "destructive" });
    },
  });

  const handleDelete = () => {
    setDeleteConfirmOpen(true);
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

      {(hasOccupancy || hasCrossline) && (
        <AnalyticsSection
          cameraId={cameraId!}
          hasOccupancy={!!hasOccupancy}
          hasCrossline={!!hasCrossline}
        />
      )}

      <AddCameraModal
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={(data) => editMutation.mutate(data)}
        initialData={{
          name: camera.name,
          ipAddress: camera.ipAddress,
          username: camera.username,
          password: "",
          location: camera.location || "",
          notes: (camera as any).notes || "",
          protocol: (camera as any).protocol || "http",
          port: (camera as any).port?.toString() || "",
          verifySslCert: (camera as any).verifySslCert ?? false,
        }}
        mode="edit"
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Camera</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{camera.name}"? This action cannot be undone.
              All uptime history and analytics data for this camera will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
