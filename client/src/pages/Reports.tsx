import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import UptimeChart from "@/components/UptimeChart";

interface Camera {
  id: number;
  name: string;
  ipAddress: string;
  status: string;
}

export default function Reports() {
  const [timeRange, setTimeRange] = useState("30");
  const [selectedCamera, setSelectedCamera] = useState<string>("all");

  const { data: cameras = [] } = useQuery<Camera[]>({
    queryKey: ["/api/cameras"],
  });

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

  const handleExportCSV = () => {
    const csvContent = [
      ["Camera Name", "IP Address", "Status", "Uptime %", "Last Seen"].join(","),
      ...cameras.map((camera) =>
        [
          camera.name,
          camera.ipAddress,
          camera.status,
          "N/A",
          "N/A"
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uptime-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
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
          <div className="flex justify-between items-center gap-4">
            <div>
              <CardTitle>Report Configuration</CardTitle>
              <CardDescription>Select time range and camera for detailed analytics</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                <SelectTrigger className="w-48" data-testid="select-camera">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cameras</SelectItem>
                  {cameras.map((camera) => (
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
            description={selectedCamera === "all" ? "All cameras" : cameras.find(c => c.id.toString() === selectedCamera)?.name}
          />
        </CardContent>
      </Card>
    </div>
  );
}
