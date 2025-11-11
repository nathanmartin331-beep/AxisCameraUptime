import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wifi, Plus, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DiscoveredCamera {
  ipAddress: string;
  detected: boolean;
}

export default function NetworkScan() {
  const [subnet, setSubnet] = useState("192.168.1.0/24");
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredCameras, setDiscoveredCameras] = useState<DiscoveredCamera[]>([]);
  const [selectedCameras, setSelectedCameras] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const handleScan = async () => {
    setIsScanning(true);
    setDiscoveredCameras([]);
    setSelectedCameras(new Set());

    try {
      const response = await apiRequest("POST", "/api/cameras/scan", { subnet });
      const result: any = await response.json();

      setDiscoveredCameras(result.cameras || []);
      toast({
        title: "Scan Complete",
        description: `Found ${result.cameras?.length || 0} potential Axis camera(s)`,
      });
    } catch (error) {
      toast({
        title: "Scan Failed",
        description: error instanceof Error ? error.message : "Failed to scan network",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const toggleCamera = (ipAddress: string) => {
    const newSelected = new Set(selectedCameras);
    if (newSelected.has(ipAddress)) {
      newSelected.delete(ipAddress);
    } else {
      newSelected.add(ipAddress);
    }
    setSelectedCameras(newSelected);
  };

  const handleAddSelected = async () => {
    if (selectedCameras.size === 0) {
      toast({
        title: "No Cameras Selected",
        description: "Please select at least one camera to add",
        variant: "destructive",
      });
      return;
    }

    const username = prompt("Enter default username for selected cameras:");
    if (!username) return;

    const password = prompt("Enter default password for selected cameras:");
    if (!password) return;

    const cameras = Array.from(selectedCameras).map((ip, index) => ({
      name: `Camera ${ip}`,
      ipAddress: ip,
      username,
      password,
    }));

    try {
      await apiRequest("POST", "/api/cameras/import", { cameras });

      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      toast({
        title: "Success",
        description: `Added ${cameras.length} camera(s)`,
      });
      
      setDiscoveredCameras([]);
      setSelectedCameras(new Set());
    } catch (error) {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to import cameras",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-network-scan">Network Scan</h1>
        <p className="text-muted-foreground">Discover Axis cameras on your network</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subnet Scanner</CardTitle>
          <CardDescription>
            Scan your network for Axis cameras using VAPIX API detection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subnet">Subnet (CIDR notation)</Label>
            <Input
              id="subnet"
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="192.168.1.0/24"
              data-testid="input-subnet"
            />
            <p className="text-xs text-muted-foreground">
              Example: 192.168.1.0/24 scans local network, supports public IPs too
            </p>
          </div>

          <Button
            onClick={handleScan}
            disabled={isScanning}
            className="w-full"
            data-testid="button-start-scan"
          >
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                Scanning Network...
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 mr-2" />
                Start Scan
              </>
            )}
          </Button>

          {discoveredCameras.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Note: Detected cameras require credentials to be added to your monitoring system.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {discoveredCameras.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Discovered Cameras</CardTitle>
                <CardDescription>
                  {selectedCameras.size} of {discoveredCameras.length} selected
                </CardDescription>
              </div>
              {selectedCameras.size > 0 && (
                <Button onClick={handleAddSelected} data-testid="button-add-selected">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Selected ({selectedCameras.size})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {discoveredCameras.map((camera) => (
                <div
                  key={camera.ipAddress}
                  className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer hover-elevate ${
                    selectedCameras.has(camera.ipAddress) ? "bg-accent" : ""
                  }`}
                  onClick={() => toggleCamera(camera.ipAddress)}
                  data-testid={`discovered-camera-${camera.ipAddress.replace(/\./g, "-")}`}
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selectedCameras.has(camera.ipAddress)}
                      onChange={() => toggleCamera(camera.ipAddress)}
                      className="w-4 h-4"
                      data-testid={`checkbox-camera-${camera.ipAddress.replace(/\./g, "-")}`}
                    />
                    <div>
                      <p className="font-medium">{camera.ipAddress}</p>
                      <p className="text-sm text-muted-foreground">
                        {camera.detected ? "Axis camera detected" : "Potential camera"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={camera.detected ? "default" : "secondary"}>
                    {camera.detected ? "Detected" : "Unconfirmed"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
