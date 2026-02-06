import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, Users } from "lucide-react";
import { Link } from "wouter";

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  memberCount: number;
}

export function GroupOverviewWidget() {
  const { data: groups, isLoading } = useQuery<GroupInfo[]>({
    queryKey: ["/api/groups"],
  });

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Groups Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Groups Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            No groups created yet. Go to Groups to create one.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          Groups ({groups.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {groups.map((group) => (
            <Link key={group.id} href={`/groups/${group.id}`}>
              <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer">
                <div className="flex items-center gap-2">
                  {group.color && (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  <span className="text-sm font-medium">{group.name}</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />
                  {group.memberCount}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
