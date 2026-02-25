import { useState, useCallback, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeft, Users, UserPlus, TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "wouter";

interface GroupMember {
  id: string;
  name: string;
  ipAddress: string;
  currentStatus: string | null;
}

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  members: GroupMember[];
}

interface OccupancyCamera {
  id: string;
  name: string;
  occupancy: number;
}

interface OccupancyData {
  total: number;
  cameras: OccupancyCamera[];
}

interface AnalyticsPerCamera {
  id: string;
  name: string;
  in: number;
  out: number;
  occupancy: number;
}

interface AnalyticsData {
  totalIn: number;
  totalOut: number;
  currentOccupancy: number;
  perCamera: AnalyticsPerCamera[];
}

interface TrendPoint {
  timestamp: string;
  value: number;
}

interface TrendData {
  eventType: string;
  trend: TrendPoint[];
}

interface AllCamera {
  id: string;
  name: string;
  ipAddress: string;
}

function formatTrendTimestamp(timestamp: string, days: number): string {
  const date = new Date(timestamp);
  if (days <= 1) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    hour12: true,
  });
}

export default function GroupDetail() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { toast } = useToast();
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedCameraIds, setSelectedCameraIds] = useState<Set<string>>(new Set());
  const [trendDays, setTrendDays] = useState(7);
  const [trendEventType, setTrendEventType] = useState<string>("occupancy");

  // Fetch group details
  const {
    data: group,
    isLoading: groupLoading,
    error: groupError,
  } = useQuery<GroupData>({
    queryKey: ["/api/groups", groupId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch group");
      return res.json();
    },
    enabled: !!groupId,
  });

  // Fetch real-time occupancy (refetch every 10s)
  const { data: occupancy, isLoading: occupancyLoading } = useQuery<OccupancyData>({
    queryKey: ["/api/groups", groupId, "occupancy"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/occupancy`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!groupId,
    refetchInterval: 10000,
  });

  // Fetch analytics summary
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/groups", groupId, "analytics", trendDays],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/analytics?days=${trendDays}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!groupId,
  });

  // Fetch trend data
  const { data: trend, isLoading: trendLoading } = useQuery<TrendData>({
    queryKey: ["/api/groups", groupId, "trend", trendDays, trendEventType],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/analytics/trend?eventType=${trendEventType}&days=${trendDays}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!groupId,
  });

  // Auto-fallback: if occupancy trend returns empty, try line_crossing
  useEffect(() => {
    if (trendEventType === "occupancy" && trend && trend.trend.length === 0) {
      setTrendEventType("line_crossing");
    }
  }, [trend, trendEventType]);

  // Fetch all cameras for manage members dialog
  const { data: allCameras } = useQuery<AllCamera[]>({
    queryKey: ["/api/cameras"],
    enabled: manageOpen,
  });

  // Add members mutation
  const addMembersMutation = useMutation({
    mutationFn: async (cameraIds: string[]) => {
      await apiRequest("POST", `/api/groups/${groupId}/members`, { cameraIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "occupancy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "analytics"] });
      toast({ title: "Members updated", description: "Group members have been updated." });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update group members.",
      });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (cameraId: string) => {
      await apiRequest("DELETE", `/api/groups/${groupId}/members/${cameraId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "occupancy"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "analytics"] });
      toast({ title: "Member removed", description: "Camera removed from group." });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to remove member.",
      });
    },
  });

  const handleOpenManageDialog = useCallback(() => {
    if (group) {
      setSelectedCameraIds(new Set(group.members.map((m) => m.id)));
    }
    setManageOpen(true);
  }, [group]);

  const handleToggleCamera = useCallback((cameraId: string, checked: boolean) => {
    setSelectedCameraIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(cameraId);
      } else {
        next.delete(cameraId);
      }
      return next;
    });
  }, []);

  const handleSaveMembers = useCallback(() => {
    if (!group) return;

    const currentIds = new Set(group.members.map((m) => m.id));
    const toAdd = Array.from(selectedCameraIds).filter((id) => !currentIds.has(id));
    const toRemove = Array.from(currentIds).filter((id) => !selectedCameraIds.has(id));

    if (toAdd.length > 0) {
      addMembersMutation.mutate(toAdd);
    }

    for (const id of toRemove) {
      removeMemberMutation.mutate(id);
    }

    setManageOpen(false);
  }, [group, selectedCameraIds, addMembersMutation, removeMemberMutation]);

  if (!groupId || groupError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Group not found</p>
      </div>
    );
  }

  if (groupLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-10 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!group) {
    return null;
  }

  const currentOccupancy = occupancy?.total ?? analytics?.currentOccupancy ?? 0;
  const totalIn = analytics?.totalIn ?? 0;
  const totalOut = analytics?.totalOut ?? 0;
  const memberCount = group.members.length;

  const trendLabel =
    trendEventType === "occupancy" ? "Occupancy"
    : trendEventType === "line_crossing" ? "Line Crossings"
    : trendEventType === "people_in" ? "People In"
    : trendEventType;

  const chartData = (trend?.trend ?? []).map((point) => ({
    time: formatTrendTimestamp(point.timestamp, trendDays),
    value: point.value,
  }));

  const cameraOccupancyMap = new Map<string, number>();
  if (occupancy?.cameras) {
    for (const cam of occupancy.cameras) {
      cameraOccupancyMap.set(cam.id, cam.occupancy);
    }
  }

  const groupColor = group.color || "#6366f1";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/groups">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
              <Badge
                style={{ backgroundColor: groupColor, color: "#fff" }}
                className="text-xs"
              >
                {memberCount} camera{memberCount !== 1 ? "s" : ""}
              </Badge>
            </div>
            {group.description && (
              <p className="text-muted-foreground mt-1">{group.description}</p>
            )}
          </div>
        </div>
        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenManageDialog}>
              <UserPlus className="h-4 w-4 mr-2" />
              Manage Members
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Manage Group Members</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-80 overflow-y-auto py-2">
              {allCameras && allCameras.length > 0 ? (
                allCameras.map((camera) => (
                  <label
                    key={camera.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedCameraIds.has(camera.id)}
                      onCheckedChange={(checked) =>
                        handleToggleCamera(camera.id, !!checked)
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{camera.name}</p>
                      <p className="text-xs text-muted-foreground">{camera.ipAddress}</p>
                    </div>
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No cameras available
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setManageOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveMembers}
                disabled={addMembersMutation.isPending || removeMemberMutation.isPending}
              >
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Occupancy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {occupancyLoading ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <p className="text-4xl font-bold">{currentOccupancy}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Total In
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <p className="text-4xl font-bold">{totalIn}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Total Out
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <p className="text-4xl font-bold">{totalOut}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Member Cameras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{memberCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Trend Chart */}
      <Card>
        <CardHeader className="flex flex-col space-y-3 pb-2">
          <div className="flex flex-row items-center justify-between">
            <CardTitle>{trendLabel} Trend</CardTitle>
            <Tabs value={String(trendDays)} onValueChange={(v) => setTrendDays(parseInt(v))}>
              <TabsList className="h-8">
                <TabsTrigger value="1" className="text-xs px-2 h-6">24h</TabsTrigger>
                <TabsTrigger value="7" className="text-xs px-2 h-6">7d</TabsTrigger>
                <TabsTrigger value="30" className="text-xs px-2 h-6">30d</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Tabs value={trendEventType} onValueChange={setTrendEventType}>
            <TabsList className="h-8">
              <TabsTrigger value="occupancy" className="text-xs px-2 h-6">Occupancy</TabsTrigger>
              <TabsTrigger value="line_crossing" className="text-xs px-2 h-6">Line Crossing</TabsTrigger>
              <TabsTrigger value="people_in" className="text-xs px-2 h-6">People In</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={groupColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={groupColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={groupColor}
                  strokeWidth={2}
                  fill="url(#occupancyGradient)"
                  name={trendLabel}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No trend data available yet. Analytics data will appear once cameras with people counting are polled.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Member Cameras Table */}
      <Card>
        <CardHeader>
          <CardTitle>Member Cameras</CardTitle>
        </CardHeader>
        <CardContent>
          {group.members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No cameras in this group yet.</p>
              <p className="text-sm mt-1">Click "Manage Members" to add cameras.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Name</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">IP Address</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 text-sm font-medium text-muted-foreground text-right">
                      Occupancy
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.members.map((member) => {
                    const memberOccupancy = cameraOccupancyMap.get(member.id);
                    const statusColor =
                      member.currentStatus === "online"
                        ? "bg-green-500"
                        : member.currentStatus === "offline"
                          ? "bg-red-500"
                          : "bg-gray-400";

                    return (
                      <tr key={member.id} className="border-b last:border-0">
                        <td className="py-3">
                          <Link
                            href={`/cameras/${member.id}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {member.name}
                          </Link>
                        </td>
                        <td className="py-3 text-sm text-muted-foreground">
                          {member.ipAddress}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${statusColor}`}
                            />
                            <span className="text-sm capitalize">
                              {member.currentStatus || "unknown"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-sm font-medium text-right">
                          {memberOccupancy !== undefined ? memberOccupancy : "--"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
