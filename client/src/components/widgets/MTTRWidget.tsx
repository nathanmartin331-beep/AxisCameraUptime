import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "./MetricCard";
import { Clock } from "lucide-react";

interface MTTRWidgetProps {
  timeWindow?: number; // days
}

export function MTTRWidget({ timeWindow = 30 }: MTTRWidgetProps) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['/api/metrics/network', timeWindow],
    refetchInterval: 60000, // Refresh every minute
  });

  const mttr = (metrics as any)?.mttr || 0;
  const formattedMTTR = mttr >= 60 
    ? `${(mttr / 60).toFixed(1)}h` 
    : `${Math.round(mttr)}m`;

  return (
    <MetricCard
      title="Mean Time to Recovery"
      value={formattedMTTR}
      subtitle={`Average recovery time (${timeWindow}d)`}
      icon={Clock}
      isLoading={isLoading}
    />
  );
}
