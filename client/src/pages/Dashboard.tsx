import { useState } from "react";
import { Camera, Wifi, TrendingUp, Plus, Upload, Search as SearchIcon } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import CameraTable, { Camera as CameraType } from "@/components/CameraTable";
import UptimeChart from "@/components/UptimeChart";
import AddCameraModal from "@/components/AddCameraModal";
import NetworkScanModal from "@/components/NetworkScanModal";
import CSVImportModal from "@/components/CSVImportModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const mockCameras: CameraType[] = [
  {
    id: "1",
    name: "Main Entrance",
    ipAddress: "192.168.1.101",
    location: "Building A - Floor 1",
    status: "online",
    uptime: "99.8%",
    lastSeen: "2 minutes ago"
  },
  {
    id: "2",
    name: "Parking Lot North",
    ipAddress: "192.168.1.102",
    location: "Building A - Exterior",
    status: "online",
    uptime: "98.5%",
    lastSeen: "1 minute ago"
  },
  {
    id: "3",
    name: "Server Room",
    ipAddress: "192.168.1.103",
    location: "Building B - Floor 2",
    status: "offline",
    uptime: "85.2%",
    lastSeen: "3 hours ago"
  },
  {
    id: "4",
    name: "Loading Dock",
    ipAddress: "192.168.1.104",
    location: "Warehouse",
    status: "warning",
    uptime: "95.1%",
    lastSeen: "15 minutes ago"
  },
  {
    id: "5",
    name: "Reception Area",
    ipAddress: "192.168.1.105",
    location: "Building A - Floor 1",
    status: "online",
    uptime: "99.5%",
    lastSeen: "1 minute ago"
  }
];

const generateMockData = () => {
  const data = [];
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      uptime: 95 + Math.random() * 5
    });
  }
  return data;
};

export default function Dashboard() {
  const [addCameraOpen, setAddCameraOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const onlineCameras = mockCameras.filter(c => c.status === "online").length;
  const totalCameras = mockCameras.length;
  const uptimePercentage = ((onlineCameras / totalCameras) * 100).toFixed(1);

  const filteredCameras = mockCameras.filter(camera =>
    camera.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    camera.ipAddress.includes(searchTerm) ||
    camera.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6" data-testid="page-dashboard">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Monitor your Axis camera network uptime and availability
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Total Cameras"
          value={totalCameras}
          subtitle="Across all locations"
          icon={Camera}
          accentColor="blue"
        />
        <MetricCard
          title="Online Cameras"
          value={onlineCameras}
          subtitle={`${uptimePercentage}% availability`}
          icon={Wifi}
          accentColor="green"
        />
        <MetricCard
          title="System Uptime"
          value="99.2%"
          subtitle="Last 30 days"
          icon={TrendingUp}
          accentColor="green"
        />
      </div>

      <UptimeChart data={generateMockData()} />

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

        <CameraTable
          cameras={filteredCameras}
          onViewDetails={(camera) => console.log("View details:", camera)}
          onEdit={(camera) => console.log("Edit:", camera)}
          onDelete={(camera) => console.log("Delete:", camera)}
        />
      </div>

      <AddCameraModal
        open={addCameraOpen}
        onOpenChange={setAddCameraOpen}
        onSave={(data) => console.log("Camera saved:", data)}
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
