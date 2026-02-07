import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatusIndicator, { CameraStatus } from "./StatusIndicator";
import { Switch } from "@/components/ui/switch";
import { Edit, Trash2, ArrowLeft, RefreshCw, Move, Mic, Camera as CameraIcon, Info, BarChart3 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

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
  modelDetectedAt?: string;
}

interface CameraDetailViewProps {
  camera: CameraDetails;
  onBack?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDetectModel?: () => void;
  detectingModel?: boolean;
  onProbeAnalytics?: () => void;
  probingAnalytics?: boolean;
  onToggleAnalytic?: (key: string, enabled: boolean) => void;
}

export default function CameraDetailView({
  camera,
  onBack,
  onEdit,
  onDelete,
  onDetectModel,
  detectingModel = false,
  onProbeAnalytics,
  probingAnalytics = false,
  onToggleAnalytic,
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
        {/* Model Information Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Model Information</CardTitle>
                <CardDescription>Camera model and capabilities</CardDescription>
              </div>
              {onDetectModel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDetectModel}
                  disabled={detectingModel}
                  data-testid="button-detect-model"
                >
                  {detectingModel ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Model</span>
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
                        {camera.series} Series
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Unknown</span>
                )}
              </div>
            </div>
            {camera.fullName && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Full Name</span>
                <span className="text-sm font-medium text-right max-w-[60%]">{camera.fullName}</span>
              </div>
            )}
            {camera.firmwareVersion && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Firmware</span>
                <code className="text-sm font-mono">{camera.firmwareVersion}</code>
              </div>
            )}
            {camera.modelDetectedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Detected</span>
                <span className="text-sm">
                  {new Date(camera.modelDetectedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Capabilities Card */}
        <Card>
          <CardHeader>
            <CardTitle>Capabilities</CardTitle>
            <CardDescription>Camera features and specifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">PTZ Support</span>
              <div className="flex items-center gap-2">
                {camera.hasPTZ ? (
                  <>
                    <Move className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Yes</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">No</span>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Audio Support</span>
              <div className="flex items-center gap-2">
                {camera.hasAudio ? (
                  <>
                    <Mic className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Yes</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">No</span>
                )}
              </div>
            </div>
            {camera.resolution && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Resolution</span>
                <span className="text-sm font-medium">{camera.resolution}</span>
              </div>
            )}
            {camera.maxFramerate && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Max Framerate</span>
                <span className="text-sm font-medium">{camera.maxFramerate} fps</span>
              </div>
            )}
            {camera.numberOfViews && camera.numberOfViews > 1 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Views/Sensors</span>
                <div className="flex items-center gap-2">
                  <CameraIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{camera.numberOfViews}</span>
                </div>
              </div>
            )}
            {!camera.model && (
              <div className="flex items-start gap-2 pt-2 border-t">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Click the refresh button above to detect model information
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analytics Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Analytics
                </CardTitle>
                <CardDescription>Installed ACAP analytics and polling configuration</CardDescription>
              </div>
              {onProbeAnalytics && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onProbeAnalytics}
                        disabled={probingAnalytics}
                      >
                        <RefreshCw className={`h-4 w-4 ${probingAnalytics ? "animate-spin" : ""}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Probe camera for analytics ACAPs</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* People Counter */}
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm font-medium">People Counter</span>
                <p className="text-xs text-muted-foreground">Count people entering and exiting</p>
              </div>
              <div className="flex items-center gap-2">
                {camera.capabilities?.analytics?.peopleCount ? (
                  <>
                    <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
                      Available
                    </Badge>
                    <Switch
                      checked={camera.capabilities?.enabledAnalytics?.peopleCount ?? false}
                      onCheckedChange={(checked) => onToggleAnalytic?.("peopleCount", checked)}
                    />
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Not detected</span>
                )}
              </div>
            </div>

            {/* Occupancy Estimator */}
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm font-medium">Occupancy Estimator</span>
                <p className="text-xs text-muted-foreground">Real-time room occupancy count</p>
              </div>
              <div className="flex items-center gap-2">
                {camera.capabilities?.analytics?.occupancyEstimation ? (
                  <>
                    <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
                      Available
                    </Badge>
                    <Switch
                      checked={camera.capabilities?.enabledAnalytics?.occupancyEstimation ?? false}
                      onCheckedChange={(checked) => onToggleAnalytic?.("occupancyEstimation", checked)}
                    />
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Not detected</span>
                )}
              </div>
            </div>

            {/* Line Crossing */}
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm font-medium">Line Crossing</span>
                <p className="text-xs text-muted-foreground">Directional line crossing detection</p>
              </div>
              <div className="flex items-center gap-2">
                {camera.capabilities?.analytics?.lineCrossing ? (
                  <>
                    <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
                      Available
                    </Badge>
                    <Switch
                      checked={camera.capabilities?.enabledAnalytics?.lineCrossing ?? false}
                      onCheckedChange={(checked) => onToggleAnalytic?.("lineCrossing", checked)}
                    />
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Not detected</span>
                )}
              </div>
            </div>

            {/* Motion Detection (read-only, from VAPIX properties) */}
            {camera.capabilities?.analytics?.motionDetection && (
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm font-medium">Motion Detection</span>
                  <p className="text-xs text-muted-foreground">Built-in motion detection</p>
                </div>
                <Badge variant="secondary">Built-in</Badge>
              </div>
            )}

            {/* Tampering Detection (read-only, from VAPIX properties) */}
            {camera.capabilities?.analytics?.tampering && (
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm font-medium">Tampering Detection</span>
                  <p className="text-xs text-muted-foreground">Camera tampering alerts</p>
                </div>
                <Badge variant="secondary">Built-in</Badge>
              </div>
            )}

            {/* Hint if nothing detected */}
            {!camera.capabilities?.analytics?.peopleCount &&
             !camera.capabilities?.analytics?.occupancyEstimation &&
             !camera.capabilities?.analytics?.lineCrossing &&
             !camera.capabilities?.analytics?.motionDetection &&
             !camera.capabilities?.analytics?.tampering && (
              <div className="flex items-start gap-2 pt-2 border-t">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  No analytics detected. Click the refresh button to probe for installed analytics ACAPs.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Camera Information Card */}
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
