import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wifi, Loader2, Plus, Lock, Unlock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";

interface NetworkScanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCameras?: (selectedIps: string[]) => void;
}

interface DiscoveredDevice {
  ipAddress: string;
  model?: string;
  serial?: string;
  firmware?: string;
  series?: string;
  discoveryMethod?: string;
  detectedProtocol?: string;
  alreadyAdded?: boolean;
}

export default function NetworkScanModal({
  open,
  onOpenChange,
  onAddCameras
}: NetworkScanModalProps) {
  const [subnet, setSubnet] = useState("");
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleScan = async () => {
    setScanning(true);
    setDevices([]);
    setSelected(new Set());

    try {
      const response = await apiRequest("POST", "/api/cameras/discover", {
        subnet: subnet || undefined,
        bonjour: true,
        ssdp: true,
        httpScan: !!subnet,
      });
      const result: any = await response.json();
      setDevices(result.cameras || []);
    } catch (error) {
      console.error("Discovery failed:", error);
    } finally {
      setScanning(false);
    }
  };

  const handleAddSelected = () => {
    const selectedIps = Array.from(selected);
    onAddCameras?.(selectedIps);
    onOpenChange(false);
  };

  const toggleDevice = (ip: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(ip)) {
      newSelected.delete(ip);
    } else {
      newSelected.add(ip);
    }
    setSelected(newSelected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]" data-testid="dialog-network-scan">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Network Scanner
          </DialogTitle>
          <DialogDescription>
            Discover Axis cameras via Bonjour/mDNS, SSDP/UPnP, and HTTP scanning
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="modal-subnet">Subnet (CIDR notation, optional)</Label>
              <Input
                id="modal-subnet"
                data-testid="input-subnet"
                value={subnet}
                onChange={(e) => setSubnet(e.target.value)}
                placeholder="192.168.1.0/24"
                disabled={scanning}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleScan}
                disabled={scanning}
                data-testid="button-start-scan"
              >
                {scanning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {scanning ? "Scanning..." : "Discover"}
              </Button>
            </div>
          </div>

          {scanning && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Scanning network (Bonjour + SSDP{subnet ? " + HTTP" : ""})...</span>
            </div>
          )}

          {devices.length > 0 && (
            <>
              <div className="border rounded-md max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Serial</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Discovery</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.map((device) => (
                      <TableRow key={device.ipAddress} data-testid={`device-row-${device.ipAddress}`}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(device.ipAddress)}
                            onCheckedChange={() => toggleDevice(device.ipAddress)}
                            disabled={device.alreadyAdded}
                            data-testid={`checkbox-${device.ipAddress}`}
                          />
                        </TableCell>
                        <TableCell>
                          <code className="text-sm font-mono">{device.ipAddress}</code>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {device.model || "Axis Camera"}
                          </span>
                          {device.firmware && (
                            <span className="text-xs text-muted-foreground ml-1">
                              v{device.firmware}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-sm font-mono text-muted-foreground">
                            {device.serial || "—"}
                          </code>
                        </TableCell>
                        <TableCell>
                          {device.detectedProtocol === "https" ? (
                            <Badge variant="outline" className="gap-0.5 text-xs border-green-500 text-green-700 bg-green-50">
                              <Lock className="w-3 h-3" />
                              HTTPS
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-0.5 text-xs border-amber-400 text-amber-600 bg-amber-50">
                              <Unlock className="w-3 h-3" />
                              HTTP
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={device.alreadyAdded ? "secondary" : "outline"} className="text-xs">
                            {device.alreadyAdded ? "Added" : device.discoveryMethod || "http"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center pt-2">
                <p className="text-sm text-muted-foreground">
                  {selected.size} device(s) selected
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddSelected}
                    disabled={selected.size === 0}
                    data-testid="button-add-selected"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Selected ({selected.size})
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
