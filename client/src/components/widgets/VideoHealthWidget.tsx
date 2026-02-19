import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "./MetricCard";
import { Video } from "lucide-react";

export function VideoHealthWidget() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['/api/dashboard/summary'],
    refetchInterval: 30000,
  });

  const videoOk = (summary as any)?.videoOk || 0;
  const videoFailed = (summary as any)?.videoFailed || 0;
  const total = videoOk + videoFailed;
  const compliance = total > 0 ? ((videoOk / total) * 100).toFixed(1) : "100.0";

  return (
    <MetricCard
      title="Video Health"
      value={`${compliance}%`}
      subtitle={`${videoOk} healthy, ${videoFailed} failed`}
      icon={Video}
      isLoading={isLoading}
    />
  );
}
