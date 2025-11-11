import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatusIndicator, { CameraStatus } from "./StatusIndicator";
import { MoreVertical, Eye, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Camera {
  id: string;
  name: string;
  ipAddress: string;
  location: string;
  status: CameraStatus;
  videoStatus?: string;
  uptime: string;
  lastSeen: string;
}

interface CameraTableProps {
  cameras: Camera[];
  onViewDetails?: (camera: Camera) => void;
  onEdit?: (camera: Camera) => void;
  onDelete?: (camera: Camera) => void;
}

export default function CameraTable({
  cameras,
  onViewDetails,
  onEdit,
  onDelete
}: CameraTableProps) {
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Camera Name</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Current Uptime</TableHead>
            <TableHead>Last Seen</TableHead>
            <TableHead className="w-[70px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cameras.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                No cameras found
              </TableCell>
            </TableRow>
          ) : (
            cameras.map((camera) => (
              <TableRow 
                key={camera.id} 
                className="hover-elevate"
                data-testid={`camera-row-${camera.id}`}
              >
                <TableCell>
                  <TooltipProvider>
                    <div className="flex items-center gap-2">
                      <StatusIndicator status={camera.status} />
                      {camera.status === "online" && camera.videoStatus && (
                        <Tooltip>
                          <TooltipTrigger>
                            {camera.videoStatus === "video_ok" ? (
                              <Badge 
                                variant="outline" 
                                className="gap-1 border-status-online text-status-online"
                                data-testid={`video-status-ok-${camera.id}`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Video OK
                              </Badge>
                            ) : camera.videoStatus === "video_failed" ? (
                              <Badge 
                                variant="outline" 
                                className="gap-1 border-status-away text-status-away"
                                data-testid={`video-status-failed-${camera.id}`}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                Video Failed
                              </Badge>
                            ) : (
                              <Badge 
                                variant="outline" 
                                className="gap-1"
                                data-testid={`video-status-unknown-${camera.id}`}
                              >
                                Unknown
                              </Badge>
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-sm">
                              {camera.videoStatus === "video_ok" 
                                ? "Video stream is healthy and delivering images"
                                : camera.videoStatus === "video_failed"
                                ? "Camera reachable but video stream unavailable. Confirm live view configuration, credentials, and that the JPEG snapshot API is enabled."
                                : "Video status not yet checked"
                              }
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="font-medium">{camera.name}</TableCell>
                <TableCell>
                  <code className="text-sm font-mono">{camera.ipAddress}</code>
                </TableCell>
                <TableCell>{camera.location}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{camera.uptime}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {camera.lastSeen}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        data-testid={`button-actions-${camera.id}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={() => onViewDetails?.(camera)}
                        data-testid={`button-view-${camera.id}`}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onEdit?.(camera)}
                        data-testid={`button-edit-${camera.id}`}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onDelete?.(camera)}
                        className="text-destructive"
                        data-testid={`button-delete-${camera.id}`}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
