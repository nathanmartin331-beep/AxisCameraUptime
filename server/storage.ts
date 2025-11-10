import {
  users,
  cameras,
  uptimeEvents,
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
  // Note: createUser expects password to be pre-hashed with bcrypt
  createUser(user: InsertUser): Promise<SafeUser>;

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

    if (events.length === 0 && !priorEvent) {
      return 100;
    }

    let totalUptime = 0;
    const totalDuration = endDate.getTime() - startDate.getTime();

    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let currentStatus: string;
    if (priorEvent) {
      currentStatus = priorEvent.status;
    } else if (sortedEvents.length > 0) {
      currentStatus = sortedEvents[0].status === "online" ? "offline" : "online";
    } else {
      currentStatus = "online";
    }

    let currentTime = startDate.getTime();

    for (const event of sortedEvents) {
      const eventTime = new Date(event.timestamp).getTime();

      if (currentStatus === "online") {
        totalUptime += eventTime - currentTime;
      }

      currentStatus = event.status;
      currentTime = eventTime;
    }

    if (currentStatus === "online") {
      totalUptime += endDate.getTime() - currentTime;
    }

    return totalDuration > 0 ? (totalUptime / totalDuration) * 100 : 0;
  }
}

export const storage = new DatabaseStorage();
