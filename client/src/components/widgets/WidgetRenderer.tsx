import { MTTRWidget } from "./MTTRWidget";
import { MTBFWidget } from "./MTBFWidget";
import { NetworkUptimeWidget } from "./NetworkUptimeWidget";
import { TotalIncidentsWidget } from "./TotalIncidentsWidget";
import { GroupOccupancyWidget } from "./GroupOccupancyWidget";
import { PeopleFlowWidget } from "./PeopleFlowWidget";
import { GroupOverviewWidget } from "./GroupOverviewWidget";
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
    case 'video-health':
    case 'incident-leaderboard':
    case 'site-rankings':
    case 'active-incidents':
    case 'camera-status':
    case 'mttr-trend':
    case 'uptime-distribution':
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Coming Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} widget
            </p>
          </CardContent>
        </Card>
      );

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
