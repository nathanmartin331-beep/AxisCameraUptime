import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type CameraStatus = "online" | "offline" | "warning" | "unknown";

interface StatusIndicatorProps {
  status: CameraStatus;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function StatusIndicator({ 
  status, 
  showLabel = false,
  size = "md" 
}: StatusIndicatorProps) {
  const statusConfig = {
    online: {
      color: "text-status-online",
      label: "Online",
      bg: "bg-status-online"
    },
    offline: {
      color: "text-status-offline",
      label: "Offline",
      bg: "bg-status-offline"
    },
    warning: {
      color: "text-status-away",
      label: "Warning",
      bg: "bg-status-away"
    },
    unknown: {
      color: "text-muted-foreground",
      label: "Unknown",
      bg: "bg-muted-foreground"
    }
  };

  const sizeConfig = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4"
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2" data-testid={`status-${status}`}>
      <div className={cn("rounded-full", config.bg, sizeConfig[size])} />
      {showLabel && (
        <span className="text-sm font-medium">{config.label}</span>
      )}
    </div>
  );
}
