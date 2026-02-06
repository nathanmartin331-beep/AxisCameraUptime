import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
}

interface OccupancyData {
  total: number;
  cameras: Array<{ id: string; name: string; occupancy: number }>;
}

export function GroupOccupancyWidget() {
  // Get all groups first
  const { data: groups, isLoading: groupsLoading } = useQuery<GroupInfo[]>({
    queryKey: ["/api/groups"],
  });

  // Get occupancy for the first group that exists
  const firstGroup = groups?.[0];
  const { data: occupancy, isLoading: occLoading } = useQuery<OccupancyData>({
    queryKey: ["/api/groups", firstGroup?.id, "occupancy"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${firstGroup!.id}/occupancy`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!firstGroup,
    refetchInterval: 10000,
  });

  if (groupsLoading || occLoading) {
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
        <div className="text-3xl font-bold">{occupancy?.total ?? 0}</div>
        <p className="text-xs text-muted-foreground mt-1">
          Current occupancy across {occupancy?.cameras?.length || 0} cameras
        </p>
      </CardContent>
    </Card>
  );
}
