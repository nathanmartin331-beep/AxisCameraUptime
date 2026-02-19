import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export function MTTRTrendWidget({ timeWindow = 30 }: { timeWindow?: number }) {
  // Fetch metrics for 4 weekly windows to build a trend
  const { data: week1, isLoading: l1 } = useQuery({
    queryKey: ['/api/metrics/network', 7],
    refetchInterval: 120000,
  });
  const { data: week2, isLoading: l2 } = useQuery({
    queryKey: ['/api/metrics/network', 14],
    refetchInterval: 120000,
  });
  const { data: week3, isLoading: l3 } = useQuery({
    queryKey: ['/api/metrics/network', 21],
    refetchInterval: 120000,
  });
  const { data: week4, isLoading: l4 } = useQuery({
    queryKey: ['/api/metrics/network', 30],
    refetchInterval: 120000,
  });

  const isLoading = l1 || l2 || l3 || l4;

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">MTTR Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = [
    { period: "0-7d", mttr: (week1 as any)?.averageMttr ?? 0 },
    { period: "0-14d", mttr: (week2 as any)?.averageMttr ?? 0 },
    { period: "0-21d", mttr: (week3 as any)?.averageMttr ?? 0 },
    { period: "0-30d", mttr: (week4 as any)?.averageMttr ?? 0 },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <LineChart className="h-4 w-4" />
          MTTR Trend (minutes)
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-3.5rem)]">
        {chartData.every(d => d.mttr === 0) ? (
          <p className="text-xs text-muted-foreground">No incident data available</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(1)} min`, 'Avg MTTR']}
              />
              <Bar dataKey="mttr" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
