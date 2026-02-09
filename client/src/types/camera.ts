import type { CameraStatus } from "@/components/StatusIndicator";

/**
 * Extended Camera interface with model detection information
 */
export interface Camera {
  id: string;
  name: string;
  ipAddress: string;
  location: string;
  status: CameraStatus;
  videoStatus?: string;
  uptime: string;
  lastSeen: string;

  // Model Detection Fields
  model?: string;
  series?: 'P' | 'Q' | 'M' | 'F' | 'C';
  fullName?: string;
  firmwareVersion?: string;

  // Capabilities
  hasPTZ?: boolean;
  hasAudio?: boolean;
  resolution?: string;
  maxFramerate?: number;
  numberOfViews?: number;
  capabilities?: Record<string, any>;

  // Metadata
  detectedAt?: string;
}

/**
 * Series color configuration for badges
 */
export const SERIES_COLORS = {
  P: "border-blue-500 text-blue-700 bg-blue-50",
  Q: "border-green-500 text-green-700 bg-green-50",
  M: "border-purple-500 text-purple-700 bg-purple-50",
  F: "border-orange-500 text-orange-700 bg-orange-50",
  C: "border-teal-500 text-teal-700 bg-teal-50",
} as const;

/**
 * Get series color class based on series letter
 */
export function getSeriesColor(series?: 'P' | 'Q' | 'M' | 'F' | 'C'): string {
  return series ? SERIES_COLORS[series] : "";
}
