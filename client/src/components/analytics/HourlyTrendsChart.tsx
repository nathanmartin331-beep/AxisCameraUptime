import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Clock } from "lucide-react";

interface HourlyAnalyticsResponse {
  hourlyTotals: Array<{ hour: string; total: number; metadata?: Record<string, any> }>;
  scenarioTotals?: Record<string, Array<{ hour: string; total: number; metadata?: Record<string, any> }>>;
}

interface HourlyTrendsChartProps {
  cameraId: string;
  hasCrossline: boolean;
}

function formatHourLabel(iso: string, range: number): string {
  const d = new Date(iso);
  if (range === 1) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
  }
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", hour12: true });
}

export default function HourlyTrendsChart({ cameraId, hasCrossline }: HourlyTrendsChartProps) {
  const [range, setRange] = useState<1 | 7 | 30>(1);
  const queryClient = useQueryClient();

  const enteringQueryKey = ["/api/cameras", cameraId, "analytics/hourly", "people_in", range];
  const exitingQueryKey = ["/api/cameras", cameraId, "analytics/hourly", "people_out", range];
  const crossingQueryKey = ["/api/cameras", cameraId, "analytics/hourly", "line_crossing", range];

  const { data: hourlyEntering } = useQuery<HourlyAnalyticsResponse>({
    queryKey: enteringQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics/hourly?eventType=people_in&days=${range}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!hasCrossline,
    refetchInterval: 60_000,
  });

  const { data: hourlyExiting } = useQuery<HourlyAnalyticsResponse>({
    queryKey: exitingQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics/hourly?eventType=people_out&days=${range}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!hasCrossline,
    refetchInterval: 60_000,
  });

  const { data: hourlyLineCrossing } = useQuery<HourlyAnalyticsResponse>({
    queryKey: crossingQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics/hourly?eventType=line_crossing&days=${range}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!hasCrossline,
    refetchInterval: 60_000,
  });

  // Subscribe to SSE hourly_rollup events for this camera; refetch on each close.
  useEffect(() => {
    if (!cameraId) return;
    const es = new EventSource(`/api/cameras/${cameraId}/analytics/stream`, { withCredentials: true });
    const onRollup = () => {
      queryClient.invalidateQueries({ queryKey: enteringQueryKey });
      queryClient.invalidateQueries({ queryKey: exitingQueryKey });
      queryClient.invalidateQueries({ queryKey: crossingQueryKey });
    };
    es.addEventListener("hourly_rollup", onRollup);
    return () => {
      es.removeEventListener("hourly_rollup", onRollup);
      es.close();
    };
  }, [cameraId, range, queryClient]);

  const hasAny =
    (hourlyEntering?.hourlyTotals?.length || 0) > 0 ||
    (hourlyExiting?.hourlyTotals?.length || 0) > 0 ||
    (hourlyLineCrossing?.hourlyTotals?.length || 0) > 0;

  const rangeTabs = (
    <Tabs value={String(range)} onValueChange={(v) => setRange(parseInt(v, 10) as 1 | 7 | 30)}>
      <TabsList className="h-8">
        <TabsTrigger value="1" className="text-xs px-2 h-6">24h</TabsTrigger>
        <TabsTrigger value="7" className="text-xs px-2 h-6">7d</TabsTrigger>
        <TabsTrigger value="30" className="text-xs px-2 h-6">30d</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (!hasAny) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Hourly Trends
              </CardTitle>
              <CardDescription>No hourly analytics data in this window.</CardDescription>
            </div>
            {rangeTabs}
          </div>
        </CardHeader>
      </Card>
    );
  }

  // Merge entering + exiting + line_crossing by hour bucket
  type Row = { hour: string; entering: number; exiting: number; crossings: number };
  const hourMap = new Map<string, Row>();
  for (const r of hourlyEntering?.hourlyTotals ?? []) {
    const e = hourMap.get(r.hour) ?? { hour: r.hour, entering: 0, exiting: 0, crossings: 0 };
    e.entering = r.total;
    hourMap.set(r.hour, e);
  }
  for (const r of hourlyExiting?.hourlyTotals ?? []) {
    const e = hourMap.get(r.hour) ?? { hour: r.hour, entering: 0, exiting: 0, crossings: 0 };
    e.exiting = r.total;
    hourMap.set(r.hour, e);
  }
  for (const r of hourlyLineCrossing?.hourlyTotals ?? []) {
    const e = hourMap.get(r.hour) ?? { hour: r.hour, entering: 0, exiting: 0, crossings: 0 };
    e.crossings = r.total;
    hourMap.set(r.hour, e);
  }

  const chartData = Array.from(hourMap.values())
    .sort((a, b) => a.hour.localeCompare(b.hour))
    .map((r) => ({ ...r, label: formatHourLabel(r.hour, range) }));

  const hasEnterExit = chartData.some((r) => r.entering > 0 || r.exiting > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Hourly Trends
            </CardTitle>
            <CardDescription>
              Per-hour totals — live-refreshed on the hourly rollup ({chartData.length} hour{chartData.length === 1 ? "" : "s"})
            </CardDescription>
          </div>
          {rangeTabs}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
              formatter={(value: number, name: string) => [value.toLocaleString(), name]}
            />
            <Legend />
            {hasEnterExit ? (
              <>
                <Bar dataKey="entering" name="Entering" fill="#E30613" radius={[4, 4, 0, 0]} />
                <Bar dataKey="exiting" name="Exiting" fill="#374151" radius={[4, 4, 0, 0]} />
              </>
            ) : (
              <Bar dataKey="crossings" name="Crossings" fill="#C2185B" radius={[4, 4, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
