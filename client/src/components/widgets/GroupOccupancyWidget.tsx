import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { useGroupAnalyticsStream } from "@/hooks/useGroupAnalyticsStream";

interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
}

export function GroupOccupancyWidget() {
  // Get all groups first
  const { data: groups, isLoading: groupsLoading } = useQuery<GroupInfo[]>({
    queryKey: ["/api/groups"],
  });

  const firstGroup = groups?.[0];

  // Live occupancy via SSE stream
  const stream = useGroupAnalyticsStream(firstGroup?.id);

  if (groupsLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Group Occupancy</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-24" />
        </CardContent>
      </Card>
    );
  }

  if (!firstGroup) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Group Occupancy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No groups created yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          {firstGroup.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{stream.occupancy}</div>
        <p className="text-xs text-muted-foreground mt-1">
          Current occupancy across {stream.perCamera.length || firstGroup.memberCount} cameras
        </p>
      </CardContent>
    </Card>
  );
}
