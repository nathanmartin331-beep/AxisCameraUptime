import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BarChart3, Users, ArrowDownToLine, ArrowUpFromLine, GitBranchPlus } from "lucide-react";
import { AnalyticsCard, SCENARIO_COLORS } from "./LiveAnalyticsCard";
import DailyTrendsChart from "./DailyTrendsChart";

interface AnalyticsResponse {
  latest: { eventType: string; value: number; timestamp: string; metadata?: Record<string, any> } | null;
  scenarios?: Array<{ scenario: string; value: number; metadata?: Record<string, any> | null }>;
  total?: number | null;
  events: Array<{ eventType: string; value: number; timestamp: string; metadata?: Record<string, any> }>;
}

interface DailyAnalyticsResponse {
  dailyTotals: Array<{ date: string; total: number; metadata?: Record<string, any> }>;
  scenarioTotals?: Record<string, Array<{ date: string; total: number; metadata?: Record<string, any> }>>;
}

type AnalyticsCardKey = "occupancy" | "entering" | "exiting" | "lineCrossing";

const ANALYTICS_VISIBILITY_KEY = "analytics-card-visibility";

function getDefaultVisibility(): Record<AnalyticsCardKey, boolean> {
  return { occupancy: true, entering: true, exiting: true, lineCrossing: true };
}

function loadVisibility(): Record<AnalyticsCardKey, boolean> {
  try {
    const stored = localStorage.getItem(ANALYTICS_VISIBILITY_KEY);
    if (stored) return { ...getDefaultVisibility(), ...JSON.parse(stored) };
  } catch {}
  return getDefaultVisibility();
}

interface DataProvenance {
  historyBackfilled?: boolean;
  tvpcBackfilled?: boolean;
  earliestDataDate?: string;
}

interface AnalyticsSectionProps {
  cameraId: string;
  hasOccupancy: boolean;
  hasCrossline: boolean;
  dataProvenance?: DataProvenance;
}

