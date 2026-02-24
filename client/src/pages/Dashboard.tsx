import { useState, useMemo, useEffect } from "react";
import { Camera, Wifi, TrendingUp, Plus, Upload, Search as SearchIcon, AlertTriangle, Download, Filter, Users, ArrowUpDown, Volume2, Eye, EyeOff, Settings2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuthMutation } from "@/hooks/useAuthMutation";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
  speakerTotal: number;
  speakerOnline: number;
  speakerOffline: number;
  speakerAvgUptime: number;
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
  monitoredDays: number;
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

function transformCamera(apiCamera: ApiCamera, uptimeMap: Map<string, { uptime: number; monitoredDays: number }>): CameraType {
  const data = uptimeMap.get(apiCamera.id);
  const uptime = data?.uptime ?? 0;
  const monitoredDays = data?.monitoredDays ?? 0;
  const daysLabel = monitoredDays < 30 ? ` (${monitoredDays}d)` : "";
  return {
    id: apiCamera.id,
    name: apiCamera.name,
    ipAddress: apiCamera.ipAddress,
    location: apiCamera.location || "No location",
    status: apiCamera.currentStatus as CameraType["status"],
    videoStatus: apiCamera.videoStatus,
    uptime: `${uptime.toFixed(1)}%${daysLabel}`,
    lastSeen: formatLastSeen(apiCamera.lastSeenAt),
    model: apiCamera.model || undefined,
    series: apiCamera.series as CameraType["series"],
    fullName: apiCamera.fullName || undefined,
    firmwareVersion: apiCamera.firmwareVersion || undefined,
    hasPTZ: apiCamera.hasPTZ,
    hasAudio: apiCamera.hasAudio,
    numberOfViews: apiCamera.numberOfViews,
    capabilities: apiCamera.capabilities,
    detectedAt: apiCamera.detectedAt || undefined,
    protocol: (apiCamera as any).protocol || "http",
  };
}

interface DashboardSections {
  overview: boolean;
  speakers: boolean;
  analytics: boolean;
  uptimeChart: boolean;
  cameraTable: boolean;
}

const SECTIONS_STORAGE_KEY = "dashboard-visible-sections";

function loadSectionVisibility(): DashboardSections {
  try {
    const stored = localStorage.getItem(SECTIONS_STORAGE_KEY);
    if (stored) return { overview: true, speakers: true, analytics: true, uptimeChart: true, cameraTable: true, ...JSON.parse(stored) };
  } catch {}
  return { overview: true, speakers: true, analytics: true, uptimeChart: true, cameraTable: true };
}

