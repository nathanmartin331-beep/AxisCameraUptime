import { useState, useMemo } from "react";
import { Camera, Wifi, TrendingUp, Plus, Upload, Search as SearchIcon, AlertTriangle, Download, Filter, Users, ArrowUpDown } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DashboardSummary {
  totalCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  unknownCameras: number;
  videoOk: number;
  videoFailed: number;
  videoUnknown: number;
  avgUptime: number;
  totalPeopleIn: number;
  totalPeopleOut: number;
  currentOccupancy: number;
  analyticsEnabled: number;
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
  model?: string | null;
  series?: string | null;
  fullName?: string | null;
  firmwareVersion?: string | null;
  hasPTZ?: boolean;
  hasAudio?: boolean;
  numberOfViews?: number;
  capabilities?: any;
  detectedAt?: string | null;
  detectionMethod?: string | null;
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
    lastSeen: formatLastSeen(apiCamera.lastSeenAt),
    model: apiCamera.model || undefined,
    series: apiCamera.series as CameraType["series"],
    fullName: apiCamera.fullName || undefined,
    firmwareVersion: apiCamera.firmwareVersion || undefined,
    hasPTZ: apiCamera.hasPTZ,
    hasAudio: apiCamera.hasAudio,
    numberOfViews: apiCamera.numberOfViews,
    capabilities: apiCamera.capabilities,
    detectedAt: apiCamera.detectedAt || undefined
  };
}