export default function AnalyticsSection({ cameraId, hasOccupancy, hasCrossline, dataProvenance }: AnalyticsSectionProps) {
  const [cardVisibility, setCardVisibility] = useState<Record<AnalyticsCardKey, boolean>>(loadVisibility);
  const [trendDays, setTrendDays] = useState(7);

  const toggleCard = useCallback((key: AnalyticsCardKey) => {
    setCardVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(ANALYTICS_VISIBILITY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const { data: analyticsData } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics"],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics?days=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: !!hasOccupancy,
    refetchInterval: 15000,
  });

  const { data: peopleInData } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics-in"],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics?eventType=people_in&days=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!hasCrossline,
    refetchInterval: 15000,
  });

  const { data: peopleOutData } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics-out"],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics?eventType=people_out&days=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!hasCrossline,
    refetchInterval: 15000,
  });

  const { data: lineCrossingData } = useQuery<AnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics-lc"],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics?eventType=line_crossing&days=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!hasCrossline,
    refetchInterval: 15000,
  });

  const { data: dailyEntering } = useQuery<DailyAnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics/daily", "people_in", trendDays],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics/daily?eventType=people_in&days=${trendDays}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!hasCrossline,
    refetchInterval: 60000,
  });

  const { data: dailyExiting } = useQuery<DailyAnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics/daily", "people_out", trendDays],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics/daily?eventType=people_out&days=${trendDays}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!hasCrossline,
    refetchInterval: 60000,
  });

  const { data: dailyLineCrossing } = useQuery<DailyAnalyticsResponse>({
    queryKey: ["/api/cameras", cameraId, "analytics/daily", "line_crossing", trendDays],
    queryFn: async () => {
      const res = await fetch(`/api/cameras/${cameraId}/analytics/daily?eventType=line_crossing&days=${trendDays}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!hasCrossline,
    refetchInterval: 60000,
  });

  const hasLiveData = analyticsData?.latest || peopleInData?.latest || peopleOutData?.latest || lineCrossingData?.latest;

  return (
    <>
      {hasLiveData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Live Analytics
                </CardTitle>
                <CardDescription>
                  Real-time analytics data from this camera (last 24h)
                  {dataProvenance?.earliestDataDate && (
                    <span className="block text-xs text-muted-foreground mt-1">
                      Data available since {new Date(dataProvenance.earliestDataDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {analyticsData?.latest && (
                  <div className="flex items-center gap-1.5">
                    <Switch id="toggle-occupancy" checked={cardVisibility.occupancy} onCheckedChange={() => toggleCard("occupancy")} className="scale-75" />
                    <Label htmlFor="toggle-occupancy" className="text-xs text-muted-foreground cursor-pointer">Occupancy</Label>
                  </div>
                )}
                {lineCrossingData?.latest ? (
                  <div className="flex items-center gap-1.5">
                    <Switch id="toggle-linecrossing" checked={cardVisibility.lineCrossing} onCheckedChange={() => toggleCard("lineCrossing")} className="scale-75" />
                    <Label htmlFor="toggle-linecrossing" className="text-xs text-muted-foreground cursor-pointer">Crossings</Label>
                  </div>
                ) : (
                  <>
                    {peopleInData?.latest && (
                      <div className="flex items-center gap-1.5">
                        <Switch id="toggle-entering" checked={cardVisibility.entering} onCheckedChange={() => toggleCard("entering")} className="scale-75" />
                        <Label htmlFor="toggle-entering" className="text-xs text-muted-foreground cursor-pointer">Entering</Label>
                      </div>
                    )}
                    {peopleOutData?.latest && (
                      <div className="flex items-center gap-1.5">
                        <Switch id="toggle-exiting" checked={cardVisibility.exiting} onCheckedChange={() => toggleCard("exiting")} className="scale-75" />
                        <Label htmlFor="toggle-exiting" className="text-xs text-muted-foreground cursor-pointer">Exiting</Label>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Occupancy */}
              {analyticsData?.latest && cardVisibility.occupancy && (() => {
                const scenarios = analyticsData.scenarios;
                const hasMultiple = scenarios && scenarios.length > 1;
                return (
                  <>
                    {hasMultiple && scenarios!.map((s, i) => {
                      const c = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
                      return (
                        <AnalyticsCard
                          key={`occ-${i}`}
                          icon={Users}
                          iconColor={c.text}
                          label="Occupancy"
                          subtitle={s.scenario}
                          value={s.value}
                          timestamp={analyticsData.latest!.timestamp}
                          valueColor={c.text}
                          accentColor={c.hex}
                        />
                      );
                    })}
                    <AnalyticsCard
                      icon={Users}
                      iconColor="text-muted-foreground"
                      label={hasMultiple ? "Occupancy" : "Current Occupancy"}
                      subtitle={hasMultiple ? "Total" : (scenarios?.[0]?.scenario)}
                      value={analyticsData.total ?? analyticsData.latest.value}
                      timestamp={analyticsData.latest.timestamp}
                    />
                  </>
                );
              })()}

              {/* Entering/Exiting — only when no line_crossing data */}
              {!lineCrossingData?.latest && peopleInData?.latest && cardVisibility.entering && (
                <AnalyticsCard
                  icon={ArrowDownToLine}
                  iconColor="text-green-600"
                  label="Entering"
                  value={peopleInData.total ?? peopleInData.latest.value}
                  timestamp={peopleInData.latest.timestamp}
                  valueColor="text-green-600"
                  metadata={peopleInData.latest.metadata ?? undefined}
                  showVehicles
                />
              )}
              {!lineCrossingData?.latest && peopleOutData?.latest && cardVisibility.exiting && (
                <AnalyticsCard
                  icon={ArrowUpFromLine}
                  iconColor="text-red-600"
                  label="Exiting"
                  value={peopleOutData.total ?? peopleOutData.latest.value}
                  timestamp={peopleOutData.latest.timestamp}
                  valueColor="text-red-600"
                  metadata={peopleOutData.latest.metadata ?? undefined}
                  showVehicles
                />
              )}

              {/* Line Crossings */}
              {lineCrossingData?.latest && cardVisibility.lineCrossing && (() => {
                const scenarios = lineCrossingData.scenarios;
                const hasMultiple = scenarios && scenarios.length > 1;
                return (
                  <>
                    {hasMultiple && scenarios!.map((s, i) => {
                      const c = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
                      return (
                        <AnalyticsCard
                          key={`lc-${i}`}
                          icon={GitBranchPlus}
                          iconColor={c.text}
                          label={s.scenario}
                          value={s.value}
                          timestamp={lineCrossingData.latest!.timestamp}
                          valueColor={c.text}
                          accentColor={c.hex}
                          metadata={s.metadata ?? undefined}
                          showVehicles
                          showLineCrossingBreakdown
                        />
                      );
                    })}
                    <AnalyticsCard
                      icon={GitBranchPlus}
                      iconColor="text-purple-600"
                      label={hasMultiple ? "Total Crossings" : "Line Crossings"}
                      subtitle={!hasMultiple ? (scenarios?.[0]?.scenario) : undefined}
                      value={lineCrossingData.total ?? lineCrossingData.latest.value}
                      timestamp={lineCrossingData.latest.timestamp}
                      valueColor="text-purple-600"
                      metadata={hasMultiple ? undefined : (scenarios?.[0]?.metadata ?? undefined)}
                      showVehicles={!hasMultiple}
                      showLineCrossingBreakdown={!hasMultiple}
                    />
                  </>
                );
              })()}
            </div>

            {analyticsData?.events && analyticsData.events.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <Badge variant="secondary">
                  {analyticsData.events.length} data points collected in last 24h
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <DailyTrendsChart
        dailyEntering={dailyEntering}
        dailyExiting={dailyExiting}
        dailyLineCrossing={dailyLineCrossing}
        trendDays={trendDays}
        onTrendDaysChange={setTrendDays}
      />
    </>
  );
}
