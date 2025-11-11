import { useState } from "react";
import { Camera, Wifi, TrendingUp, Plus, Upload, Search as SearchIcon, AlertTriangle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import MetricCard from "@/components/MetricCard";
import CameraTable, { Camera as CameraType } from "@/components/CameraTable";
import UptimeChart from "@/components/UptimeChart";
import AddCameraModal, { CameraFormData } from "@/components/AddCameraModal";
import NetworkScanModal from "@/components/NetworkScanModal";
import CSVImportModal from "@/components/CSVImportModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";

interface DashboardSummary {
  totalCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  unknownCameras: number;
  videoOk: number;
  videoFailed: number;
  videoUnknown: number;
  avgUptime: number;
}

interface ApiCamera {
  id: string;
  name: string;
  ipAddress: string;
  location: string | null;
  notes: string | null;
  currentStatus: string;
  videoStatus?: string;
  lastVideoCheck?: string | null;
  lastSeenAt: string | null;
  userId: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

interface CameraUptime {
  cameraId: string;
  uptime: number;
}

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "Never";
  
  const lastSeen = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function transformCamera(apiCamera: ApiCamera, uptimeMap: Map<string, number>): CameraType {
  const uptime = uptimeMap.get(apiCamera.id) ?? 0;
  return {
    id: apiCamera.id,
    name: apiCamera.name,
    ipAddress: apiCamera.ipAddress,
    location: apiCamera.location || "No location",
    status: apiCamera.currentStatus as CameraType["status"],
    videoStatus: apiCamera.videoStatus,
    uptime: `${uptime.toFixed(1)}%`,
    lastSeen: formatLastSeen(apiCamera.lastSeenAt)
  };
}

export default function Dashboard() {
  const [addCameraOpen, setAddCameraOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary"],
  });

  const { data: cameras, isLoading: camerasLoading, error: camerasError } = useQuery<ApiCamera[]>({
    queryKey: ["/api/cameras"],
  });

  const { data: cameraUptimes } = useQuery<CameraUptime[]>({
    queryKey: ["/api/cameras/uptime/batch"],
    enabled: !!cameras && cameras.length > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: async (cameraId: string) => {
      await apiRequest("DELETE", `/api/cameras/${cameraId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({
        title: "Success",
        description: "Camera deleted successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete camera",
        variant: "destructive",
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: CameraFormData) => {
      await apiRequest("POST", "/api/cameras", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({
        title: "Success",
        description: "Camera added successfully",
      });
      setAddCameraOpen(false);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add camera",
        variant: "destructive",
      });
    },
  });

  if (camerasError && isUnauthorizedError(camerasError as Error)) {
    toast({
      title: "Session Expired",
      description: "Please log in again",
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 500);
  }

  const uptimeMap = new Map<string, number>();
  cameraUptimes?.forEach((item) => {
    uptimeMap.set(item.cameraId, item.uptime);
  });

  const transformedCameras = cameras ? cameras.map(c => transformCamera(c, uptimeMap)) : [];
  const filteredCameras = transformedCameras.filter(camera =>
    camera.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    camera.ipAddress.includes(searchTerm) ||
    camera.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleViewDetails = (camera: CameraType) => {
    setLocation(`/cameras/${camera.id}`);
  };

  const handleDelete = (camera: CameraType) => {
    if (confirm(`Are you sure you want to delete ${camera.name}?`)) {
      deleteMutation.mutate(camera.id);
    }
  };

  const handleAddCamera = (data: CameraFormData) => {
    addMutation.mutate(data);
  };

  return (
    <div className="space-y-6" data-testid="page-dashboard">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Monitor your Axis camera network uptime and availability
        </p>
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Total Cameras"
            value={summary?.totalCameras ?? 0}
            subtitle="Across all locations"
            icon={Camera}
            accentColor="blue"
          />
          <MetricCard
            title="Online Cameras"
            value={summary?.onlineCameras ?? 0}
            subtitle={`${summary?.avgUptime.toFixed(1) ?? 0}% availability`}
            icon={Wifi}
            accentColor="green"
          />
          <MetricCard
            title="Video Issues"
            value={summary?.videoFailed ?? 0}
            subtitle={`${summary?.videoOk ?? 0} cameras streaming`}
            icon={AlertTriangle}
            accentColor={summary?.videoFailed && summary.videoFailed > 0 ? "amber" : "green"}
          />
          <MetricCard
            title="System Uptime"
            value={`${summary?.avgUptime.toFixed(1) ?? 0}%`}
            subtitle="Last 30 days"
            icon={TrendingUp}
            accentColor="green"
          />
        </div>
      )}

      <UptimeChart cameraId="all" days={30} />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-sm relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search cameras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setScanOpen(true)}
              data-testid="button-scan-network"
            >
              <Wifi className="mr-2 h-4 w-4" />
              Scan Network
            </Button>
            <Button
              variant="outline"
              onClick={() => setImportOpen(true)}
              data-testid="button-import-csv"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
            <Button
              onClick={() => setAddCameraOpen(true)}
              data-testid="button-add-camera"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Camera
            </Button>
          </div>
        </div>

        {camerasLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <CameraTable
            cameras={filteredCameras}
            onViewDetails={handleViewDetails}
            onDelete={handleDelete}
          />
        )}
      </div>

      <AddCameraModal
        open={addCameraOpen}
        onOpenChange={setAddCameraOpen}
        onSave={handleAddCamera}
      />

      <NetworkScanModal
        open={scanOpen}
        onOpenChange={setScanOpen}
        onAddCameras={(ips) => console.log("Adding cameras:", ips)}
      />

      <CSVImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(cameras) => console.log("Imported:", cameras)}
      />
    </div>
  );
}
