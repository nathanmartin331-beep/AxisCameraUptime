import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "./MetricCard";
import { Activity } from "lucide-react";

interface NetworkUptimeWidgetProps {
  timeWindow?: number; // days
}

export function NetworkUptimeWidget({ timeWindow = 30 }: NetworkUptimeWidgetProps) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['/api/metrics/network', timeWindow],
    refetchInterval: 60000,
  });

  const uptime = (metrics as any)?.averageUptime || 0;

  return (
    <MetricCard
      title="Network Uptime"
      value={`${uptime.toFixed(2)}%`}
      subtitle={`Average across all cameras (${timeWindow}d)`}
      icon={Activity}
      isLoading={isLoading}
    />
  );
}
