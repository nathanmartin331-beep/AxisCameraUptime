import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface UptimeDataPoint {
  date: string;
  uptime: number;
}

interface UptimeChartProps {
  data: UptimeDataPoint[];
  title?: string;
  description?: string;
}

export default function UptimeChart({ 
  data, 
  title = "Uptime Trend",
  description = "System availability over time"
}: UptimeChartProps) {
  return (
    <Card data-testid="uptime-chart">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="30d" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="7d" data-testid="tab-7d">7 Days</TabsTrigger>
            <TabsTrigger value="30d" data-testid="tab-30d">30 Days</TabsTrigger>
            <TabsTrigger value="90d" data-testid="tab-90d">90 Days</TabsTrigger>
            <TabsTrigger value="365d" data-testid="tab-365d">365 Days</TabsTrigger>
          </TabsList>
          <TabsContent value="30d" className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
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
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
