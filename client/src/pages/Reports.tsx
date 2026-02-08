import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, TrendingUp, TrendingDown, MapPin } from "lucide-react";
import { format } from "date-fns";
import UptimeChart from "@/components/UptimeChart";

interface Camera {
  id: number;
  name: string;
  ipAddress: string;
  status: string;
  location?: string;
}

export default function Reports() {
  const [timeRange, setTimeRange] = useState("30");
  const [selectedCamera, setSelectedCamera] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const { data: cameras = [] } = useQuery<Camera[]>({
    queryKey: ["/api/cameras"],
  });

  // Get unique locations for filter dropdown
  const uniqueLocations = useMemo(() => {
    const locations = cameras
      .map(camera => camera.location)
      .filter((loc): loc is string => !!loc && loc.trim() !== "");
    return Array.from(new Set(locations)).sort();
  }, [cameras]);

  // Filter cameras by location
  const filteredCameras = useMemo(() => {
    if (locationFilter === "all") return cameras;
    if (locationFilter === "none") {
      return cameras.filter(camera => !camera.location || camera.location.trim() === "");
    }
    return cameras.filter(camera => camera.location === locationFilter);
  }, [cameras, locationFilter]);

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/dashboard/summary", timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/summary?days=${timeRange}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch summary");
      return response.json();
    },
  });

  // Fetch batch uptime data for CSV export
  const { data: uptimeData } = useQuery<Array<{ cameraId: string; uptime: number; monitoredSince: string }>>({
    queryKey: ["/api/cameras/uptime/batch", timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/cameras/uptime/batch?days=${timeRange}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch uptime data");
      return response.json();
    },
    enabled: cameras.length > 0,
  });

  // Build a lookup map from cameraId to uptime info
  const uptimeLookup = useMemo(() => {
    const map = new Map<string, { uptime: number; monitoredSince: string }>();
    if (uptimeData) {
      for (const entry of uptimeData) {
        map.set(entry.cameraId, { uptime: entry.uptime, monitoredSince: entry.monitoredSince });
      }
    }
    return map;
  }, [uptimeData]);

  const handleExportCSV = () => {
    // Export only filtered cameras
    const camerasToExport = filteredCameras;

    // Helper to escape CSV fields that may contain commas or quotes
    const escapeCSV = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csvContent = [
      ["Camera Name", "IP Address", "Location", "Status", "Uptime %", "Monitored Since"].join(","),
      ...camerasToExport.map((camera) => {
        const info = uptimeLookup.get(String(camera.id));
        const uptimePct = info ? `${info.uptime.toFixed(1)}%` : "N/A";
        const monitoredSince = info?.monitoredSince
          ? format(new Date(info.monitoredSince), "yyyy-MM-dd HH:mm")
          : "N/A";
        return [
          escapeCSV(camera.name),
          camera.ipAddress,
          escapeCSV(camera.location || "N/A"),
          camera.status,
          uptimePct,
          monitoredSince,
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const locationSuffix = locationFilter !== "all" ? `-${locationFilter.replace(/\s+/g, '-')}` : "";
    a.download = `uptime-report${locationSuffix}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.href = url;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-reports">Reports</h1>
          <p className="text-muted-foreground">Uptime analytics and reporting</p>
        </div>
        <Button onClick={handleExportCSV} data-testid="button-export-report">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cameras</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-cameras">
              {summary?.totalCameras || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online Cameras</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-online-cameras">
              {summary?.onlineCameras || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline Cameras</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-offline-cameras">
              {summary?.offlineCameras || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Uptime</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-average-uptime">
              {summary?.averageUptime ? `${summary.averageUptime.toFixed(1)}%` : "N/A"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div>
              <CardTitle>Report Configuration</CardTitle>
              <CardDescription>
                Filter by location, select camera and time range for detailed analytics
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={locationFilter} onValueChange={(value) => {
                setLocationFilter(value);
                setSelectedCamera("all"); // Reset camera selection when location changes
              }}>
                <SelectTrigger className="w-48" data-testid="select-location-filter">
                  <MapPin className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="location-option-all">All Locations</SelectItem>
                  <SelectItem value="none" data-testid="location-option-none">No Location</SelectItem>
                  {uniqueLocations.map((location) => (
                    <SelectItem 
                      key={location} 
                      value={location}
                      data-testid={`location-option-${location.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                <SelectTrigger className="w-48" data-testid="select-camera">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    All Cameras {locationFilter !== "all" && `(${filteredCameras.length})`}
                  </SelectItem>
                  {filteredCameras.map((camera) => (
                    <SelectItem key={camera.id} value={camera.id.toString()}>
                      {camera.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32" data-testid="select-time-range">
                  <SelectValue placeholder="Time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 Days</SelectItem>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="90">90 Days</SelectItem>
                  <SelectItem value="365">365 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <UptimeChart
            cameraId={selectedCamera === "all" ? "all" : selectedCamera}
            days={parseInt(timeRange)}
            title={`${timeRange}-Day Uptime Trend`}
            description={
              selectedCamera === "all" 
                ? `${filteredCameras.length} camera${filteredCameras.length !== 1 ? 's' : ''}${locationFilter !== "all" ? ` in ${locationFilter}` : ''}`
                : filteredCameras.find(c => c.id.toString() === selectedCamera)?.name
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
