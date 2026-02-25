import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

interface UptimeData {
  cameraId: string;
  uptime: number;
}

const BUCKETS = [
  { label: "<90%", min: 0, max: 90, color: "#E30613" },
  { label: "90-95%", min: 90, max: 95, color: "#C2185B" },
  { label: "95-99%", min: 95, max: 99, color: "#AD1457" },
  { label: "99-99.9%", min: 99, max: 99.9, color: "#880E4F" },
  { label: ">99.9%", min: 99.9, max: 101, color: "#4A1C2A" },
];

export function UptimeDistributionWidget() {
  const { data: uptimeData, isLoading } = useQuery<UptimeData[]>({
    queryKey: ['/api/cameras/uptime/batch'],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Uptime Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const cameras = uptimeData || [];
  const chartData = BUCKETS.map(bucket => ({
    range: bucket.label,
    count: cameras.filter(c => c.uptime >= bucket.min && c.uptime < bucket.max).length,
    color: bucket.color,
  }));

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PieChart className="h-4 w-4" />
          Uptime Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-3.5rem)]">
        {cameras.length === 0 ? (
          <p className="text-xs text-muted-foreground">No camera data available</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [`${value} cameras`, 'Count']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
