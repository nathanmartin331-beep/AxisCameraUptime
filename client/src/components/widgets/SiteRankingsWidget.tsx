import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";

interface SiteMetric {
  location: string;
  cameraCount: number;
  averageUptime: number;
  averageMttr: number | null;
  siteHealthScore: number;
  rank: number;
}

export function SiteRankingsWidget({ timeWindow = 30 }: { timeWindow?: number }) {
  const { data: sites, isLoading } = useQuery<SiteMetric[]>({
    queryKey: ['/api/metrics/sites', timeWindow],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Site Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const sorted = [...(sites || [])].sort((a, b) => a.rank - b.rank);

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Site Rankings ({timeWindow}d)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">No site data available</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((site) => (
              <div key={site.location} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs font-mono w-6 justify-center">
                    {site.rank}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">{site.location}</p>
                    <p className="text-xs text-muted-foreground">{site.cameraCount} cameras</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{site.siteHealthScore.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">health score</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
