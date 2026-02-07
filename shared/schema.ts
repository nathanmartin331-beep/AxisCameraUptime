import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Helper function to generate UUIDs for SQLite
const generateId = () => crypto.randomUUID();

// Session storage table for Replit Auth
// Reference: blueprint:javascript_log_in_with_replit
export const sessions = sqliteTable(
  "sessions",
  {
    sid: text("sid").primaryKey(),
    sess: text("sess", { mode: "json" }).notNull().$type<any>(),
    expire: integer("expire", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  })
);

// User storage table for local authentication
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(generateId),
  email: text("email").unique().notNull(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

/**
 * Camera capabilities interface
 * Stores detailed capability information for model-aware features
 */
export interface CameraCapabilities {
  // Video
  resolution?: string;           // "1920x1080"
  maxFramerate?: number;         // 60
  supportedFormats?: string[];   // ["jpeg", "mjpeg", "h264", "h265"]

  // PTZ (Q-series)
  ptz?: {
    enabled: boolean;
    panRange?: { min: number; max: number };
    tiltRange?: { min: number; max: number };
    zoomRange?: { min: number; max: number };
    presets?: boolean;
    autoTracking?: boolean;
  };

  // Audio
  audio?: {
    enabled: boolean;
    channels: number;
    formats?: string[];          // ["aac", "g711", "opus"]
  };

  // Multi-Sensor (M-series)
  multiSensor?: {
    enabled: boolean;
    sensorCount: number;
    channelIds: number[];        // [1, 2, 3, 4]
    panoramic: boolean;          // Stitched view available
  };

  // Analytics (detected availability from VAPIX + ACAP probing)
  analytics?: {
    motionDetection: boolean;
    tampering: boolean;
    objectDetection: boolean;       // AXIS Object Analytics installed
    peopleCount: boolean;           // People Counter ACAP or AOA scenario
    occupancyEstimation?: boolean;  // Occupancy Estimator ACAP or AOA scenario
    lineCrossing?: boolean;         // Cross Line Detection or AOA scenario
    loiteringGuard?: boolean;       // AXIS Loitering Guard ACAP
    fenceGuard?: boolean;           // AXIS Fence Guard ACAP
    motionGuard?: boolean;          // AXIS Motion Guard ACAP
    objectAnalytics?: boolean;      // AXIS Object Analytics (AOA) master flag
    acapInstalled?: string[];       // Full list of installed ACAP names
    objectAnalyticsScenarios?: Array<{
      name: string;
      type: string;                 // "crosslinecounting", "occupancy_in_area", "object_in_area", etc.
    }>;
  };

  // User-enabled analytics (what to actively poll)
  enabledAnalytics?: {
    peopleCount?: boolean;
    occupancyEstimation?: boolean;
    lineCrossing?: boolean;
    objectAnalytics?: boolean;
    loiteringGuard?: boolean;
    fenceGuard?: boolean;
    motionGuard?: boolean;
  };

  // System
  system?: {
    architecture?: string;       // "armv7hf"
    soc?: string;               // "Artpec-7"
    edgeStorage?: boolean;
  };
}

// Cameras table - stores camera configuration and encrypted credentials
export const cameras = sqliteTable("cameras", {
  id: text("id").primaryKey().$defaultFn(generateId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ipAddress: text("ip_address").notNull(),
  username: text("username").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  location: text("location"),
  notes: text("notes"),
  currentBootId: text("current_boot_id"),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  currentStatus: text("current_status").default("unknown"),
  videoStatus: text("video_status").default("unknown"),
  lastVideoCheck: integer("last_video_check", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),

  // NEW FIELDS: Camera model information (all optional for backward compatibility)
  model: text("model"),                    // e.g., "P3255-LVE"
  series: text("series"),                  // e.g., "P", "Q", "M", "F"
  fullName: text("full_name"),             // e.g., "AXIS P3255-LVE Network Camera"

  // Firmware & Hardware
  firmwareVersion: text("firmware_version"), // e.g., "9.80.1"
  vapixVersion: text("vapix_version"),       // e.g., "3"

  // Capability Flags (boolean fields for fast queries)
  hasPTZ: integer("has_ptz", { mode: "boolean" }).default(false),
  hasAudio: integer("has_audio", { mode: "boolean" }).default(false),
  audioChannels: integer("audio_channels").default(0),
  numberOfViews: integer("number_of_views").default(1), // Multi-sensor count

  // Detailed Capabilities (JSON for extensibility)
  capabilities: text("capabilities", { mode: "json" }).$type<CameraCapabilities>(),

  // Detection Metadata
  detectedAt: integer("detected_at", { mode: "timestamp" }),
  detectionMethod: text("detection_method"), // "auto" | "manual" | "import"

  // Historical uptime backfill tracking
  lastBootAt: integer("last_boot_at", { mode: "timestamp" }),
  historyBackfilled: integer("history_backfilled", { mode: "boolean" }).default(false),
});

export const insertCameraSchema = createInsertSchema(cameras).omit({
  id: true,
  currentBootId: true,
  lastSeenAt: true,
  currentStatus: true,
  videoStatus: true,
  lastVideoCheck: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCamera = z.infer<typeof insertCameraSchema>;
export type Camera = typeof cameras.$inferSelect;

// Uptime events table - tracks all status changes and polling results
export const uptimeEvents = sqliteTable(
  "uptime_events",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    cameraId: text("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    status: text("status").notNull(),
    videoStatus: text("video_status"),
    uptimeSeconds: integer("uptime_seconds"),
    bootId: text("boot_id"),
    responseTimeMs: integer("response_time_ms"),
    errorMessage: text("error_message"),
    isSynthetic: integer("is_synthetic", { mode: "boolean" }).default(false),
  },
  (table) => ({
    cameraTimestampIdx: index("idx_uptime_events_camera_timestamp").on(
      table.cameraId,
      table.timestamp
    ),
  })
);

export const insertUptimeEventSchema = createInsertSchema(uptimeEvents).omit({
  id: true,
});

export type InsertUptimeEvent = z.infer<typeof insertUptimeEventSchema>;
export type UptimeEvent = typeof uptimeEvents.$inferSelect;

// Dashboard layouts - stores user's widget configuration and positions
export const dashboardLayouts = sqliteTable("dashboard_layouts", {
  id: text("id").primaryKey().$defaultFn(generateId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  layout: text("layout", { mode: "json" }).notNull().$type<{
    widgets: Array<{
      id: string;
      type: string;
      x: number;
      y: number;
      w: number;
      h: number;
      config?: Record<string, any>;
    }>;
  }>(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const insertDashboardLayoutSchema = createInsertSchema(dashboardLayouts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDashboardLayout = z.infer<typeof insertDashboardLayoutSchema>;
export type DashboardLayout = typeof dashboardLayouts.$inferSelect;

// Camera groups - allows grouping cameras by area/zone for aggregated analytics
export const cameraGroups = sqliteTable("camera_groups", {
  id: text("id").primaryKey().$defaultFn(generateId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"), // hex color for UI badges, e.g., "#3B82F6"
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const insertCameraGroupSchema = createInsertSchema(cameraGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCameraGroup = z.infer<typeof insertCameraGroupSchema>;
export type CameraGroup = typeof cameraGroups.$inferSelect;

// Camera group members - many-to-many (camera can be in multiple groups)
export const cameraGroupMembers = sqliteTable(
  "camera_group_members",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    groupId: text("group_id")
      .notNull()
      .references(() => cameraGroups.id, { onDelete: "cascade" }),
    cameraId: text("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    addedAt: integer("added_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueMembership: uniqueIndex("idx_group_camera_unique").on(table.groupId, table.cameraId),
  })
);

export const insertCameraGroupMemberSchema = createInsertSchema(cameraGroupMembers).omit({
  id: true,
  addedAt: true,
});

export type InsertCameraGroupMember = z.infer<typeof insertCameraGroupMemberSchema>;
export type CameraGroupMember = typeof cameraGroupMembers.$inferSelect;

// Analytics events - raw per-poll data points from VAPIX analytics APIs
export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    cameraId: text("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    eventType: text("event_type").notNull(), // "people_in", "people_out", "occupancy", "line_crossing"
    value: integer("value").notNull(), // count value
    metadata: text("metadata", { mode: "json" }).$type<Record<string, any>>(), // channel, scenario name, etc.
  },
  (table) => ({
    cameraTimestampIdx: index("idx_analytics_camera_timestamp").on(
      table.cameraId,
      table.timestamp
    ),
    eventTypeIdx: index("idx_analytics_event_type").on(
      table.cameraId,
      table.eventType,
      table.timestamp
    ),
  })
);

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents).omit({
  id: true,
});

export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
