import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "./MetricCard";
import { CheckCircle2 } from "lucide-react";

interface SLAComplianceWidgetProps {
  timeWindow?: number;
}

export function SLAComplianceWidget({ timeWindow = 30 }: SLAComplianceWidgetProps) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['/api/metrics/network', timeWindow],
    refetchInterval: 60000,
  });

  const totalIncidents = (metrics as any)?.totalIncidents || 0;
  const slaBreaches = (metrics as any)?.totalSlaBreaches || 0;
  const complianceRate = totalIncidents > 0
    ? (((totalIncidents - slaBreaches) / totalIncidents) * 100).toFixed(1)
    : "100.0";

  return (
    <MetricCard
      title="SLA Compliance"
      value={`${complianceRate}%`}
      subtitle={`${slaBreaches} breaches of ${totalIncidents} incidents (${timeWindow}d)`}
      icon={CheckCircle2}
      isLoading={isLoading}
    />
  );
}
