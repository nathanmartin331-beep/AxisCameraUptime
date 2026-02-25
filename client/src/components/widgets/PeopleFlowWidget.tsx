import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useGroupAnalyticsStream } from "@/hooks/useGroupAnalyticsStream";

interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
}

export function PeopleFlowWidget() {
  const { data: groups, isLoading: groupsLoading } = useQuery<GroupInfo[]>({
    queryKey: ["/api/groups"],
  });

  const firstGroup = groups?.[0];

  // Live analytics via SSE stream
  const stream = useGroupAnalyticsStream(firstGroup?.id);

  if (groupsLoading) {
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
            <div className="text-2xl font-bold">{stream.totalIn}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-red-500 mb-1">
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-xs font-medium">Out</span>
            </div>
            <div className="text-2xl font-bold">{stream.totalOut}</div>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Current</p>
            <div className="text-2xl font-bold">{stream.occupancy}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
