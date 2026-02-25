import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import StatusIndicator, { CameraStatus } from "./StatusIndicator";
import { Switch } from "@/components/ui/switch";
import { Edit, Trash2, ArrowLeft, RefreshCw, Move, Mic, Camera as CameraIcon, Info, BarChart3, AlertTriangle, CheckCircle, Clock, ShieldAlert, Shield } from "lucide-react";
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
  protocol?: string;
  port?: number;
  certValidationMode?: "none" | "tofu" | "ca";
  certMismatch?: boolean;
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
  series?: 'P' | 'Q' | 'M' | 'F' | 'A' | 'C' | 'D' | 'I' | 'T' | 'W';
  fullName?: string;
  firmwareVersion?: string;
  hasPTZ?: boolean;
  hasAudio?: boolean;
  resolution?: string;
  maxFramerate?: number;
  numberOfViews?: number;
  capabilities?: Record<string, any> & {
    system?: {
      architecture?: string;
      soc?: string;
      serialNumber?: string;
      hardwareId?: string;
      buildDate?: string;
    };
  };
  detectedAt?: string;
  sslFingerprint?: string;
  sslFingerprintFirstSeen?: string;
  sslFingerprintLastVerified?: string;
  lifecycle?: {
    status?: string;
    statusLabel?: string;
    discontinuedDate?: string;
    endOfHardwareSupport?: string;
    endOfSoftwareSupport?: string;
    replacementModel?: string;
    lastChecked?: string;
  };
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
  onRepinCert?: () => void;
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
  onRepinCert,
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

      {camera.certMismatch && (
        <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
          <ShieldAlert className="h-4 w-4 text-orange-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-orange-800 dark:text-orange-200">
              Certificate Mismatch Detected — The TLS certificate changed without a detected reboot.
            </span>
            {onRepinCert && (
              <Button variant="outline" size="sm" onClick={onRepinCert} className="ml-4 shrink-0">
                Re-pin Certificate
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

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
                            : camera.series === 'C'
                            ? "border-teal-500 text-teal-700 bg-teal-50"
                            : camera.series === 'A'
                            ? "border-indigo-500 text-indigo-700 bg-indigo-50"
                            : camera.series === 'D'
                            ? "border-cyan-500 text-cyan-700 bg-cyan-50"
                            : "border-orange-500 text-orange-700 bg-orange-50"
                        }
                      >
                        {camera.series === 'C' ? 'Speaker' : camera.series === 'A' ? 'Intercom' : camera.series === 'D' ? 'Radar' : `${camera.series} Series`}
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
            {camera.capabilities?.system?.serialNumber && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Serial Number</span>
                <code className="text-sm font-mono">{camera.capabilities.system.serialNumber}</code>
              </div>
            )}
            {camera.capabilities?.system?.hardwareId && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Hardware ID</span>
                <code className="text-sm font-mono">{camera.capabilities.system.hardwareId}</code>
              </div>
            )}
            {camera.capabilities?.system?.architecture && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Architecture</span>
                <span className="text-sm font-medium">{camera.capabilities.system.architecture}</span>
              </div>
            )}
            {camera.capabilities?.system?.soc && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">SoC</span>
                <span className="text-sm font-medium">{camera.capabilities.system.soc}</span>
              </div>
            )}
            {camera.capabilities?.system?.buildDate && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Build Date</span>
                <span className="text-sm">{camera.capabilities.system.buildDate}</span>
              </div>
            )}
            {/* Product Lifecycle / EOL Status — shown for ALL detected devices */}
            {camera.lifecycle?.status && (
              <>
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Lifecycle Status</span>
                    <div className="flex items-center gap-2">
                      {camera.lifecycle.discontinuedDate && (
                        <span className="text-sm text-muted-foreground">
                          EOL {new Date(camera.lifecycle.discontinuedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={
                          camera.lifecycle.status === "end-of-support"
                            ? "border-red-500 text-red-700 bg-red-50"
                            : camera.lifecycle.status === "eol-supported"
                            ? "border-yellow-500 text-yellow-700 bg-yellow-50"
                            : "border-green-500 text-green-700 bg-green-50"
                        }
                      >
                        {camera.lifecycle.status === "end-of-support" ? (
                          <AlertTriangle className="mr-1 h-3 w-3" />
                        ) : camera.lifecycle.status === "eol-supported" ? (
                          <Clock className="mr-1 h-3 w-3" />
                        ) : (
                          <CheckCircle className="mr-1 h-3 w-3" />
                        )}
                        {camera.lifecycle.statusLabel}
                      </Badge>
                    </div>
                  </div>
                </div>
                {camera.lifecycle.discontinuedDate && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Discontinued</span>
                    <span className="text-sm">{new Date(camera.lifecycle.discontinuedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                )}
                {camera.lifecycle.endOfHardwareSupport && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">HW Support Ends</span>
                    <span className={`text-sm ${new Date(camera.lifecycle.endOfHardwareSupport) < new Date() ? "text-red-600 font-medium" : ""}`}>
                      {new Date(camera.lifecycle.endOfHardwareSupport).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}
                {camera.lifecycle.endOfSoftwareSupport && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">SW Support Ends</span>
                    <span className={`text-sm ${new Date(camera.lifecycle.endOfSoftwareSupport) < new Date() ? "text-red-600 font-medium" : ""}`}>
                      {new Date(camera.lifecycle.endOfSoftwareSupport).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}
                {camera.lifecycle.replacementModel && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Replacement</span>
                    <span className="text-sm font-medium">AXIS {camera.lifecycle.replacementModel}</span>
                  </div>
                )}
              </>
            )}
            {camera.detectedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Detected</span>
                <span className="text-sm">
                  {new Date(camera.detectedAt).toLocaleString('en-US', {
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
            {(() => {
              const analytics = camera.capabilities?.analytics;
              const enabled = camera.capabilities?.enabledAnalytics;

              // Pollable analytics - shown with enable/disable switch
              const pollableAnalytics = [
                { key: "peopleCount", label: "People Counter", desc: "Count people entering and exiting", detected: analytics?.peopleCount },
                { key: "occupancyEstimation", label: "Occupancy Estimator", desc: "Real-time room occupancy count", detected: analytics?.occupancyEstimation },
                { key: "lineCrossing", label: "Line Crossing", desc: "Directional line crossing detection", detected: analytics?.lineCrossing },
                { key: "objectAnalytics", label: "Object Analytics (AOA)", desc: "AXIS Object Analytics platform", detected: analytics?.objectAnalytics },
                { key: "loiteringGuard", label: "Loitering Guard", desc: "Detect loitering in defined areas", detected: analytics?.loiteringGuard },
                { key: "fenceGuard", label: "Fence Guard", desc: "Virtual fence intrusion detection", detected: analytics?.fenceGuard },
                { key: "motionGuard", label: "Motion Guard", desc: "Advanced motion detection zones", detected: analytics?.motionGuard },
              ];

              const detectedPollable = pollableAnalytics.filter((a) => a.detected);
              const undetectedPollable = pollableAnalytics.filter((a) => !a.detected);

              // Built-in analytics (read-only)
              const builtIn = [
                { label: "Motion Detection", detected: analytics?.motionDetection },
                { label: "Tampering Detection", detected: analytics?.tampering },
              ].filter((a) => a.detected);

              const hasAnything = detectedPollable.length > 0 || builtIn.length > 0;

              return (
                <>
                  {/* Detected pollable analytics with toggle switches */}
                  {detectedPollable.map((item) => (
                    <div key={item.key} className="flex justify-between items-center">
                      <div>
                        <span className="text-sm font-medium">{item.label}</span>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
                          Available
                        </Badge>
                        <Switch
                          checked={(enabled as any)?.[item.key] ?? false}
                          onCheckedChange={(checked) => onToggleAnalytic?.(item.key, checked)}
                        />
                      </div>
                    </div>
                  ))}

                  {/* Object Analytics scenarios (if any) */}
                  {analytics?.objectAnalyticsScenarios && analytics.objectAnalyticsScenarios.length > 0 && (
                    <div className="pt-2 border-t">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Configured AOA Scenarios
                      </span>
                      <div className="mt-2 space-y-1">
                        {analytics.objectAnalyticsScenarios.map((s: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span>{s.name}</span>
                            <Badge variant="secondary" className="text-xs">{s.type}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Built-in analytics (read-only) */}
                  {builtIn.length > 0 && (
                    <>
                      {detectedPollable.length > 0 && <div className="border-t pt-2" />}
                      {builtIn.map((item) => (
                        <div key={item.label} className="flex justify-between items-center">
                          <div>
                            <span className="text-sm font-medium">{item.label}</span>
                            <p className="text-xs text-muted-foreground">Built-in firmware feature</p>
                          </div>
                          <Badge variant="secondary">Built-in</Badge>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Installed ACAPs list */}
                  {analytics?.acapInstalled && analytics.acapInstalled.length > 0 && (
                    <div className="pt-2 border-t">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Installed Applications ({analytics.acapInstalled.length})
                      </span>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {analytics.acapInstalled.map((app: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{app}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Not-detected analytics (collapsed) */}
                  {undetectedPollable.length > 0 && undetectedPollable.length < pollableAnalytics.length && (
                    <div className="pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        Not detected: {undetectedPollable.map((a) => a.label).join(", ")}
                      </span>
                    </div>
                  )}

                  {/* Hint if nothing at all detected */}
                  {!hasAnything && (
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        No analytics detected. Click the refresh button to probe for installed analytics ACAPs.
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
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
              <span className="text-sm text-muted-foreground">Connection</span>
              <span className="text-sm font-medium">
                {(camera.protocol || 'http').toUpperCase()}
                {camera.port && camera.port !== 80 && camera.port !== 443 ? `:${camera.port}` : ''}
                {camera.protocol === 'https' && (
                  <Badge variant="outline" className="ml-2 text-xs border-green-500 text-green-700 bg-green-50">
                    SSL
                  </Badge>
                )}
              </span>
            </div>
            {camera.protocol === 'https' && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Cert Validation</span>
                <Badge
                  variant="outline"
                  className={
                    camera.certValidationMode === "ca"
                      ? "border-green-500 text-green-700 bg-green-50"
                      : camera.certValidationMode === "tofu"
                      ? "border-blue-500 text-blue-700 bg-blue-50"
                      : "border-gray-400 text-gray-600 bg-gray-50"
                  }
                >
                  <Shield className="mr-1 h-3 w-3" />
                  {camera.certValidationMode === "ca" ? "CA Verified" : camera.certValidationMode === "tofu" ? "TOFU" : "None"}
                </Badge>
              </div>
            )}
            {camera.sslFingerprint && (
              <TooltipProvider>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">SSL Fingerprint</span>
                  <Tooltip>
                    <TooltipTrigger>
                      <code className="text-xs font-mono text-muted-foreground">
                        {camera.sslFingerprint.substring(0, 16)}...
                      </code>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs font-mono break-all">{camera.sslFingerprint}</p>
                      {camera.sslFingerprintFirstSeen && (
                        <p className="text-xs mt-1">Pinned: {new Date(camera.sslFingerprintFirstSeen).toLocaleDateString()}</p>
                      )}
                      {camera.sslFingerprintLastVerified && (
                        <p className="text-xs">Verified: {new Date(camera.sslFingerprintLastVerified).toLocaleDateString()}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            )}
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
