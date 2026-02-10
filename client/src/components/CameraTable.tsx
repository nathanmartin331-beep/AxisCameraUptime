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
import { MoreVertical, Eye, CheckCircle2, AlertTriangle, XCircle, Move, Mic, Camera as CameraIcon, Loader2, BarChart3 } from "lucide-react";
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
  model?: string;
  series?: 'P' | 'Q' | 'M' | 'F';
  fullName?: string;
  firmwareVersion?: string;
  hasPTZ?: boolean;
  hasAudio?: boolean;
  resolution?: string;
  maxFramerate?: number;
  numberOfViews?: number;
  capabilities?: Record<string, any>;
  detectedAt?: string;
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
            <TableHead>Model</TableHead>
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
              <TableCell colSpan={8} className="text-center text-muted-foreground h-24">
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
                            ) : camera.videoStatus === "not_applicable" ? (
                              <Badge
                                variant="outline"
                                className="gap-1 border-teal-400 text-teal-600"
                                data-testid={`video-status-na-${camera.id}`}
                              >
                                Speaker
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
                                : camera.videoStatus === "not_applicable"
                                ? "Network speaker — no video sensor. System uptime is monitored."
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
                  <TooltipProvider>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {camera.model ? (
                            <>
                              <span className="text-sm font-medium">{camera.model}</span>
                              {camera.series && (
                                <Badge
                                  variant="outline"
                                  className={
                                    camera.series === 'P'
                                      ? "border-blue-500 text-blue-700 bg-blue-50"
                                      : camera.series === 'Q'
                                      ? "border-green-500 text-green-700 bg-green-50"
                                      : camera.series === 'M'
                                      ? "border-purple-500 text-purple-700 bg-purple-50"
                                      : "border-orange-500 text-orange-700 bg-orange-50"
                                  }
                                >
                                  {camera.series}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Detecting...
                            </span>
                          )}
                        </div>
                        {(camera.hasPTZ || camera.hasAudio || (camera.numberOfViews && camera.numberOfViews > 1) || (camera.capabilities as any)?.enabledAnalytics && Object.values((camera.capabilities as any).enabledAnalytics).some(Boolean)) && (
                          <div className="flex items-center gap-1">
                            {(camera.capabilities as any)?.enabledAnalytics && Object.values((camera.capabilities as any).enabledAnalytics).some(Boolean) && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <BarChart3 className="w-3 h-3 text-blue-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Analytics Enabled</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {camera.hasPTZ && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Move className="w-3 h-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">PTZ Support</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {camera.hasAudio && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Mic className="w-3 h-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Audio Support</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {camera.numberOfViews && camera.numberOfViews > 1 && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-0.5">
                                    <CameraIcon className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">×{camera.numberOfViews}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Multi-sensor ({camera.numberOfViews} views)</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </TooltipProvider>
                </TableCell>
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
