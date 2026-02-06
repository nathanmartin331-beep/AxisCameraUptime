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
import { eq, and, desc, gte, lte, sql, isNull } from "drizzle-orm";

// Safe user type without password (for API responses)
export type SafeUser = Omit<User, 'password'>;

// Helper function to strip password from user object
function sanitizeUser(user: User): SafeUser {
  const { password, ...safeUser } = user;
  return safeUser;
}

/**
 * Type for camera model information
 */
export interface CameraModelInfo {
  model: string;
  modelDetectedAt: Date;
  capabilities: Record<string, any>;
}

/**
 * Type for model update data
 */
export interface ModelUpdateData {
  model: string;
  capabilities?: Record<string, any>;
}

/**
 * Deep merge two objects (for capability merging)
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }

  return output;
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
  // Note: upsertUser creates or updates user based on email
  upsertUser(email: string, userData: Partial<InsertUser>): Promise<SafeUser>;

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

  // Model and capability operations
  /**
   * Update camera model information after detection
   * @param cameraId - Camera ID
   * @param modelData - Model name and optional capabilities
   * @returns Updated camera or undefined if not found
   */
  updateCameraModel(
    cameraId: string,
    modelData: ModelUpdateData
  ): Promise<Camera | undefined>;

  /**
   * Retrieve camera model information
   * @param cameraId - Camera ID
   * @returns Model info or null if not detected
   */
  getCameraModel(cameraId: string): Promise<CameraModelInfo | null>;

  /**
   * Find cameras that need model detection
   * @param userId - Optional user ID filter
   * @returns Array of cameras without model information
   */
  getCamerasWithoutModel(userId?: string): Promise<Camera[]>;

  /**
   * Update camera capabilities (merge or replace)
   * @param cameraId - Camera ID
   * @param capabilities - New capabilities
   * @param merge - If true, deep merge with existing; if false, replace
   * @returns Updated camera or undefined if not found
   */
  updateCameraCapabilities(
    cameraId: string,
    capabilities: Record<string, any>,
    merge?: boolean
  ): Promise<Camera | undefined>;

  /**
   * Query cameras by model name
   * @param modelName - Model name (case-insensitive)
   * @param userId - Optional user ID filter
   * @returns Array of cameras with matching model
   */
  getCamerasByModel(
    modelName: string,
    userId?: string
  ): Promise<Camera[]>;

  /**
   * Find cameras with specific capability
   * @param capabilityName - Capability key name
   * @param capabilityValue - Optional value to match
   * @param userId - Optional user ID filter
   * @returns Array of cameras with matching capability
   */
  getCamerasByCapability(
    capabilityName: string,
    capabilityValue?: any,
    userId?: string
  ): Promise<Camera[]>;

  // Uptime event operations
  createUptimeEvent(event: InsertUptimeEvent): Promise<UptimeEvent>;
  getUptimeEventsByCameraId(
    cameraId: string,
    limit?: number
  ): Promise<UptimeEvent[]>;
  getEarliestEvent(cameraId: string): Promise<UptimeEvent | undefined>;
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

  async upsertUser(email: string, userData: Partial<InsertUser>): Promise<SafeUser> {
    const existing = await this.getUserByEmail(email);
    if (existing) {
      return await this.updateUser(existing.id, userData);
    } else {
      return await this.createUser({ email, ...userData } as InsertUser);
    }
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

  // Model and capability operations
  async updateCameraModel(
    cameraId: string,
    modelData: ModelUpdateData
  ): Promise<Camera | undefined> {
    try {
      const updateData: any = {
        model: modelData.model,
        modelDetectedAt: new Date(),
        updatedAt: new Date(),
      };

      // Add capabilities if provided
      if (modelData.capabilities) {
        updateData.capabilities = modelData.capabilities;
      }

      const [updated] = await db
        .update(cameras)
        .set(updateData)
        .where(eq(cameras.id, cameraId))
        .returning();

      return updated;
    } catch (error) {
      console.error(`Error updating camera model for ${cameraId}:`, error);
      throw new Error(`Failed to update camera model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCameraModel(cameraId: string): Promise<CameraModelInfo | null> {
    try {
      const [camera] = await db
        .select({
          model: cameras.model,
          modelDetectedAt: cameras.modelDetectedAt,
          capabilities: cameras.capabilities,
        })
        .from(cameras)
        .where(eq(cameras.id, cameraId));

      if (!camera || !camera.model) {
        return null;
      }

      return {
        model: camera.model,
        modelDetectedAt: camera.modelDetectedAt || new Date(),
        capabilities: camera.capabilities || {},
      };
    } catch (error) {
      console.error(`Error getting camera model for ${cameraId}:`, error);
      throw new Error(`Failed to get camera model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCamerasWithoutModel(userId?: string): Promise<Camera[]> {
    try {
      let query = db
        .select()
        .from(cameras)
        .where(isNull(cameras.model))
        .orderBy(cameras.createdAt);

      // Apply user filter if provided
      if (userId) {
        query = db
          .select()
          .from(cameras)
          .where(
            and(
              isNull(cameras.model),
              eq(cameras.userId, userId)
            )
          )
          .orderBy(cameras.createdAt);
      }

      return await query;
    } catch (error) {
      console.error('Error getting cameras without model:', error);
      throw new Error(`Failed to get cameras without model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateCameraCapabilities(
    cameraId: string,
    capabilities: Record<string, any>,
    merge: boolean = true
  ): Promise<Camera | undefined> {
    try {
      let finalCapabilities = capabilities;

      // If merging, get existing capabilities first
      if (merge) {
        const [existing] = await db
          .select({ capabilities: cameras.capabilities })
          .from(cameras)
          .where(eq(cameras.id, cameraId));

        if (existing && existing.capabilities) {
          finalCapabilities = deepMerge(existing.capabilities, capabilities);
        }
      }

      const [updated] = await db
        .update(cameras)
        .set({
          capabilities: finalCapabilities,
          updatedAt: new Date(),
        })
        .where(eq(cameras.id, cameraId))
        .returning();

      return updated;
    } catch (error) {
      console.error(`Error updating camera capabilities for ${cameraId}:`, error);
      throw new Error(`Failed to update camera capabilities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCamerasByModel(
    modelName: string,
    userId?: string
  ): Promise<Camera[]> {
    try {
      let query = db
        .select()
        .from(cameras)
        .where(sql`LOWER(${cameras.model}) = LOWER(${modelName})`)
        .orderBy(cameras.name);

      // Apply user filter if provided
      if (userId) {
        query = db
          .select()
          .from(cameras)
          .where(
            and(
              sql`LOWER(${cameras.model}) = LOWER(${modelName})`,
              eq(cameras.userId, userId)
            )
          )
          .orderBy(cameras.name);
      }

      return await query;
    } catch (error) {
      console.error(`Error getting cameras by model ${modelName}:`, error);
      throw new Error(`Failed to get cameras by model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCamerasByCapability(
    capabilityName: string,
    capabilityValue?: any,
    userId?: string
  ): Promise<Camera[]> {
    try {
      // SECURITY FIX: Use parameterized JSON path construction to prevent SQL injection
      // Build the JSON path securely by parameterizing the capability name
      const jsonPath = `$.${capabilityName.replace(/[^a-zA-Z0-9_]/g, '_')}`;

      let whereClause;

      if (capabilityValue !== undefined) {
        // Check for specific capability value using parameterized query
        const valueParam = JSON.stringify(capabilityValue);
        whereClause = sql`json_extract(${cameras.capabilities}, ${jsonPath}) = ${valueParam}`;
      } else {
        // Check for capability existence (not null) using parameterized query
        whereClause = sql`json_extract(${cameras.capabilities}, ${jsonPath}) IS NOT NULL`;
      }

      // Add user filter if provided
      if (userId) {
        whereClause = and(whereClause, eq(cameras.userId, userId));
      }

      return await db
        .select()
        .from(cameras)
        .where(whereClause)
        .orderBy(cameras.name);
    } catch (error) {
      console.error(`Error getting cameras by capability ${capabilityName}:`, error);
      throw new Error(`Failed to get cameras by capability: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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

  async getEarliestEvent(cameraId: string): Promise<UptimeEvent | undefined> {
    const [event] = await db
      .select()
      .from(uptimeEvents)
      .where(eq(uptimeEvents.cameraId, cameraId))
      .orderBy(uptimeEvents.timestamp)
      .limit(1);
    return event;
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
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - days);

    // Determine the effective monitoring start date.
    // If historical backfill has been performed, use the earliest event
    // (which may be a synthetic boot event from before the camera was added).
    // Otherwise, clamp to the camera's createdAt date.
    const camera = await this.getCameraById(cameraId);
    let monitoringStart = camera?.createdAt ? new Date(camera.createdAt) : windowStart;

    if (camera?.historyBackfilled) {
      const earliest = await this.getEarliestEvent(cameraId);
      if (earliest) {
        const earliestTime = new Date(earliest.timestamp);
        if (earliestTime < monitoringStart) {
          monitoringStart = earliestTime;
        }
      }
    }

    const startDate = monitoringStart > windowStart ? monitoringStart : windowStart;

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
