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
  role: text("role").default("viewer").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "viewer"]).optional().default("viewer"),
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
    objectAnalyticsApiPath?: string; // Discovered working API path for AOA (e.g., "/local/objectanalytics/.api")
    acapInstalled?: string[];       // Full list of installed ACAP names
    objectAnalyticsScenarios?: Array<{
      name: string;
      type: string;                 // "crosslinecounting", "occupancy_in_area", "object_in_area", etc.
      id?: number;                  // Scenario ID from AOA configuration
      objectClassifications?: string[]; // Object classes: "Human", "Vehicle", etc.
    }>;
    tvpcAvailable?: boolean;           // AXIS TVPC (Total/Visitor People Counter) app detected
    tvpcHistoryBackfilled?: boolean;   // TVPC hourly history has been imported
    tvpcCounterConfig?: { serial?: string; name?: string }; // TVPC counter identity
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
    tvpc?: boolean;
  };

  // System
  system?: {
    architecture?: string;       // "armv7hf"
    soc?: string;               // "Artpec-7"
    edgeStorage?: boolean;
    serialNumber?: string;       // "ACCC8E6AB0E1"
    hardwareId?: string;         // "1A3"
    buildDate?: string;          // "2023-01-01"
  };
}

// Cameras table - stores camera configuration and encrypted credentials
export const cameras = sqliteTable(
  "cameras",
  {
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

    // SSL/TLS connection settings
    protocol: text("protocol").default("http"),        // "http" or "https"
    port: integer("port").default(80),                 // 80 for HTTP, 443 for HTTPS, or custom
    verifySslCert: integer("verify_ssl_cert", { mode: "boolean" }).default(false), // Accept self-signed by default

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

    // SSL/TLS certificate pinning (TOFU — Trust On First Use)
    sslFingerprint: text("ssl_fingerprint"),                     // SHA-256 of server cert (hex)
    sslFingerprintFirstSeen: integer("ssl_fingerprint_first_seen", { mode: "timestamp" }),
    sslFingerprintLastVerified: integer("ssl_fingerprint_last_verified", { mode: "timestamp" }),

    // Historical uptime backfill tracking
    lastBootAt: integer("last_boot_at", { mode: "timestamp" }),
    historyBackfilled: integer("history_backfilled", { mode: "boolean" }).default(false),
  },
  (table) => ({
    userIdIdx: index("idx_cameras_user_id").on(table.userId),
  })
);

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
export const cameraGroups = sqliteTable(
  "camera_groups",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"), // hex color for UI badges, e.g., "#3B82F6"
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("idx_camera_groups_user_id").on(table.userId),
  })
);

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
    cameraIdIdx: index("idx_camera_group_members_camera_id").on(table.cameraId),
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

// ===== Aggregation Summary Tables (for 2500+ camera scale) =====

// Hourly uptime rollup — one row per camera per hour
export const uptimeHourlySummary = sqliteTable(
  "uptime_hourly_summary",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    cameraId: text("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    hourStart: integer("hour_start", { mode: "timestamp" }).notNull(),
    onlineCount: integer("online_count").notNull().default(0),
    offlineCount: integer("offline_count").notNull().default(0),
    totalChecks: integer("total_checks").notNull().default(0),
    avgResponseTimeMs: integer("avg_response_time_ms"),
    uptimePercentage: integer("uptime_percentage"), // stored as 0-10000 (2 decimal places × 100)
  },
  (table) => ({
    uniqueHour: uniqueIndex("idx_uptime_hourly_camera_hour").on(table.cameraId, table.hourStart),
  })
);

export type UptimeHourlySummary = typeof uptimeHourlySummary.$inferSelect;

// Daily uptime rollup — one row per camera per day
export const uptimeDailySummary = sqliteTable(
  "uptime_daily_summary",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    cameraId: text("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    dayStart: integer("day_start", { mode: "timestamp" }).notNull(),
    onlineCount: integer("online_count").notNull().default(0),
    offlineCount: integer("offline_count").notNull().default(0),
    totalChecks: integer("total_checks").notNull().default(0),
    avgResponseTimeMs: integer("avg_response_time_ms"),
    uptimePercentage: integer("uptime_percentage"),
  },
  (table) => ({
    uniqueDay: uniqueIndex("idx_uptime_daily_camera_day").on(table.cameraId, table.dayStart),
  })
);

export type UptimeDailySummary = typeof uptimeDailySummary.$inferSelect;

// Hourly analytics rollup — one row per camera per event type per scenario per hour
export const analyticsHourlySummary = sqliteTable(
  "analytics_hourly_summary",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    cameraId: text("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    hourStart: integer("hour_start", { mode: "timestamp" }).notNull(),
    eventType: text("event_type").notNull(),
    scenario: text("scenario").notNull().default("default"),
    sumValue: integer("sum_value").notNull().default(0),
    avgValue: integer("avg_value"),
    maxValue: integer("max_value"),
    minValue: integer("min_value"),
    sampleCount: integer("sample_count").notNull().default(0),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, any>>(), // vehicle breakdown from max-value row
  },
  (table) => ({
    uniqueHourScenario: uniqueIndex("idx_analytics_hourly_camera_type_scenario_hour").on(table.cameraId, table.eventType, table.scenario, table.hourStart),
  })
);

export type AnalyticsHourlySummary = typeof analyticsHourlySummary.$inferSelect;

// Daily analytics rollup — one row per camera per event type per scenario per day
export const analyticsDailySummary = sqliteTable(
  "analytics_daily_summary",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    cameraId: text("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    dayStart: integer("day_start", { mode: "timestamp" }).notNull(),
    eventType: text("event_type").notNull(),
    scenario: text("scenario").notNull().default("default"),
    sumValue: integer("sum_value").notNull().default(0),
    avgValue: integer("avg_value"),
    maxValue: integer("max_value"),
    minValue: integer("min_value"),
    sampleCount: integer("sample_count").notNull().default(0),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, any>>(), // vehicle breakdown from max-value row
  },
  (table) => ({
    uniqueDayScenario: uniqueIndex("idx_analytics_daily_camera_type_scenario_day").on(table.cameraId, table.eventType, table.scenario, table.dayStart),
  })
);

export type AnalyticsDailySummary = typeof analyticsDailySummary.$inferSelect;

// User settings - per-user application preferences
export const userSettings = sqliteTable("user_settings", {
  id: text("id").primaryKey().$defaultFn(generateId),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  pollingInterval: integer("polling_interval").default(5),
  dataRetentionDays: integer("data_retention_days").default(90),
  emailNotifications: integer("email_notifications", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
