import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wifi, Plus, AlertCircle, Camera, Radio, Globe, Monitor } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AddCameraModal, { CameraFormData } from "@/components/AddCameraModal";
import { useMutation } from "@tanstack/react-query";

interface NetworkInterfaceInfo {
  name: string;
  address: string;
  cidr: string;
}

interface DiscoveredCamera {
  ipAddress: string;
  detected?: boolean;
  model?: string;
  serial?: string;
  firmware?: string;
  series?: string;
  discoveryMethod?: string;
  alreadyAdded?: boolean;
}

export default function NetworkScan() {
  const [subnet, setSubnet] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredCameras, setDiscoveredCameras] = useState<DiscoveredCamera[]>([]);
  const [selectedCameras, setSelectedCameras] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterfaceInfo[]>([]);
  const { toast } = useToast();

  // Auto-detect local network interfaces on mount
  useEffect(() => {
    async function fetchInterfaces() {
      try {
        const response = await apiRequest("GET", "/api/network/interfaces");
        const data: any = await response.json();
        const ifaces: NetworkInterfaceInfo[] = data.interfaces || [];
        setNetworkInterfaces(ifaces);
        // Auto-select first interface as default subnet
        if (ifaces.length > 0 && !subnet) {
          setSubnet(ifaces[0].cidr);
        }
      } catch {
        // Fallback if endpoint not available
        if (!subnet) setSubnet("192.168.1.0/24");
      }
    }
    fetchInterfaces();
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setDiscoveredCameras([]);
    setSelectedCameras(new Set());

    try {
      const response = await apiRequest("POST", "/api/cameras/discover", {
        subnet: subnet || undefined,
        bonjour: true,
        ssdp: true,
        httpScan: !!subnet,
      });
      const result: any = await response.json();

      setDiscoveredCameras(result.cameras || []);
      toast({
        title: "Discovery Complete",
        description: `Found ${result.total || 0} Axis camera(s)`,
      });
    } catch (error) {
      toast({
        title: "Discovery Failed",
        description: error instanceof Error ? error.message : "Failed to discover cameras",
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

  const selectAll = () => {
    const selectable = discoveredCameras.filter(c => !c.alreadyAdded).map(c => c.ipAddress);
    setSelectedCameras(new Set(selectable));
  };

  const addMutation = useMutation({
    mutationFn: async (data: CameraFormData) => {
      return await apiRequest("POST", "/api/cameras", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      setShowAddDialog(false);
      toast({
        title: "Success",
        description: "Camera added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add camera",
        variant: "destructive",
      });
    },
  });

  const handleAddCamera = (data: CameraFormData) => {
    addMutation.mutate(data);
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

    const cameras = Array.from(selectedCameras).map((ip) => {
      const cam = discoveredCameras.find(c => c.ipAddress === ip);
      return {
        name: cam?.model && cam.model !== 'Axis Camera'
          ? `${cam.model} (${ip})`
          : `Camera ${ip}`,
        ipAddress: ip,
        username,
        password,
      };
    });

    try {
      const response = await apiRequest("POST", "/api/cameras/bulk-add", { cameras });
      const result: any = await response.json();

      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      toast({
        title: "Import Complete",
        description: `Added ${result.added} camera(s)${result.skipped > 0 ? `, ${result.skipped} skipped (duplicates)` : ''}`,
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

  const discoveryMethodIcon = (method?: string) => {
    switch (method) {
      case 'bonjour': return <Radio className="w-3 h-3" />;
      case 'ssdp': return <Globe className="w-3 h-3" />;
      case 'http': return <Monitor className="w-3 h-3" />;
      default: return <Wifi className="w-3 h-3" />;
    }
  };

  const discoveryMethodLabel = (method?: string) => {
    switch (method) {
      case 'bonjour': return 'Bonjour/mDNS';
      case 'ssdp': return 'SSDP/UPnP';
      case 'http': return 'HTTP Probe';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-network-scan">Add Cameras</h1>
          <p className="text-muted-foreground">Discover cameras via network scan or add individual IP addresses</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-single-camera">
          <Camera className="w-4 h-4 mr-2" />
          Add Single Camera
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Network Discovery</CardTitle>
          <CardDescription>
            Discover Axis cameras using Bonjour/mDNS, SSDP/UPnP, and HTTP subnet scanning
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {networkInterfaces.length > 0 && (
            <div className="space-y-2">
              <Label>Detected Networks</Label>
              <div className="flex flex-wrap gap-2">
                {networkInterfaces.map((iface) => (
                  <Button
                    key={iface.cidr}
                    variant={subnet === iface.cidr ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSubnet(iface.cidr)}
                    data-testid={`button-interface-${iface.name}`}
                  >
                    {iface.name}: {iface.cidr}
                  </Button>
                ))}
              </div>
            </div>
          )}

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
              Leave empty to use multicast discovery only (Bonjour + SSDP), or enter a CIDR range to also scan via HTTP
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
                Discovering Cameras...
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 mr-2" />
                Start Discovery
              </>
            )}
          </Button>

          {discoveredCameras.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Detected cameras require credentials to be added to your monitoring system.
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
                  {selectedCameras.size} of {discoveredCameras.filter(c => !c.alreadyAdded).length} available selected
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                {selectedCameras.size > 0 && (
                  <Button onClick={handleAddSelected} data-testid="button-add-selected">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Selected ({selectedCameras.size})
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {discoveredCameras.map((camera) => (
                <div
                  key={camera.ipAddress}
                  className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer hover-elevate ${
                    camera.alreadyAdded
                      ? "opacity-50 cursor-not-allowed"
                      : selectedCameras.has(camera.ipAddress) ? "bg-accent" : ""
                  }`}
                  onClick={() => !camera.alreadyAdded && toggleCamera(camera.ipAddress)}
                  data-testid={`discovered-camera-${camera.ipAddress.replace(/\./g, "-")}`}
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selectedCameras.has(camera.ipAddress)}
                      onChange={() => !camera.alreadyAdded && toggleCamera(camera.ipAddress)}
                      disabled={camera.alreadyAdded}
                      className="w-4 h-4"
                      data-testid={`checkbox-camera-${camera.ipAddress.replace(/\./g, "-")}`}
                    />
                    <div>
                      <p className="font-medium">
                        {camera.model && camera.model !== 'Axis Camera' ? camera.model : camera.ipAddress}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{camera.ipAddress}</span>
                        {camera.serial && (
                          <>
                            <span>·</span>
                            <span>S/N: {camera.serial}</span>
                          </>
                        )}
                        {camera.firmware && (
                          <>
                            <span>·</span>
                            <span>FW: {camera.firmware}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {camera.series && (
                      <Badge variant="outline">{camera.series}-Series</Badge>
                    )}
                    <Badge
                      variant={camera.alreadyAdded ? "secondary" : "default"}
                      className="flex items-center gap-1"
                    >
                      {camera.alreadyAdded ? (
                        "Already Added"
                      ) : (
                        <>
                          {discoveryMethodIcon(camera.discoveryMethod)}
                          {discoveryMethodLabel(camera.discoveryMethod)}
                        </>
                      )}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AddCameraModal
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={handleAddCamera}
      />
    </div>
  );
}
