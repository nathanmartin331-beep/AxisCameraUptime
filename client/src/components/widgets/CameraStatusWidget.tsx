import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera } from "lucide-react";

export function CameraStatusWidget() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['/api/dashboard/summary'],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Camera Status</CardTitle>
          <Camera className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const total = (summary as any)?.totalCameras || 0;
  const online = (summary as any)?.onlineCameras || 0;
  const offline = (summary as any)?.offlineCameras || 0;
  const unknown = (summary as any)?.unknownCameras || 0;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Camera Status Overview</CardTitle>
        <Camera className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{online}</div>
            <p className="text-xs text-muted-foreground">Online</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{offline}</div>
            <p className="text-xs text-muted-foreground">Offline</p>
          </div>
          {unknown > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{unknown}</div>
              <p className="text-xs text-muted-foreground">Unknown</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
