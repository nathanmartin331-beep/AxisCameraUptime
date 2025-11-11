import {
  users,
  cameras,
  uptimeEvents,
  dashboardLayouts,
  type User,
  type InsertUser,
  type Camera,
  type InsertCamera,
  type UptimeEvent,
  type InsertUptimeEvent,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

// Safe user type without password (for API responses)
export type SafeUser = Omit<User, 'password'>;

// Helper function to strip password from user object
function sanitizeUser(user: User): SafeUser {
  const { password, ...safeUser } = user;
  return safeUser;
}

export interface IStorage {
  // User operations (local authentication)
  // Note: getSafeUser returns user without password field for API responses
  getSafeUser(id: string): Promise<SafeUser | undefined>;
  // Note: getUserByEmail returns full user (with password) for authentication only
  getUserByEmail(email: string): Promise<User | undefined>;
  // Note: getUserById returns full user (with password) for password change operations
  getUserById(id: string): Promise<User | undefined>;
  // Note: createUser expects password to be pre-hashed with bcrypt
  createUser(user: InsertUser): Promise<SafeUser>;
  // Note: updateUser allows updating user fields including password
  updateUser(id: string, data: Partial<InsertUser>): Promise<SafeUser>;

  // Camera operations
  createCamera(camera: InsertCamera): Promise<Camera>;
  getCamerasByUserId(userId: string): Promise<Camera[]>;
  getCameraById(id: string): Promise<Camera | undefined>;
  updateCamera(id: string, data: Partial<InsertCamera>): Promise<Camera | undefined>;
  deleteCamera(id: string): Promise<void>;
  updateCameraStatus(
    id: string,
    status: string,
    bootId?: string,
    lastSeenAt?: Date
  ): Promise<void>;
  updateVideoStatus(
    id: string,
    videoStatus: string,
    lastVideoCheck?: Date
  ): Promise<void>;

  // Uptime event operations
  createUptimeEvent(event: InsertUptimeEvent): Promise<UptimeEvent>;
  getUptimeEventsByCameraId(
    cameraId: string,
    limit?: number
  ): Promise<UptimeEvent[]>;
  getLatestEventBefore(
    cameraId: string,
    beforeDate: Date
  ): Promise<UptimeEvent | undefined>;
  getUptimeEventsInRange(
    cameraId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UptimeEvent[]>;
  calculateUptimePercentage(
    cameraId: string,
    days: number
  ): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getSafeUser(id: string): Promise<SafeUser | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ? sanitizeUser(user) : undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<SafeUser> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return sanitizeUser(updated);
  }

  async createUser(userData: InsertUser): Promise<SafeUser> {
    const [user] = await db.insert(users).values(userData).returning();
    return sanitizeUser(user);
  }

  // Camera operations
  async createCamera(camera: InsertCamera): Promise<Camera> {
    const [newCamera] = await db.insert(cameras).values(camera).returning();
    return newCamera;
  }

  async getCamerasByUserId(userId: string): Promise<Camera[]> {
    return await db
      .select()
      .from(cameras)
      .where(eq(cameras.userId, userId))
      .orderBy(cameras.name);
  }

  async getCameraById(id: string): Promise<Camera | undefined> {
    const [camera] = await db.select().from(cameras).where(eq(cameras.id, id));
    return camera;
  }

  async updateCamera(
    id: string,
    data: Partial<InsertCamera>
  ): Promise<Camera | undefined> {
    const [updated] = await db
      .update(cameras)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cameras.id, id))
      .returning();
    return updated;
  }

  async deleteCamera(id: string): Promise<void> {
    await db.delete(cameras).where(eq(cameras.id, id));
  }

  async updateCameraStatus(
    id: string,
    status: string,
    bootId?: string,
    lastSeenAt?: Date
  ): Promise<void> {
    await db
      .update(cameras)
      .set({
        currentStatus: status,
        ...(bootId && { currentBootId: bootId }),
        ...(lastSeenAt && { lastSeenAt }),
        updatedAt: new Date(),
      })
      .where(eq(cameras.id, id));
  }

  async updateVideoStatus(
    id: string,
    videoStatus: string,
    lastVideoCheck?: Date
  ): Promise<void> {
    await db
      .update(cameras)
      .set({
        videoStatus,
        lastVideoCheck: lastVideoCheck || new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cameras.id, id));
  }

  // Uptime event operations
  async createUptimeEvent(event: InsertUptimeEvent): Promise<UptimeEvent> {
    const [newEvent] = await db
      .insert(uptimeEvents)
      .values(event)
      .returning();
    return newEvent;
  }

  async getUptimeEventsByCameraId(
    cameraId: string,
    limit: number = 100
  ): Promise<UptimeEvent[]> {
    return await db
      .select()
      .from(uptimeEvents)
      .where(eq(uptimeEvents.cameraId, cameraId))
      .orderBy(desc(uptimeEvents.timestamp))
      .limit(limit);
  }

  async getLatestEventBefore(
    cameraId: string,
    beforeDate: Date
  ): Promise<UptimeEvent | undefined> {
    const [event] = await db
      .select()
      .from(uptimeEvents)
      .where(
        and(
          eq(uptimeEvents.cameraId, cameraId),
          lte(uptimeEvents.timestamp, beforeDate)
        )
      )
      .orderBy(desc(uptimeEvents.timestamp))
      .limit(1);
    return event;
  }

  async getUptimeEventsInRange(
    cameraId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UptimeEvent[]> {
    return await db
      .select()
      .from(uptimeEvents)
      .where(
        and(
          eq(uptimeEvents.cameraId, cameraId),
          gte(uptimeEvents.timestamp, startDate),
          lte(uptimeEvents.timestamp, endDate)
        )
      )
      .orderBy(uptimeEvents.timestamp);
  }

  async calculateUptimePercentage(
    cameraId: string,
    days: number
  ): Promise<number> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await this.getUptimeEventsInRange(
      cameraId,
      startDate,
      endDate
    );

    const priorEvent = await this.getLatestEventBefore(cameraId, startDate);

    // Use validated pure function for calculation
    const { calculateUptimeFromEvents } = await import('./uptimeCalculator.js');
    
    const eventList = events.map(e => ({
      timestamp: new Date(e.timestamp),
      status: e.status
    }));

    return calculateUptimeFromEvents(
      eventList,
      startDate,
      endDate,
      priorEvent?.status
    );
  }

  // Dashboard layout methods
  async getDashboardLayout(userId: string) {
    const result = await db
      .select()
      .from(dashboardLayouts)
      .where(eq(dashboardLayouts.userId, userId))
      .limit(1);

    return result[0]?.layout || null;
  }

  async saveDashboardLayout(userId: string, layout: any) {
    const existing = await db
      .select()
      .from(dashboardLayouts)
      .where(eq(dashboardLayouts.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing layout
      await db
        .update(dashboardLayouts)
        .set({
          layout,
          updatedAt: new Date(),
        })
        .where(eq(dashboardLayouts.userId, userId));
    } else {
      // Create new layout
      await db.insert(dashboardLayouts).values({
        userId,
        layout,
      });
    }

    return layout;
  }
}

export const storage = new DatabaseStorage();
