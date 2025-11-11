/**
 * Widget Catalog - Defines all available widgets for the dashboard
 */

export interface WidgetDefinition {
  id: string;
  type: string;
  name: string;
  description: string;
  icon: string;
  category: 'metrics' | 'charts' | 'lists' | 'status';
  defaultSize: {
    w: number; // grid units wide
    h: number; // grid units tall
  };
  minSize?: {
    w: number;
    h: number;
  };
  config?: Record<string, any>;
}

export const WIDGET_CATALOG: WidgetDefinition[] = [
  // Metrics Cards
  {
    id: 'network-uptime',
    type: 'network-uptime',
    name: 'Network Uptime',
    description: 'Average uptime across all cameras',
    icon: 'Activity',
    category: 'metrics',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
  },
  {
    id: 'mttr-card',
    type: 'mttr-card',
    name: 'Mean Time to Recovery (MTTR)',
    description: 'Average time to bring cameras back online',
    icon: 'Clock',
    category: 'metrics',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
  },
  {
    id: 'mtbf-card',
    type: 'mtbf-card',
    name: 'Mean Time Between Failures (MTBF)',
    description: 'Average uptime duration between failures',
    icon: 'TrendingUp',
    category: 'metrics',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
  },
  {
    id: 'total-incidents',
    type: 'total-incidents',
    name: 'Total Incidents',
    description: 'Network-wide incident count',
    icon: 'AlertTriangle',
    category: 'metrics',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
  },
  {
    id: 'sla-compliance',
    type: 'sla-compliance',
    name: 'SLA Compliance',
    description: 'Percentage of incidents resolved within SLA',
    icon: 'CheckCircle2',
    category: 'metrics',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
  },
  {
    id: 'video-health',
    type: 'video-health',
    name: 'Video Health Compliance',
    description: 'Percentage of time video streams are working',
    icon: 'Video',
    category: 'metrics',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
  },

  // Lists & Tables
  {
    id: 'incident-leaderboard',
    type: 'incident-leaderboard',
    name: 'Incident Leaderboard',
    description: 'Cameras with most failures and SLA breaches',
    icon: 'List',
    category: 'lists',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
  },
  {
    id: 'site-rankings',
    type: 'site-rankings',
    name: 'Site Rankings',
    description: 'Compare sites by reliability metrics',
    icon: 'BarChart3',
    category: 'lists',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
  },
  {
    id: 'active-incidents',
    type: 'active-incidents',
    name: 'Active Incidents',
    description: 'Currently offline cameras and duration',
    icon: 'AlertCircle',
    category: 'lists',
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 2 },
  },

  // Status Overview
  {
    id: 'camera-status',
    type: 'camera-status',
    name: 'Camera Status Overview',
    description: 'Online/offline/warning camera counts',
    icon: 'Camera',
    category: 'status',
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 6, h: 2 },
  },

  // Charts
  {
    id: 'mttr-trend',
    type: 'mttr-trend',
    name: 'MTTR Trend Chart',
    description: 'Recovery time trends over 30 days',
    icon: 'LineChart',
    category: 'charts',
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 3 },
  },
  {
    id: 'uptime-distribution',
    type: 'uptime-distribution',
    name: 'Uptime Distribution',
    description: 'Distribution of camera uptime percentages',
    icon: 'PieChart',
    category: 'charts',
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 3 },
  },
];

// Helper to create unique widget instances
export function createWidgetInstance(type: string, position?: { x: number; y: number; w: number; h: number }) {
  const definition = WIDGET_CATALOG.find((w) => w.type === type);
  if (!definition) throw new Error(`Unknown widget type: ${type}`);

  const id = `${type}-${crypto.randomUUID()}`;
  return {
    id,
    type,
    ...position || { x: 0, y: 0, ...definition.defaultSize },
  };
}

// Default layout for new users (with unique instance IDs)
export const DEFAULT_LAYOUT = [
  { id: 'camera-status-1', type: 'camera-status', x: 0, y: 0, w: 12, h: 2 },
  { id: 'network-uptime-1', type: 'network-uptime', x: 0, y: 2, w: 3, h: 2 },
  { id: 'mttr-card-1', type: 'mttr-card', x: 3, y: 2, w: 3, h: 2 },
  { id: 'mtbf-card-1', type: 'mtbf-card', x: 6, y: 2, w: 3, h: 2 },
  { id: 'total-incidents-1', type: 'total-incidents', x: 9, y: 2, w: 3, h: 2 },
  { id: 'incident-leaderboard-1', type: 'incident-leaderboard', x: 0, y: 4, w: 6, h: 4 },
  { id: 'site-rankings-1', type: 'site-rankings', x: 6, y: 4, w: 6, h: 4 },
];
