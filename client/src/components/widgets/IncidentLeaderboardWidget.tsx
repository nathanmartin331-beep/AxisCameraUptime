import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { List } from "lucide-react";

interface SiteMetric {
  location: string;
  cameraCount: number;
  totalIncidents: number;
  incidentsPerCamera: number;
  averageUptime: number;
  siteHealthScore: number;
  rank: number;
}

export function IncidentLeaderboardWidget({ timeWindow = 30 }: { timeWindow?: number }) {
  const { data: sites, isLoading } = useQuery<SiteMetric[]>({
    queryKey: ['/api/metrics/sites', timeWindow],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Incident Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Sort sites by most incidents (worst first)
  const sorted = [...(sites || [])].sort((a, b) => b.totalIncidents - a.totalIncidents);

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <List className="h-4 w-4" />
          Incident Leaderboard ({timeWindow}d)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">No site data available</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((site, i) => (
              <div key={site.location} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium">{site.location}</p>
                    <p className="text-xs text-muted-foreground">{site.cameraCount} cameras</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={site.totalIncidents > 5 ? "destructive" : site.totalIncidents > 0 ? "secondary" : "outline"}>
                    {site.totalIncidents} incidents
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">{site.averageUptime.toFixed(1)}% uptime</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
