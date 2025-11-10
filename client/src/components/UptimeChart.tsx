import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface UptimeDataPoint {
  date: string;
  uptime: number;
}

interface UptimeChartProps {
  cameraId?: string;
  days?: number;
  title?: string;
  description?: string;
}

export default function UptimeChart({ 
  cameraId = "all",
  days = 30,
  title = "Uptime Trend",
  description = "System availability over time"
}: UptimeChartProps) {
  const [selectedDays, setSelectedDays] = useState(days);

  const { data: eventData, isLoading } = useQuery<any>({
    queryKey: cameraId === "all" 
      ? ["/api/uptime/events", selectedDays]
      : ["/api/cameras", cameraId, "events", selectedDays],
    queryFn: async () => {
      const url = cameraId === "all"
        ? `/api/uptime/events?days=${selectedDays}`
        : `/api/cameras/${cameraId}/events?days=${selectedDays}`;
      
      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.statusText}`);
      }

      return response.json();
    },
    enabled: true,
  });

  const events = eventData?.events || [];
  const priorEvent = eventData?.priorEvent || (eventData?.priorEvents && eventData.priorEvents[0]) || null;
  
  const uptimeData: UptimeDataPoint[] = generateUptimeData(events, selectedDays, priorEvent);

  function generateUptimeData(events: any[], days: number, initialPriorEvent?: any): UptimeDataPoint[] {
    const data: UptimeDataPoint[] = [];
    const now = new Date();
    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const dayEvents = sortedEvents.filter(e => {
        const eventDate = new Date(e.timestamp);
        return eventDate >= date && eventDate < nextDate;
      });

      const priorEvent = sortedEvents.filter(e => 
        new Date(e.timestamp).getTime() < date.getTime()
      ).pop() || (i === days - 1 ? initialPriorEvent : undefined);
      
      const uptime = calculateDayUptime(dayEvents, date, nextDate, priorEvent);
      
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        uptime: parseFloat(uptime.toFixed(1))
      });
    }
    
    return data;
  }

  function calculateDayUptime(dayEvents: any[], startDate: Date, endDate: Date, priorEvent?: any): number {
    let totalUptime = 0;
    const now = new Date();
    const dayEnd = endDate.getTime() > now.getTime() ? now.getTime() : endDate.getTime();
    const dayStart = startDate.getTime();

    const sortedEvents = [...dayEvents].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (sortedEvents.length === 0 && priorEvent) {
      if (priorEvent.status === "online") {
        totalUptime = dayEnd - dayStart;
      }
    } else if (sortedEvents.length > 0) {
      let currentStatus = priorEvent ? priorEvent.status : "offline";
      let currentTime = dayStart;

      for (let i = 0; i < sortedEvents.length; i++) {
        const event = sortedEvents[i];
        const eventTime = Math.max(new Date(event.timestamp).getTime(), dayStart);

        if (currentStatus === "online") {
          totalUptime += Math.max(0, eventTime - currentTime);
        }

        currentStatus = event.status;
        currentTime = eventTime;
      }

      if (currentStatus === "online") {
        totalUptime += Math.max(0, dayEnd - currentTime);
      }
    } else {
      totalUptime = dayEnd - dayStart;
    }

    const actualDuration = dayEnd - dayStart;
    return actualDuration > 0 ? (totalUptime / actualDuration) * 100 : 0;
  }

  return (
    <Card data-testid="uptime-chart">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs 
          defaultValue={`${days}d`} 
          className="w-full"
          onValueChange={(value) => setSelectedDays(parseInt(value.replace('d', '')))}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="7d" data-testid="tab-7d">7 Days</TabsTrigger>
            <TabsTrigger value="30d" data-testid="tab-30d">30 Days</TabsTrigger>
            <TabsTrigger value="90d" data-testid="tab-90d">90 Days</TabsTrigger>
            <TabsTrigger value="365d" data-testid="tab-365d">365 Days</TabsTrigger>
          </TabsList>
          {["7d", "30d", "90d", "365d"].map((tabValue) => (
            <TabsContent key={tabValue} value={tabValue} className="space-y-4">
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={uptimeData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      domain={[0, 100]}
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px'
                      }}
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'Uptime']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="uptime" 
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
