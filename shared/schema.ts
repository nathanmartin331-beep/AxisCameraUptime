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
