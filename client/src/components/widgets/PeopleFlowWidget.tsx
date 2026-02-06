import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
}

interface AnalyticsSummary {
  totalIn: number;
  totalOut: number;
  currentOccupancy: number;
}

export function PeopleFlowWidget() {
  const { data: groups, isLoading: groupsLoading } = useQuery<GroupInfo[]>({
    queryKey: ["/api/groups"],
  });

  const firstGroup = groups?.[0];
  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/groups", firstGroup?.id, "analytics"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${firstGroup!.id}/analytics?days=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!firstGroup,
    refetchInterval: 30000,
  });

  if (groupsLoading || analyticsLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">People Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!firstGroup) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">People Flow</CardTitle>
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
        <CardTitle className="text-sm font-medium">{firstGroup.name} - Today</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-green-500 mb-1">
              <ArrowDownLeft className="h-4 w-4" />
              <span className="text-xs font-medium">In</span>
            </div>
            <div className="text-2xl font-bold">{analytics?.totalIn ?? 0}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-red-500 mb-1">
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-xs font-medium">Out</span>
            </div>
            <div className="text-2xl font-bold">{analytics?.totalOut ?? 0}</div>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Current</p>
            <div className="text-2xl font-bold">{analytics?.currentOccupancy ?? 0}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
