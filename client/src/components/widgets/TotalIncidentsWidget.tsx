import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "./MetricCard";
import { AlertTriangle } from "lucide-react";

interface TotalIncidentsWidgetProps {
  timeWindow?: number; // days
}

export function TotalIncidentsWidget({ timeWindow = 30 }: TotalIncidentsWidgetProps) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['/api/metrics/network', timeWindow],
    refetchInterval: 60000,
  });

  const totalIncidents = (metrics as any)?.totalIncidents || 0;
  const activeIncidents = (metrics as any)?.activeIncidents || 0;

  return (
    <MetricCard
      title="Total Incidents"
      value={totalIncidents}
      subtitle={`${activeIncidents} currently active (${timeWindow}d)`}
      icon={AlertTriangle}
      isLoading={isLoading}
    />
  );
}
