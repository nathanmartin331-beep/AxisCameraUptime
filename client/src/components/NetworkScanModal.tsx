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
import { Progress } from "@/components/ui/progress";
import { Wifi, Loader2, Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

interface NetworkScanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCameras?: (selectedIps: string[]) => void;
}

interface DiscoveredDevice {
  ip: string;
  mac: string;
  ports: number[];
  type: string;
}

export default function NetworkScanModal({
  open,
  onOpenChange,
  onAddCameras
}: NetworkScanModalProps) {
  const [subnet, setSubnet] = useState("192.168.1.0/24");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleScan = () => {
    setScanning(true);
    setProgress(0);
    setDevices([]);
    console.log("Scanning subnet:", subnet);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setScanning(false);
          setDevices([
            { ip: "192.168.1.101", mac: "00:40:8c:ab:cd:ef", ports: [80, 554], type: "Axis Camera" },
            { ip: "192.168.1.102", mac: "00:40:8c:ab:cd:f0", ports: [80, 554], type: "Axis Camera" },
            { ip: "192.168.1.105", mac: "00:40:8c:ab:cd:f3", ports: [80], type: "Possible Camera" },
          ]);
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const handleAddSelected = () => {
    const selectedIps = Array.from(selected);
    onAddCameras?.(selectedIps);
    console.log("Adding cameras:", selectedIps);
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
            Scan your network to automatically discover Axis cameras
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="subnet">Subnet (CIDR notation)</Label>
              <Input
                id="subnet"
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
                {scanning ? "Scanning..." : "Start Scan"}
              </Button>
            </div>
          </div>

          {scanning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Scanning network...</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
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
                      <TableHead>MAC Address</TableHead>
                      <TableHead>Open Ports</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.map((device) => (
                      <TableRow key={device.ip} data-testid={`device-row-${device.ip}`}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(device.ip)}
                            onCheckedChange={() => toggleDevice(device.ip)}
                            data-testid={`checkbox-${device.ip}`}
                          />
                        </TableCell>
                        <TableCell>
                          <code className="text-sm font-mono">{device.ip}</code>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm font-mono text-muted-foreground">
                            {device.mac}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {device.ports.map((port) => (
                              <Badge key={port} variant="secondary" className="text-xs">
                                {port}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={device.type === "Axis Camera" ? "default" : "outline"}>
                            {device.type}
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
