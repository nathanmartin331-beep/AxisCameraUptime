import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp } from "lucide-react";
import { SCENARIO_COLORS } from "./LiveAnalyticsCard";

interface DailyAnalyticsResponse {
  dailyTotals: Array<{ date: string; total: number; metadata?: Record<string, any> }>;
  scenarioTotals?: Record<string, Array<{ date: string; total: number; metadata?: Record<string, any> }>>;
}

interface DailyTrendsChartProps {
  dailyEntering?: DailyAnalyticsResponse;
  dailyExiting?: DailyAnalyticsResponse;
  dailyLineCrossing?: DailyAnalyticsResponse;
  trendDays: number;
  onTrendDaysChange: (days: number) => void;
}

export default function DailyTrendsChart({
  dailyEntering,
  dailyExiting,
  dailyLineCrossing,
  trendDays,
  onTrendDaysChange,
}: DailyTrendsChartProps) {
  const hasAnyData = (dailyEntering?.dailyTotals?.length || 0) > 0 ||
    (dailyExiting?.dailyTotals?.length || 0) > 0 ||
    (dailyLineCrossing?.dailyTotals?.length || 0) > 0;

  if (!hasAnyData) return null;

  const trendTabs = (
    <Tabs value={String(trendDays)} onValueChange={(v) => onTrendDaysChange(parseInt(v))}>
      <TabsList className="h-8">
        <TabsTrigger value="7" className="text-xs px-2 h-6">7d</TabsTrigger>
        <TabsTrigger value="14" className="text-xs px-2 h-6">14d</TabsTrigger>
        <TabsTrigger value="30" className="text-xs px-2 h-6">30d</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  // Priority 1: Line crossing with per-scenario breakdown
  // Only use line crossing when scenarios have actual non-zero data;
  // otherwise fall through to entering/exiting which may have real counts.
  const lcScenarios = dailyLineCrossing?.scenarioTotals;
  const lcScenarioNames = lcScenarios
    ? Object.keys(lcScenarios).filter(s => s !== "default")
    : [];
  const lcHasNonZeroData = lcScenarioNames.some(name =>
    (lcScenarios![name] || []).some(d => d.total > 0)
  );

  if (lcScenarioNames.length > 0 && lcHasNonZeroData) {
    const crossingDateMap = new Map<string, Record<string, any>>();

    for (const name of lcScenarioNames) {
      for (const d of lcScenarios![name] || []) {
        const entry = crossingDateMap.get(d.date) || { date: d.date };
        entry[name] = d.total;
        crossingDateMap.set(d.date, entry);
      }
    }

    if (lcScenarioNames.length > 1) {
      crossingDateMap.forEach((entry) => {
        let sum = 0;
        for (const name of lcScenarioNames) {
          sum += (entry[name] as number) || 0;
        }
        entry._total = sum;
      });
    }

    const crossingData = Array.from(crossingDateMap.values())
      .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      .map(d => ({
        ...d,
        date: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      }));

    if (crossingData.length === 0) return null;

    const lcLegendLabels: Record<string, string> = {};
    lcScenarioNames.forEach(name => { lcLegendLabels[name] = name; });
    if (lcScenarioNames.length > 1) lcLegendLabels._total = "Total";

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Daily Trends
              </CardTitle>
              <CardDescription>Daily line crossings per scenario</CardDescription>
            </div>
            {trendTabs}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={crossingData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  lcLegendLabels[name] || name
                ]}
              />
              <Legend formatter={(value) => lcLegendLabels[value] || value} />
              {lcScenarioNames.map((name, i) => (
                <Bar key={name} dataKey={name} fill={SCENARIO_COLORS[i % SCENARIO_COLORS.length].hex} radius={[4, 4, 0, 0]} />
              ))}
              {lcScenarioNames.length > 1 && (
                <Bar dataKey="_total" fill="#78716C" radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  // Priority 2: Entering / Exiting
  const hasDirectionalData = (dailyEntering?.dailyTotals?.length ?? 0) > 0 || (dailyExiting?.dailyTotals?.length ?? 0) > 0;

  if (hasDirectionalData) {
    const dateMap = new Map<string, Record<string, any>>();

    for (const d of dailyEntering?.dailyTotals || []) {
      const entry = dateMap.get(d.date) || { date: d.date, entering: 0, exiting: 0 };
      entry.entering = d.total;
      entry.enterMeta = d.metadata;
      dateMap.set(d.date, entry);
    }
    for (const d of dailyExiting?.dailyTotals || []) {
      const entry = dateMap.get(d.date) || { date: d.date, entering: 0, exiting: 0 };
      entry.exiting = d.total;
      entry.exitMeta = d.metadata;
      dateMap.set(d.date, entry);
    }

    const chartData = Array.from(dateMap.values())
      .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      .map(d => ({
        ...d,
        date: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      }));

    if (chartData.length === 0) return null;

    const latestDay = chartData[chartData.length - 1];
    const latestMeta = (latestDay as any).enterMeta || (latestDay as any).exitMeta;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Daily Trends
              </CardTitle>
              <CardDescription>
                Daily entering/exiting totals
                {latestMeta?.resetTime && (
                  <span className="ml-1 text-xs">
                    — reset: {new Date(latestMeta.resetTime).toLocaleString()}
                  </span>
                )}
              </CardDescription>
            </div>
            {trendTabs}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  name === "entering" ? "Entering" : "Exiting"
                ]}
              />
              <Legend formatter={(value) => value === "entering" ? "Entering" : "Exiting"} />
              <Bar dataKey="entering" fill="#E30613" radius={[4, 4, 0, 0]} />
              <Bar dataKey="exiting" fill="#374151" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  // Priority 3: Line crossings combined — only if there's actual non-zero data
  const crossingData = (dailyLineCrossing?.dailyTotals || [])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      crossings: d.total,
      date: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }));
  const crossingHasNonZero = crossingData.some(d => d.crossings > 0);

  if (crossingData.length === 0 || !crossingHasNonZero) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Daily Trends
            </CardTitle>
            <CardDescription>Daily line crossings</CardDescription>
          </div>
          {trendTabs}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={crossingData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
              formatter={(value: number) => [value.toLocaleString(), "Total Crossings"]}
            />
            <Legend formatter={() => "Total Crossings"} />
            <Bar dataKey="crossings" fill="#C2185B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
