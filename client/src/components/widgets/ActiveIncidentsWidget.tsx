import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

interface Camera {
  id: string;
  name: string;
  ipAddress: string;
  location: string | null;
  currentStatus: string;
}

export function ActiveIncidentsWidget() {
  const { data: cameras, isLoading } = useQuery<Camera[]>({
    queryKey: ['/api/cameras'],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const offlineCameras = (cameras || []).filter(c => c.currentStatus === 'offline');

  return (
    <Card className="h-full overflow-auto">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Active Incidents
        </CardTitle>
        <Badge variant={offlineCameras.length > 0 ? "destructive" : "secondary"}>
          {offlineCameras.length}
        </Badge>
      </CardHeader>
      <CardContent>
        {offlineCameras.length === 0 ? (
          <p className="text-xs text-muted-foreground">All cameras are online</p>
        ) : (
          <div className="space-y-2">
            {offlineCameras.map((camera) => (
              <div key={camera.id} className="flex items-center justify-between p-2 rounded-md bg-red-50 dark:bg-red-950/20">
                <div>
                  <p className="text-sm font-medium">{camera.name}</p>
                  <p className="text-xs text-muted-foreground">{camera.ipAddress}</p>
                </div>
                {camera.location && (
                  <span className="text-xs text-muted-foreground">{camera.location}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