export default function Dashboard() {
  const [addCameraOpen, setAddCameraOpen] = useState(false);
  const [editCameraOpen, setEditCameraOpen] = useState(false);
  const [editCameraData, setEditCameraData] = useState<CameraFormData | undefined>(undefined);
  const [editCameraId, setEditCameraId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [visibleSections, setVisibleSections] = useState<DashboardSections>(loadSectionVisibility);

  const toggleSection = (key: keyof DashboardSections) => {
    setVisibleSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };
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

  const [deleteConfirmCamera, setDeleteConfirmCamera] = useState<CameraType | null>(null);

  const deleteMutation = useAuthMutation({
    mutationFn: async (cameraId: string) => {
      await apiRequest("DELETE", `/api/cameras/${cameraId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "Success", description: "Camera deleted successfully" });
      setDeleteConfirmCamera(null);
    },
    errorMessage: "Failed to delete camera",
  });

  const addMutation = useAuthMutation({
    mutationFn: async (data: CameraFormData) => {
      await apiRequest("POST", "/api/cameras", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "Success", description: "Camera added successfully" });
      setAddCameraOpen(false);
    },
    errorMessage: "Failed to add camera",
  });

  const bulkAddMutation = useAuthMutation({
    mutationFn: async (ips: string[]) => {
      const res = await apiRequest("POST", "/api/cameras/bulk-add", {
        cameras: ips.map((ip) => ({
          ipAddress: ip,
          name: `Camera ${ip}`,
          username: "root",
          password: "pass",
        })),
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({
        title: "Cameras Added",
        description: `Added ${result.added} camera${result.added !== 1 ? "s" : ""}${result.skipped > 0 ? `, ${result.skipped} skipped (duplicates)` : ""}`,
      });
    },
    errorMessage: "Failed to add cameras from scan",
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

  // Tick counter forces formatLastSeen to recompute relative times every 60s
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const transformedCameras = useMemo(() => {
    const map = new Map<string, { uptime: number; monitoredDays: number }>();
    cameraUptimes?.forEach((item) => {
      map.set(item.cameraId, { uptime: item.uptime, monitoredDays: item.monitoredDays });
    });
    return cameras ? cameras.map(c => transformCamera(c, map)) : [];
  }, [cameras, cameraUptimes, tick]);
  
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
        (videoFilter === "speakers" && camera.videoStatus === "not_applicable") ||
        (videoFilter === "unknown" && (!camera.videoStatus || camera.videoStatus === "unknown"));
      
      return matchesSearch && matchesLocation && matchesVideo;
    });
  }, [transformedCameras, searchTerm, locationFilter, videoFilter]);

  // Calculate filtered metrics (speakers separated from video cameras)
  const filteredMetrics = useMemo(() => {
    const total = filteredCameras.length;
    const videoCams = filteredCameras.filter(c => c.videoStatus !== "not_applicable");
    const online = videoCams.filter(c => c.status === "online").length;
    const videoOk = videoCams.filter(c => c.videoStatus === "video_ok").length;
    const videoFailed = videoCams.filter(c => c.videoStatus === "video_failed").length;
    const speakerCount = filteredCameras.filter(c => c.videoStatus === "not_applicable").length;

    // Average uptime for video cameras only (speakers have their own section)
    const videoUptimeValues = videoCams.map(c => parseFloat(c.uptime) || 0);
    const avgUptime = videoCams.length > 0 ? videoUptimeValues.reduce((a, b) => a + b, 0) / videoCams.length : 0;

    return { total, online, videoOk, videoFailed, speakerCount, avgUptime };
  }, [filteredCameras]);

  const handleViewDetails = (camera: CameraType) => {
    setLocation(`/cameras/${camera.id}`);
  };

  const handleDelete = (camera: CameraType) => {
    setDeleteConfirmCamera(camera);
  };

  const handleAddCamera = (data: CameraFormData) => {
    addMutation.mutate(data);
  };

  const editMutation = useAuthMutation({
    mutationFn: async ({ id, data }: { id: string; data: CameraFormData }) => {
      const payload: Record<string, string> = {
        name: data.name,
        ipAddress: data.ipAddress,
        username: data.username,
        location: data.location,
        notes: data.notes,
      };
      if (data.password) payload.password = data.password;
      await apiRequest("PATCH", `/api/cameras/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "Success", description: "Camera updated successfully" });
      setEditCameraOpen(false);
      setEditCameraId(null);
      setEditCameraData(undefined);
    },
    errorMessage: "Failed to update camera",
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor your Axis camera network uptime and availability
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Sections
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <div className="space-y-1 mb-3">
              <p className="font-medium text-sm">Visible Sections</p>
              <p className="text-xs text-muted-foreground">Toggle dashboard cards on or off</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="toggle-overview" className="text-sm">Overview Cards</Label>
                <Switch id="toggle-overview" checked={visibleSections.overview} onCheckedChange={() => toggleSection("overview")} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="toggle-speakers" className="text-sm">Speaker Uptime</Label>
                <Switch id="toggle-speakers" checked={visibleSections.speakers} onCheckedChange={() => toggleSection("speakers")} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="toggle-analytics" className="text-sm">Analytics</Label>
                <Switch id="toggle-analytics" checked={visibleSections.analytics} onCheckedChange={() => toggleSection("analytics")} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="toggle-chart" className="text-sm">Uptime Chart</Label>
                <Switch id="toggle-chart" checked={visibleSections.uptimeChart} onCheckedChange={() => toggleSection("uptimeChart")} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="toggle-table" className="text-sm">Camera Table</Label>
                <Switch id="toggle-table" checked={visibleSections.cameraTable} onCheckedChange={() => toggleSection("cameraTable")} />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {visibleSections.overview && (
        summaryLoading || camerasLoading ? (
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
              subtitle={`${filteredMetrics.videoOk} streaming${filteredMetrics.speakerCount > 0 ? `, ${filteredMetrics.speakerCount} speaker${filteredMetrics.speakerCount !== 1 ? 's' : ''}` : ''}`}
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
        )
      )}

      {/* Speaker uptime row - shown when speakers are detected and section is visible */}
      {visibleSections.speakers && summary && summary.speakerTotal > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title="Network Speakers"
            value={summary.speakerTotal}
            subtitle={`${summary.speakerOnline} online, ${summary.speakerOffline} offline`}
            icon={Volume2}
            accentColor="blue"
          />
          <MetricCard
            title="Speaker Uptime"
            value={`${summary.speakerAvgUptime.toFixed(1)}%`}
            subtitle="30-day average"
            icon={TrendingUp}
            accentColor={summary.speakerAvgUptime >= 99 ? "green" : summary.speakerAvgUptime >= 95 ? "amber" : "red"}
          />
          <MetricCard
            title="Speakers Online"
            value={summary.speakerOnline}
            subtitle={summary.speakerTotal > 0 ? `${((summary.speakerOnline / summary.speakerTotal) * 100).toFixed(0)}% available now` : "No speakers"}
            icon={Wifi}
            accentColor={summary.speakerOnline === summary.speakerTotal ? "green" : "amber"}
          />
        </div>
      )}

      {/* Analytics metrics row - shown when any cameras have analytics enabled and section is visible */}
      {visibleSections.analytics && summary && summary.analyticsEnabled > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title="Current Occupancy"
            value={summary.currentOccupancy}
            subtitle={`${summary.analyticsEnabled} cameras with analytics`}
            icon={Users}
            accentColor="blue"
          />
          <MetricCard
            title="Total Entering"
            value={summary.totalPeopleIn}
            subtitle="Cumulative entries (people + vehicles)"
            icon={ArrowUpDown}
            accentColor="green"
          />
          <MetricCard
            title="Total Exiting"
            value={summary.totalPeopleOut}
            subtitle="Cumulative exits (people + vehicles)"
            icon={ArrowUpDown}
            accentColor="amber"
          />
        </div>
      )}

      {visibleSections.uptimeChart && <UptimeChart cameraId="all" days={30} />}

      {/* Empty state when no cameras exist */}
      {!camerasLoading && (!cameras || cameras.length === 0) && (
        <div className="border rounded-lg p-12 text-center space-y-4">
          <Camera className="h-16 w-16 mx-auto text-muted-foreground/50" />
          <div>
            <h2 className="text-xl font-semibold">No Cameras Yet</h2>
            <p className="text-muted-foreground mt-1">Get started by adding your first Axis camera</p>
          </div>
          <div className="flex justify-center gap-3">
            <Button onClick={() => setAddCameraOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Camera
            </Button>
            <Button variant="outline" onClick={() => setScanOpen(true)}>
              <Wifi className="mr-2 h-4 w-4" />
              Scan Network
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </div>
        </div>
      )}

      {visibleSections.cameraTable && <div className="space-y-4">
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
                  <SelectItem value="speakers">Speakers Only</SelectItem>
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
      </div>}

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
        onAddCameras={(ips) => bulkAddMutation.mutate(ips)}
      />

      <CSVImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={async (cameras) => {
          try {
            const csvHeader = "name,ipAddress,location,username,password";
            const csvRows = cameras.map((c: any) =>
              `${c.name},${c.ipAddress},${c.location || ""},${c.username},${c.password}`
            );
            const csvContent = [csvHeader, ...csvRows].join("\n");
            const res = await apiRequest("POST", "/api/cameras/import", { csvContent });
            const result = await res.json();
            queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
            queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
            toast({
              title: "Import Complete",
              description: result.message,
            });
          } catch (error: any) {
            if (isUnauthorizedError(error)) {
              toast({ title: "Session Expired", description: "Please log in again", variant: "destructive" });
              setTimeout(() => { window.location.href = "/api/login"; }, 500);
              return;
            }
            toast({ title: "Error", description: "Failed to import cameras", variant: "destructive" });
          }
        }}
      />

      <AlertDialog open={!!deleteConfirmCamera} onOpenChange={(open) => { if (!open) setDeleteConfirmCamera(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Camera</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmCamera?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmCamera && deleteMutation.mutate(deleteConfirmCamera.id)}
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
