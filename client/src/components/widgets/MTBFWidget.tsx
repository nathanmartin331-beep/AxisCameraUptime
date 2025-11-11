import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "./MetricCard";
import { TrendingUp } from "lucide-react";

interface MTBFWidgetProps {
  timeWindow?: number; // days
}

export function MTBFWidget({ timeWindow = 30 }: MTBFWidgetProps) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['/api/metrics/network', timeWindow],
    refetchInterval: 60000,
  });

  const mtbf = (metrics as any)?.mtbf || 0;
  const formattedMTBF = mtbf >= 24 
    ? `${(mtbf / 24).toFixed(1)}d` 
    : `${Math.round(mtbf)}h`;

  return (
    <MetricCard
      title="Mean Time Between Failures"
      value={formattedMTBF}
      subtitle={`Average uptime duration (${timeWindow}d)`}
      icon={TrendingUp}
      isLoading={isLoading}
    />
  );
}
