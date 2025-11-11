import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
// Reference: blueprint:javascript_log_in_with_replit
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table for local authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: text("password").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
export const cameras = pgTable("cameras", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  username: text("username").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  location: text("location"),
  notes: text("notes"),
  protocol: varchar("protocol", { length: 5 }).notNull().default("http"),
  port: integer("port").notNull().default(80),
  useSSL: boolean("use_ssl").notNull().default(false),
  verifySslCert: boolean("verify_ssl_cert").notNull().default(false),
  currentBootId: varchar("current_boot_id"),
  lastSeenAt: timestamp("last_seen_at"),
  currentStatus: varchar("current_status", { length: 20 }).default("unknown"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCameraSchema = createInsertSchema(cameras, {
  protocol: z.enum(["http", "https"]).default("http"),
  port: z.number().int().min(1).max(65535).default(80),
  useSSL: z.boolean().default(false),
  verifySslCert: z.boolean().default(false),
}).omit({
  id: true,
  currentBootId: true,
  lastSeenAt: true,
  currentStatus: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCamera = z.infer<typeof insertCameraSchema>;
export type Camera = typeof cameras.$inferSelect;

// Uptime events table - tracks all status changes and polling results
export const uptimeEvents = pgTable(
  "uptime_events",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    cameraId: varchar("camera_id")
      .notNull()
      .references(() => cameras.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
    status: varchar("status", { length: 20 }).notNull(),
    uptimeSeconds: integer("uptime_seconds"),
    bootId: varchar("boot_id"),
    responseTimeMs: integer("response_time_ms"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("idx_uptime_events_camera_timestamp").on(
      table.cameraId,
      table.timestamp
    ),
  ]
);

export const insertUptimeEventSchema = createInsertSchema(uptimeEvents).omit({
  id: true,
});

export type InsertUptimeEvent = z.infer<typeof insertUptimeEventSchema>;
export type UptimeEvent = typeof uptimeEvents.$inferSelect;
