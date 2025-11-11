import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
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

  // Analytics
  analytics?: {
    motionDetection: boolean;
    tampering: boolean;
    objectDetection: boolean;
    peopleCount: boolean;
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
