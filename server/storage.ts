import {
  users,
  cameras,
  uptimeEvents,
  dashboardLayouts,
  cameraGroups,
  cameraGroupMembers,
  analyticsEvents,
  userSettings,
  type User,
  type InsertUser,
  type Camera,
  type InsertCamera,
  type UptimeEvent,
  type InsertUptimeEvent,
  type CameraGroup,
  type InsertCameraGroup,
  type CameraGroupMember,
  type AnalyticsEvent,
  type InsertAnalyticsEvent,
  type CameraCapabilities,
  type UserSettings,
} from "@shared/schema";
import { db, sqlite } from "./db";
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
  detectedAt: Date;
  capabilities: Record<string, any>;
}

/**
 * Type for model update data
 */
export interface ModelUpdateData {
  model: string;
  fullName?: string;
  series?: string;
  firmwareVersion?: string;
  vapixVersion?: string;
  hasPTZ?: boolean;
  hasAudio?: boolean;
  audioChannels?: number;
  numberOfViews?: number;
  capabilities?: Record<string, any>;
}

/**
 * Deep merge two objects (for capability merging)
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };

  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
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
  createUptimeEventBatch(events: InsertUptimeEvent[]): Promise<void>;
  batchUpdateCameraStatuses(updates: Array<{
    id: string;
    status: string;
    bootId?: string;
    lastSeenAt?: Date;
    videoStatus: string;
  }>): Promise<void>;
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
  ): Promise<{ percentage: number; monitoredDays: number }>;

  // Camera group operations
  createGroup(group: InsertCameraGroup): Promise<CameraGroup>;
  getGroupsByUserId(userId: string): Promise<CameraGroup[]>;
  getGroupById(id: string): Promise<CameraGroup | undefined>;
  updateGroup(id: string, data: Partial<InsertCameraGroup>): Promise<CameraGroup | undefined>;
  deleteGroup(id: string): Promise<void>;
  addCameraToGroup(groupId: string, cameraId: string): Promise<void>;
  removeCameraFromGroup(groupId: string, cameraId: string): Promise<void>;
  getGroupMembers(groupId: string): Promise<Camera[]>;
  getCameraGroups(cameraId: string): Promise<CameraGroup[]>;

  // Analytics event operations
  createAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent>;
  createAnalyticsEventBatch(events: InsertAnalyticsEvent[]): Promise<void>;
  getAnalyticsEvents(cameraId: string, eventType: string, startDate: Date, endDate: Date): Promise<AnalyticsEvent[]>;
  getLatestAnalyticsEvent(cameraId: string, eventType: string): Promise<AnalyticsEvent | undefined>;
  getAnalyticsDailyTotals(cameraId: string, eventType: string, days: number): Promise<Array<{ date: string; total: number; metadata?: Record<string, any> }>>;
  getLatestAnalyticsPerCamera(cameraIds: string[], eventTypes: string[]): Promise<Map<string, Map<string, { value: number; metadata?: Record<string, any> }>>>;
  getGroupCurrentOccupancy(groupId: string): Promise<{ total: number; cameras: Array<{ id: string; name: string; occupancy: number }> }>;
  getGroupAnalyticsSummary(groupId: string, startDate: Date, endDate: Date): Promise<{
    totalIn: number;
    totalOut: number;
    currentOccupancy: number;
    perCamera: Array<{ id: string; name: string; in: number; out: number; occupancy: number }>;
  }>;

  // User settings operations
  getUserSettings(userId: string): Promise<UserSettings>;
  updateUserSettings(userId: string, settings: Partial<Pick<UserSettings, 'pollingInterval' | 'dataRetentionDays' | 'emailNotifications'>>): Promise<UserSettings>;

  // Data retention cleanup
  deleteOldUptimeEvents(beforeDate: Date): Promise<number>;
  deleteOldAnalyticsEvents(beforeDate: Date): Promise<number>;
}

// In-memory TTL cache for uptime percentage calculations
// Avoids re-querying DB for the same camera+days within 60 seconds
const uptimeCache = new Map<string, { value: { percentage: number; monitoredDays: number }; expiresAt: number }>();
const UPTIME_CACHE_TTL_MS = 60_000; // 60 seconds

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
    const [newCamera] = await db.insert(cameras).values(camera as any).returning();
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
      .set({ ...data, updatedAt: new Date() } as any)
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
        detectedAt: new Date(),
        updatedAt: new Date(),
      };

      // Save all available model fields to their dedicated columns
      if (modelData.fullName) updateData.fullName = modelData.fullName;
      if (modelData.series) updateData.series = modelData.series;
      if (modelData.firmwareVersion) updateData.firmwareVersion = modelData.firmwareVersion;
      if (modelData.vapixVersion) updateData.vapixVersion = modelData.vapixVersion;
      if (modelData.hasPTZ !== undefined) updateData.hasPTZ = modelData.hasPTZ;
      if (modelData.hasAudio !== undefined) updateData.hasAudio = modelData.hasAudio;
      if (modelData.audioChannels !== undefined) updateData.audioChannels = modelData.audioChannels;
      if (modelData.numberOfViews !== undefined) updateData.numberOfViews = modelData.numberOfViews;

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
          detectedAt: cameras.detectedAt,
          capabilities: cameras.capabilities,
        })
        .from(cameras)
        .where(eq(cameras.id, cameraId));

      if (!camera || !camera.model) {
        return null;
      }

      return {
        model: camera.model,
        detectedAt: camera.detectedAt || new Date(),
        capabilities: (camera.capabilities as Record<string, any>) || {},
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
          capabilities: finalCapabilities as CameraCapabilities,
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

  async createUptimeEventBatch(events: InsertUptimeEvent[]): Promise<void> {
    if (events.length === 0) return;
    // Insert in chunks of 100 to stay within SQLite's 999-variable limit
    // (~6 columns per event → max ~166, use 100 for safety)
    const CHUNK_SIZE = 100;
    for (let i = 0; i < events.length; i += CHUNK_SIZE) {
      const chunk = events.slice(i, i + CHUNK_SIZE);
      await db.insert(uptimeEvents).values(chunk);
    }
  }

  async batchUpdateCameraStatuses(updates: Array<{
    id: string;
    status: string;
    bootId?: string;
    lastSeenAt?: Date;
    videoStatus: string;
  }>): Promise<void> {
    if (updates.length === 0) return;
    // Wrap all status updates in a single transaction
    const transaction = sqlite.transaction((items: typeof updates) => {
      for (const update of items) {
        const setData: any = {
          currentStatus: update.status,
          videoStatus: update.videoStatus,
          updatedAt: new Date(),
        };
        if (update.bootId) setData.currentBootId = update.bootId;
        if (update.lastSeenAt) setData.lastSeenAt = update.lastSeenAt;
        if (update.videoStatus) {
          setData.lastVideoCheck = new Date();
        }

        db.update(cameras)
          .set(setData)
          .where(eq(cameras.id, update.id))
          .run();
      }
    });
    transaction(updates);
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
  ): Promise<{ percentage: number; monitoredDays: number }> {
    // Check TTL cache first
    const cacheKey = `${cameraId}:${days}`;
    const cached = uptimeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

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

    // Actual number of days being calculated
    const monitoredDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    const events = await this.getUptimeEventsInRange(
      cameraId,
      startDate,
      endDate
    );

    const priorEvent = await this.getLatestEventBefore(cameraId, startDate);

    // Determine the prior status. If no event exists before the window
    // but the camera's last known boot time predates the window start,
    // the camera was online throughout (its boot event was purged by retention).
    let priorStatus = priorEvent?.status;
    if (!priorStatus && camera?.lastBootAt) {
      const bootTime = new Date(camera.lastBootAt);
      if (bootTime < startDate) {
        priorStatus = "online";
      }
    }

    // Use validated pure function for calculation
    const { calculateUptimeFromEvents } = await import('./uptimeCalculator.js');

    const eventList = events.map(e => ({
      timestamp: new Date(e.timestamp),
      status: e.status
    }));

    const percentage = calculateUptimeFromEvents(
      eventList,
      startDate,
      endDate,
      priorStatus
    );

    const result = { percentage, monitoredDays };

    // Store in TTL cache
    uptimeCache.set(cacheKey, { value: result, expiresAt: Date.now() + UPTIME_CACHE_TTL_MS });

    return result;
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

  // Camera group operations
  async createGroup(group: InsertCameraGroup): Promise<CameraGroup> {
    const [newGroup] = await db.insert(cameraGroups).values(group).returning();
    return newGroup;
  }

  async getGroupsByUserId(userId: string): Promise<CameraGroup[]> {
    return await db
      .select()
      .from(cameraGroups)
      .where(eq(cameraGroups.userId, userId))
      .orderBy(cameraGroups.name);
  }

  async getGroupById(id: string): Promise<CameraGroup | undefined> {
    const [group] = await db.select().from(cameraGroups).where(eq(cameraGroups.id, id));
    return group;
  }

  async updateGroup(id: string, data: Partial<InsertCameraGroup>): Promise<CameraGroup | undefined> {
    const [updated] = await db
      .update(cameraGroups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cameraGroups.id, id))
      .returning();
    return updated;
  }

  async deleteGroup(id: string): Promise<void> {
    await db.delete(cameraGroups).where(eq(cameraGroups.id, id));
  }

  async addCameraToGroup(groupId: string, cameraId: string): Promise<void> {
    await db.insert(cameraGroupMembers).values({ groupId, cameraId }).onConflictDoNothing();
  }

  async removeCameraFromGroup(groupId: string, cameraId: string): Promise<void> {
    await db
      .delete(cameraGroupMembers)
      .where(
        and(
          eq(cameraGroupMembers.groupId, groupId),
          eq(cameraGroupMembers.cameraId, cameraId)
        )
      );
  }

  async getGroupMembers(groupId: string): Promise<Camera[]> {
    const members = await db
      .select({ camera: cameras })
      .from(cameraGroupMembers)
      .innerJoin(cameras, eq(cameraGroupMembers.cameraId, cameras.id))
      .where(eq(cameraGroupMembers.groupId, groupId))
      .orderBy(cameras.name);

    return members.map((m) => m.camera);
  }

  async getCameraGroups(cameraId: string): Promise<CameraGroup[]> {
    const groups = await db
      .select({ group: cameraGroups })
      .from(cameraGroupMembers)
      .innerJoin(cameraGroups, eq(cameraGroupMembers.groupId, cameraGroups.id))
      .where(eq(cameraGroupMembers.cameraId, cameraId))
      .orderBy(cameraGroups.name);

    return groups.map((g) => g.group);
  }

  // Analytics event operations
  async createAnalyticsEvent(event: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    const [newEvent] = await db.insert(analyticsEvents).values(event).returning();
    return newEvent;
  }

  async createAnalyticsEventBatch(events: InsertAnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;
    // Insert in chunks of 100 to stay within SQLite's 999-variable limit
    // (~5 columns per event → max ~199, use 100 for safety)
    const CHUNK_SIZE = 100;
    for (let i = 0; i < events.length; i += CHUNK_SIZE) {
      const chunk = events.slice(i, i + CHUNK_SIZE);
      await db.insert(analyticsEvents).values(chunk);
    }
  }

  async getAnalyticsEvents(
    cameraId: string,
    eventType: string,
    startDate: Date,
    endDate: Date
  ): Promise<AnalyticsEvent[]> {
    return await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.cameraId, cameraId),
          eq(analyticsEvents.eventType, eventType),
          gte(analyticsEvents.timestamp, startDate),
          lte(analyticsEvents.timestamp, endDate)
        )
      )
      .orderBy(analyticsEvents.timestamp);
  }

  async getLatestAnalyticsEvent(
    cameraId: string,
    eventType: string
  ): Promise<AnalyticsEvent | undefined> {
    const [event] = await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.cameraId, cameraId),
          eq(analyticsEvents.eventType, eventType)
        )
      )
      .orderBy(desc(analyticsEvents.timestamp))
      .limit(1);
    return event;
  }

  async getAnalyticsDailyTotals(
    cameraId: string,
    eventType: string,
    days: number
  ): Promise<Array<{ date: string; total: number; metadata?: Record<string, any> }>> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    const dailyMap = new Map<string, { total: number; metadata?: Record<string, any> }>();

    // 1. Fetch from pre-aggregated daily summary table (data older than 48h)
    const dailyRows = sqlite.prepare(`
      SELECT day_start, max_value, metadata FROM analytics_daily_summary
      WHERE camera_id = ? AND event_type = ? AND day_start >= ? AND day_start <= ?
    `).all(cameraId, eventType, startTs, endTs) as Array<{ day_start: number; max_value: number; metadata: string | null }>;

    for (const row of dailyRows) {
      const d = new Date(row.day_start * 1000);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let meta: Record<string, any> | undefined;
      if (row.metadata) { try { meta = JSON.parse(row.metadata); } catch {} }
      dailyMap.set(dateKey, { total: row.max_value ?? 0, metadata: meta });
    }

    // 2. Fetch from hourly summary table (data 6h–48h old)
    const hourlyRows = sqlite.prepare(`
      SELECT hour_start, max_value, metadata FROM analytics_hourly_summary
      WHERE camera_id = ? AND event_type = ? AND hour_start >= ? AND hour_start <= ?
    `).all(cameraId, eventType, startTs, endTs) as Array<{ hour_start: number; max_value: number; metadata: string | null }>;

    for (const row of hourlyRows) {
      const d = new Date(row.hour_start * 1000);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const existing = dailyMap.get(dateKey);
      const hourMax = row.max_value ?? 0;
      if (!existing || hourMax > existing.total) {
        let meta: Record<string, any> | undefined;
        if (row.metadata) { try { meta = JSON.parse(row.metadata); } catch {} }
        dailyMap.set(dateKey, { total: hourMax, metadata: meta });
      }
    }

    // 3. Fetch from raw events table (recent data < 6h, not yet rolled up)
    const events = await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.cameraId, cameraId),
          eq(analyticsEvents.eventType, eventType),
          gte(analyticsEvents.timestamp, startDate),
          lte(analyticsEvents.timestamp, endDate)
        )
      )
      .orderBy(analyticsEvents.timestamp);

    for (const evt of events) {
      const d = new Date(evt.timestamp);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const existing = dailyMap.get(dateKey);
      if (!existing || evt.value > existing.total) {
        dailyMap.set(dateKey, { total: evt.value, metadata: evt.metadata ?? undefined });
      }
    }

    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get the latest analytics event per camera per event type in a single query.
   * Replaces N individual getLatestAnalyticsEvent calls with one GROUP BY query.
   * At 500 analytics cameras, this turns ~1,500 queries into 1.
   */
  async getLatestAnalyticsPerCamera(
    cameraIds: string[],
    eventTypes: string[]
  ): Promise<Map<string, Map<string, { value: number; metadata?: Record<string, any> }>>> {
    const result = new Map<string, Map<string, { value: number; metadata?: Record<string, any> }>>();
    if (cameraIds.length === 0 || eventTypes.length === 0) return result;

    // Use raw SQL for the GROUP BY with window function to get latest row per camera+type
    const placeholders = cameraIds.map(() => "?").join(",");
    const typePlaceholders = eventTypes.map(() => "?").join(",");

    const rows = sqlite.prepare(`
      SELECT camera_id, event_type, value, metadata
      FROM analytics_events ae
      WHERE camera_id IN (${placeholders})
        AND event_type IN (${typePlaceholders})
        AND timestamp = (
          SELECT MAX(ae2.timestamp)
          FROM analytics_events ae2
          WHERE ae2.camera_id = ae.camera_id AND ae2.event_type = ae.event_type
        )
    `).all(...cameraIds, ...eventTypes) as Array<{
      camera_id: string;
      event_type: string;
      value: number;
      metadata: string | null;
    }>;

    for (const row of rows) {
      if (!result.has(row.camera_id)) {
        result.set(row.camera_id, new Map());
      }
      let meta: Record<string, any> | undefined;
      if (row.metadata) {
        try { meta = JSON.parse(row.metadata); } catch {}
      }
      result.get(row.camera_id)!.set(row.event_type, { value: row.value, metadata: meta });
    }

    return result;
  }

  async getGroupCurrentOccupancy(groupId: string): Promise<{
    total: number;
    cameras: Array<{ id: string; name: string; occupancy: number }>;
  }> {
    const members = await this.getGroupMembers(groupId);
    const cameraOccupancies = await Promise.all(
      members.map(async (camera) => {
        const latest = await this.getLatestAnalyticsEvent(camera.id, "occupancy");
        return {
          id: camera.id,
          name: camera.name,
          occupancy: latest?.value ?? 0,
        };
      })
    );

    return {
      total: cameraOccupancies.reduce((sum, c) => sum + c.occupancy, 0),
      cameras: cameraOccupancies,
    };
  }

  async getGroupAnalyticsSummary(
    groupId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalIn: number;
    totalOut: number;
    currentOccupancy: number;
    perCamera: Array<{ id: string; name: string; in: number; out: number; occupancy: number }>;
  }> {
    const members = await this.getGroupMembers(groupId);
    const occupancyData = await this.getGroupCurrentOccupancy(groupId);

    const perCamera = await Promise.all(
      members.map(async (camera) => {
        // Use latest event value per camera (not sum), because
        // getAccumulatedCounts returns cumulative totals
        const [latestIn, latestOut] = await Promise.all([
          this.getLatestAnalyticsEvent(camera.id, "people_in"),
          this.getLatestAnalyticsEvent(camera.id, "people_out"),
        ]);
        const cameraOcc = occupancyData.cameras.find((c) => c.id === camera.id);

        return {
          id: camera.id,
          name: camera.name,
          in: latestIn?.value ?? 0,
          out: latestOut?.value ?? 0,
          occupancy: cameraOcc?.occupancy ?? 0,
        };
      })
    );

    return {
      totalIn: perCamera.reduce((sum, c) => sum + c.in, 0),
      totalOut: perCamera.reduce((sum, c) => sum + c.out, 0),
      currentOccupancy: occupancyData.total,
      perCamera,
    };
  }

  // User settings operations
  async getUserSettings(userId: string): Promise<UserSettings> {
    const [existing] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));

    if (existing) return existing;

    // Create default settings for user
    const [created] = await db
      .insert(userSettings)
      .values({ userId })
      .returning();

    return created;
  }

  async updateUserSettings(
    userId: string,
    settings: Partial<Pick<UserSettings, 'pollingInterval' | 'dataRetentionDays' | 'emailNotifications'>>
  ): Promise<UserSettings> {
    // Ensure settings row exists
    await this.getUserSettings(userId);

    const [updated] = await db
      .update(userSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(userSettings.userId, userId))
      .returning();

    return updated;
  }

  // Data retention cleanup — batched deletes to avoid long write locks
  async deleteOldUptimeEvents(beforeDate: Date): Promise<number> {
    let totalDeleted = 0;
    const BATCH_SIZE = 10000;
    while (true) {
      const result = sqlite.prepare(
        `DELETE FROM uptime_events WHERE rowid IN (SELECT rowid FROM uptime_events WHERE timestamp <= ? LIMIT ?)`
      ).run(Math.floor(beforeDate.getTime() / 1000), BATCH_SIZE);
      const deleted = result.changes;
      totalDeleted += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    return totalDeleted;
  }

  async deleteOldAnalyticsEvents(beforeDate: Date): Promise<number> {
    let totalDeleted = 0;
    const BATCH_SIZE = 10000;
    while (true) {
      const result = sqlite.prepare(
        `DELETE FROM analytics_events WHERE rowid IN (SELECT rowid FROM analytics_events WHERE timestamp <= ? LIMIT ?)`
      ).run(Math.floor(beforeDate.getTime() / 1000), BATCH_SIZE);
      const deleted = result.changes;
      totalDeleted += deleted;
      if (deleted < BATCH_SIZE) break;
    }
    return totalDeleted;
  }
}

export const storage = new DatabaseStorage();
