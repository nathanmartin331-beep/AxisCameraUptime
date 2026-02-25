import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";

interface GroupDailyTrendsChartProps {
  dailyTotals: Array<{ date: string; total: number }>;
  eventType: string;
  groupColor: string;
}

export default function GroupDailyTrendsChart({ dailyTotals, eventType, groupColor }: GroupDailyTrendsChartProps) {
  if (!dailyTotals || dailyTotals.length === 0) return null;

  const chartData = dailyTotals.map(d => ({
    date: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    total: d.total,
  }));

  const description = eventType === "occupancy" ? "Daily occupancy peaks"
    : eventType === "line_crossing" ? "Daily line crossings"
    : eventType === "people_in" ? "Daily people entering"
    : `Daily ${eventType} totals`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Daily Totals
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number) => [value.toLocaleString(), "Total"]}
            />
            <Bar dataKey="total" fill={groupColor} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
