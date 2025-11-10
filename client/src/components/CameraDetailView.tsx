import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatusIndicator, { CameraStatus } from "./StatusIndicator";
import { Edit, Trash2, ArrowLeft } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CameraDetails {
  id: string;
  name: string;
  ipAddress: string;
  location: string;
  status: CameraStatus;
  currentUptime: string;
  totalUptime: string;
  lastSeen: string;
  addedDate: string;
  bootId: string;
  reboots: Array<{
    timestamp: string;
    duration: string;
    bootId: string;
  }>;
}

interface CameraDetailViewProps {
  camera: CameraDetails;
  onBack?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function CameraDetailView({
  camera,
  onBack,
  onEdit,
  onDelete
}: CameraDetailViewProps) {
  return (
    <div className="space-y-6" data-testid="camera-detail-view">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{camera.name}</h1>
            <p className="text-sm text-muted-foreground">
              <code className="font-mono">{camera.ipAddress}</code>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onEdit}
            data-testid="button-edit"
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={onDelete}
            data-testid="button-delete"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Camera Information</CardTitle>
            <CardDescription>Basic details and configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusIndicator status={camera.status} showLabel />
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Location</span>
              <span className="text-sm font-medium">{camera.location}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">IP Address</span>
              <code className="text-sm font-mono">{camera.ipAddress}</code>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Added Date</span>
              <span className="text-sm">{camera.addedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Boot ID</span>
              <code className="text-xs font-mono text-muted-foreground">
                {camera.bootId}
              </code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uptime Statistics</CardTitle>
            <CardDescription>Current and historical availability</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Current Uptime</span>
              <Badge variant="secondary" className="text-base">
                {camera.currentUptime}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">30-Day Uptime</span>
              <span className="text-2xl font-semibold">{camera.totalUptime}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Last Seen</span>
              <span className="text-sm">{camera.lastSeen}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Reboots</span>
              <span className="text-sm font-medium">{camera.reboots.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reboot History</CardTitle>
          <CardDescription>Recent camera reboots and power cycles</CardDescription>
        </CardHeader>
        <CardContent>
          {camera.reboots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No reboots detected in the past 30 days
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Downtime Duration</TableHead>
                  <TableHead>Boot ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {camera.reboots.map((reboot, idx) => (
                  <TableRow key={idx} data-testid={`reboot-row-${idx}`}>
                    <TableCell>{reboot.timestamp}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{reboot.duration}</Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono text-muted-foreground">
                        {reboot.bootId}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
