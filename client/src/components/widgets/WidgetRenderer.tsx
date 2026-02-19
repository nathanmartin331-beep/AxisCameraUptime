import { MTTRWidget } from "./MTTRWidget";
import { MTBFWidget } from "./MTBFWidget";
import { NetworkUptimeWidget } from "./NetworkUptimeWidget";
import { TotalIncidentsWidget } from "./TotalIncidentsWidget";
import { GroupOccupancyWidget } from "./GroupOccupancyWidget";
import { PeopleFlowWidget } from "./PeopleFlowWidget";
import { GroupOverviewWidget } from "./GroupOverviewWidget";
import { SLAComplianceWidget } from "./SLAComplianceWidget";
import { VideoHealthWidget } from "./VideoHealthWidget";
import { IncidentLeaderboardWidget } from "./IncidentLeaderboardWidget";
import { SiteRankingsWidget } from "./SiteRankingsWidget";
import { ActiveIncidentsWidget } from "./ActiveIncidentsWidget";
import { CameraStatusWidget } from "./CameraStatusWidget";
import { MTTRTrendWidget } from "./MTTRTrendWidget";
import { UptimeDistributionWidget } from "./UptimeDistributionWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

interface WidgetRendererProps {
  type: string;
  config?: Record<string, any>;
}

export function WidgetRenderer({ type, config }: WidgetRendererProps) {
  const timeWindow = config?.timeWindow || 30;

  switch (type) {
    case 'network-uptime':
      return <NetworkUptimeWidget timeWindow={timeWindow} />;

    case 'mttr-card':
      return <MTTRWidget timeWindow={timeWindow} />;

    case 'mtbf-card':
      return <MTBFWidget timeWindow={timeWindow} />;

    case 'total-incidents':
      return <TotalIncidentsWidget timeWindow={timeWindow} />;

    // Analytics widgets
    case 'group-occupancy':
      return <GroupOccupancyWidget />;

    case 'people-flow':
      return <PeopleFlowWidget />;

    case 'group-overview':
      return <GroupOverviewWidget />;

    case 'sla-compliance':
      return <SLAComplianceWidget timeWindow={timeWindow} />;

    case 'video-health':
      return <VideoHealthWidget />;

    case 'incident-leaderboard':
      return <IncidentLeaderboardWidget timeWindow={timeWindow} />;

    case 'site-rankings':
      return <SiteRankingsWidget timeWindow={timeWindow} />;

    case 'active-incidents':
      return <ActiveIncidentsWidget />;

    case 'camera-status':
      return <CameraStatusWidget />;

    case 'mttr-trend':
      return <MTTRTrendWidget timeWindow={timeWindow} />;

    case 'uptime-distribution':
      return <UptimeDistributionWidget />;

    default:
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Unknown Widget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Widget type: {type}</p>
          </CardContent>
        </Card>
      );
  }
}
