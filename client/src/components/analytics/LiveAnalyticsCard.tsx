import { Users, Car, Bike, Bus, Truck } from "lucide-react";

// Vehicle breakdown component for displaying category counts
export function VehicleBreakdown({ metadata }: { metadata?: Record<string, any> }) {
  if (!metadata) return null;

  const categories = [
    { key: "human", label: "People", icon: Users, color: "text-blue-600" },
    { key: "car", label: "Cars", icon: Car, color: "text-slate-600" },
    { key: "truck", label: "Trucks", icon: Truck, color: "text-orange-600" },
    { key: "bus", label: "Buses", icon: Bus, color: "text-yellow-600" },
    { key: "bike", label: "Bikes", icon: Bike, color: "text-green-600" },
    { key: "otherVehicle", label: "Other", icon: Car, color: "text-gray-500" },
  ];

  const activeCategories = categories.filter(c => metadata[c.key] && metadata[c.key] > 0);
  if (activeCategories.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-dashed">
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {activeCategories.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="flex items-center gap-1 text-xs">
            <Icon className={`h-3 w-3 ${color}`} />
            <span className={`font-medium ${color}`}>{metadata[key].toLocaleString()}</span>
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Render one analytics card (used for both per-scenario and total cards)
export function AnalyticsCard({
  icon: Icon,
  iconColor,
  label,
  subtitle,
  value,
  timestamp,
  valueColor,
  metadata,
  showVehicles,
  showLineCrossingBreakdown,
  accentColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  label: string;
  subtitle?: string;
  value: number;
  timestamp?: string;
  valueColor?: string;
  metadata?: Record<string, any>;
  showVehicles?: boolean;
  showLineCrossingBreakdown?: boolean;
  accentColor?: string;
}) {
  return (
    <div
      className="rounded-lg border p-4 text-center"
      style={accentColor ? { borderLeftWidth: "4px", borderLeftColor: accentColor } : undefined}
    >
      <div className="flex items-center justify-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      {subtitle && (
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{subtitle}</div>
      )}
      <div className={`text-3xl font-bold ${valueColor || ""}`}>
        {value.toLocaleString()}
      </div>
      {timestamp && (
        <div className="text-xs text-muted-foreground mt-1">
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      )}
      {showLineCrossingBreakdown && metadata && (metadata.in > 0 || metadata.out > 0) && (
        <div className="mt-2 pt-2 border-t border-dashed flex justify-center gap-4 text-xs">
          {metadata.in > 0 && (
            <span className="text-green-600 font-medium">{Number(metadata.in).toLocaleString()} in</span>
          )}
          {metadata.out > 0 && (
            <span className="text-red-600 font-medium">{Number(metadata.out).toLocaleString()} out</span>
          )}
        </div>
      )}
      {showVehicles && <VehicleBreakdown metadata={metadata} />}
    </div>
  );
}

// Scenario colors for per-scenario cards and chart bars
export const SCENARIO_COLORS = [
  { text: "text-blue-600",    bg: "bg-blue-50",    hex: "#2563eb" },
  { text: "text-amber-600",   bg: "bg-amber-50",   hex: "#d97706" },
  { text: "text-teal-600",    bg: "bg-teal-50",    hex: "#0d9488" },
  { text: "text-pink-600",    bg: "bg-pink-50",    hex: "#db2777" },
  { text: "text-indigo-600",  bg: "bg-indigo-50",  hex: "#4f46e5" },
  { text: "text-orange-600",  bg: "bg-orange-50",  hex: "#ea580c" },
  { text: "text-cyan-600",    bg: "bg-cyan-50",    hex: "#0891b2" },
  { text: "text-rose-600",    bg: "bg-rose-50",    hex: "#e11d48" },
];

export const SCENARIO_COLORS_LIGHT = [
  "#93c5fd", "#fcd34d", "#5eead4", "#f9a8d4",
  "#a5b4fc", "#fdba74", "#67e8f9", "#fda4af",
];
