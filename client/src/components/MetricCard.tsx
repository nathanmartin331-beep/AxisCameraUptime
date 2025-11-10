import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  accentColor?: "green" | "red" | "amber" | "blue";
}

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accentColor
}: MetricCardProps) {
  const accentColors = {
    green: "border-l-status-online",
    red: "border-l-status-busy",
    amber: "border-l-status-away",
    blue: "border-l-primary"
  };

  return (
    <Card 
      className={cn(
        "border-l-4",
        accentColor && accentColors[accentColor]
      )}
      data-testid="metric-card"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold" data-testid="metric-value">
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1" data-testid="metric-subtitle">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