export default function Dashboard() {
  const [addCameraOpen, setAddCameraOpen] = useState(false);
  const [editCameraOpen, setEditCameraOpen] = useState(false);
  const [editCameraData, setEditCameraData] = useState<CameraFormData | undefined>(undefined);
  const [editCameraId, setEditCameraId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [videoFilter, setVideoFilter] = useState<string>("all");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary"],
    refetchInterval: 30000, // Refresh every 30s (camera polling is every 5 min)
  });

  const { data: cameras, isLoading: camerasLoading, error: camerasError } = useQuery<ApiCamera[]>({
    queryKey: ["/api/cameras"],
    refetchInterval: 30000,
  });

  const { data: cameraUptimes } = useQuery<CameraUptime[]>({
    queryKey: ["/api/cameras/uptime/batch"],
    enabled: !!cameras && cameras.length > 0,
    refetchInterval: 30000,
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
  
  // Get unique locations for filter
  const uniqueLocations = useMemo(() => {
    const locations = new Set<string>();
    transformedCameras.forEach(camera => {
      if (camera.location && camera.location !== "No location") {
        locations.add(camera.location);
      }
    });
    return Array.from(locations).sort();
  }, [transformedCameras]);

  // Apply all filters
  const filteredCameras = useMemo(() => {
    return transformedCameras.filter(camera => {
      // Search filter
      const matchesSearch = camera.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        camera.ipAddress.includes(searchTerm) ||
        camera.location.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Location filter
      const matchesLocation = locationFilter === "all" || camera.location === locationFilter;
      
      // Video health filter
      const matchesVideo = videoFilter === "all" ||
        (videoFilter === "issues" && camera.videoStatus === "video_failed") ||
        (videoFilter === "ok" && camera.videoStatus === "video_ok") ||
        (videoFilter === "unknown" && (!camera.videoStatus || camera.videoStatus === "unknown"));
      
      return matchesSearch && matchesLocation && matchesVideo;
    });
  }, [transformedCameras, searchTerm, locationFilter, videoFilter]);

  // Calculate filtered metrics
  const filteredMetrics = useMemo(() => {
    const total = filteredCameras.length;
    const online = filteredCameras.filter(c => c.status === "online").length;
    const videoOk = filteredCameras.filter(c => c.videoStatus === "video_ok").length;
    const videoFailed = filteredCameras.filter(c => c.videoStatus === "video_failed").length;
    
    // Calculate average uptime for filtered cameras
    const uptimeValues = filteredCameras.map(c => parseFloat(c.uptime) || 0);
    const avgUptime = total > 0 ? uptimeValues.reduce((a, b) => a + b, 0) / total : 0;
    
    return { total, online, videoOk, videoFailed, avgUptime };
  }, [filteredCameras]);

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

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CameraFormData }) => {
      // Build the update payload, omitting empty password (keep current)
      const payload: Record<string, string> = {
        name: data.name,
        ipAddress: data.ipAddress,
        username: data.username,
        location: data.location,
        notes: data.notes,
      };
      if (data.password) {
        payload.password = data.password;
      }
      await apiRequest("PATCH", `/api/cameras/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({
        title: "Success",
        description: "Camera updated successfully",
      });
      setEditCameraOpen(false);
      setEditCameraId(null);
      setEditCameraData(undefined);
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
        description: "Failed to update camera",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (camera: CameraType) => {
    // Find the original API camera to get username and notes
    const apiCamera = cameras?.find(c => c.id === camera.id);
    setEditCameraId(camera.id);
    setEditCameraData({
      name: camera.name,
      ipAddress: camera.ipAddress,
      username: apiCamera?.username || "",
      password: "", // Password is never sent back from the API; leave blank to keep current
      location: camera.location === "No location" ? "" : camera.location,
      notes: apiCamera?.notes || "",
      protocol: (apiCamera as any)?.protocol || "http",
      port: (apiCamera as any)?.port?.toString() || "",
      verifySslCert: (apiCamera as any)?.verifySslCert ?? false,
    });
    setEditCameraOpen(true);
  };

  const handleEditSave = (data: CameraFormData) => {
    if (editCameraId) {
      editMutation.mutate({ id: editCameraId, data });
    }
  };

  // Export camera data as CSV
  const handleExportCSV = () => {
    if (!filteredCameras.length) {
      toast({
        title: "No Data",
        description: "No cameras to export",
        variant: "destructive",
      });
      return;
    }

    // Properly escape CSV fields
    const escapeCSV = (value: string): string => {
      // Sanitize potential CSV injection (leading =, +, -, @)
      let sanitized = value.toString();
      if (/^[=+\-@]/.test(sanitized)) {
        sanitized = "'" + sanitized;
      }
      // Escape double quotes by doubling them
      sanitized = sanitized.replace(/"/g, '""');
      return `"${sanitized}"`;
    };

    const headers = ["Camera Name", "IP Address", "Location", "Status", "Video Status", "Uptime %", "Last Seen"];
    const rows = filteredCameras.map(cam => [
      escapeCSV(cam.name),
      escapeCSV(cam.ipAddress),
      escapeCSV(cam.location),
      escapeCSV(cam.status),
      escapeCSV(cam.videoStatus || "unknown"),
      escapeCSV(cam.uptime),
      escapeCSV(cam.lastSeen)
    ]);

    const csvContent = [
      headers.map(h => escapeCSV(h)).join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').substring(0, 19);
    link.setAttribute("href", url);
    link.setAttribute("download", `camera-report-${timestamp}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: `Exported ${filteredCameras.length} cameras to CSV`,
    });
  };

  // Export executive summary
  const handleExportSummary = () => {
    const timestamp = new Date().toISOString();
    const summaryText = `
CAMERA NETWORK STATUS REPORT
Generated: ${new Date(timestamp).toLocaleString()}
${locationFilter !== "all" ? `Location Filter: ${locationFilter}` : "All Locations"}
${videoFilter !== "all" ? `Video Health Filter: ${videoFilter}` : "All Video Statuses"}
${searchTerm ? `Search Filter: "${searchTerm}"` : ""}

SUMMARY METRICS:
- Total Cameras (Filtered): ${filteredMetrics.total}
- Online Cameras: ${filteredMetrics.online}
- Cameras with Video OK: ${filteredMetrics.videoOk}
- Video Issues Detected: ${filteredMetrics.videoFailed}
- Average Uptime: ${filteredMetrics.avgUptime.toFixed(1)}%

CAMERA DETAILS:
${filteredCameras.map(cam => `
  ${cam.name}
  - IP Address: ${cam.ipAddress}
  - Location: ${cam.location}
  - System Status: ${cam.status}
  - Video Health: ${cam.videoStatus || "unknown"}
  - Uptime Percentage: ${cam.uptime}
  - Last Contact: ${cam.lastSeen}
`).join("\n")}

---
Report generated for security review purposes
Total cameras in system: ${transformedCameras.length}
Cameras matching filters: ${filteredCameras.length}
    `.trim();

    const blob = new Blob([summaryText], { type: "text/plain;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const fileTimestamp = timestamp.replace(/[:.]/g, '-').split('T').join('_').substring(0, 19);
    link.setAttribute("href", url);
    link.setAttribute("download", `executive-summary-${fileTimestamp}.txt`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Summary Exported",
      description: `Executive summary with ${filteredCameras.length} cameras downloaded`,
    });
  };

  return (
    <div className="space-y-6" data-testid="page-dashboard">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Monitor your Axis camera network uptime and availability
        </p>
      </div>

      {summaryLoading || camerasLoading ? (
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
            value={filteredMetrics.total}
            subtitle={locationFilter !== "all" ? locationFilter : "Across all locations"}
            icon={Camera}
            accentColor="blue"
          />
          <MetricCard
            title="Online Cameras"
            value={filteredMetrics.online}
            subtitle={`${filteredMetrics.avgUptime.toFixed(1)}% avg uptime`}
            icon={Wifi}
            accentColor="green"
          />
          <MetricCard
            title="Video Issues"
            value={filteredMetrics.videoFailed}
            subtitle={`${filteredMetrics.videoOk} cameras streaming`}
            icon={AlertTriangle}
            accentColor={filteredMetrics.videoFailed > 0 ? "amber" : "green"}
          />
          <MetricCard
            title="System Uptime"
            value={`${filteredMetrics.avgUptime.toFixed(1)}%`}
            subtitle="Filtered cameras"
            icon={TrendingUp}
            accentColor="green"
          />
        </div>
      )}

      {/* Analytics metrics row - shown when any cameras have analytics enabled */}
      {summary && summary.analyticsEnabled > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title="Current Occupancy"
            value={summary.currentOccupancy}
            subtitle={`${summary.analyticsEnabled} cameras with analytics`}
            icon={Users}
            accentColor="blue"
          />
          <MetricCard
            title="People In Today"
            value={summary.totalPeopleIn}
            subtitle="Total entries across all cameras"
            icon={ArrowUpDown}
            accentColor="green"
          />
          <MetricCard
            title="People Out Today"
            value={summary.totalPeopleOut}
            subtitle="Total exits across all cameras"
            icon={ArrowUpDown}
            accentColor="amber"
          />
        </div>
      )}

      <UptimeChart cameraId="all" days={30} />

      <div className="space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <div className="relative w-64">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search cameras..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-48" data-testid="select-location">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {uniqueLocations.map((location) => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={videoFilter} onValueChange={setVideoFilter}>
                <SelectTrigger className="w-48" data-testid="select-video">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="All Cameras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cameras</SelectItem>
                  <SelectItem value="ok">Video OK</SelectItem>
                  <SelectItem value="issues">Video Issues</SelectItem>
                  <SelectItem value="unknown">Unknown Status</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={handleExportCSV}
                data-testid="button-export-csv"
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                onClick={handleExportSummary}
                data-testid="button-export-summary"
              >
                <Download className="mr-2 h-4 w-4" />
                Summary
              </Button>
              <Button
                variant="outline"
                onClick={() => setScanOpen(true)}
                data-testid="button-scan-network"
              >
                <Wifi className="mr-2 h-4 w-4" />
                Scan
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
                data-testid="button-import-csv"
              >
                <Upload className="mr-2 h-4 w-4" />
                Import
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

          {(locationFilter !== "all" || videoFilter !== "all" || searchTerm) && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredCameras.length} of {transformedCameras.length} cameras
              {locationFilter !== "all" && ` • Location: ${locationFilter}`}
              {videoFilter !== "all" && ` • Video: ${videoFilter}`}
              {searchTerm && ` • Search: "${searchTerm}"`}
            </div>
          )}
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
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </div>

      <AddCameraModal
        open={addCameraOpen}
        onOpenChange={setAddCameraOpen}
        onSave={handleAddCamera}
        mode="add"
      />

      <AddCameraModal
        open={editCameraOpen}
        onOpenChange={(open) => {
          setEditCameraOpen(open);
          if (!open) {
            setEditCameraId(null);
            setEditCameraData(undefined);
          }
        }}
        onSave={handleEditSave}
        initialData={editCameraData}
        mode="edit"
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
