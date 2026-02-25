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
  getLatestAnalyticsEventsByScenario(cameraId: string, eventType: string): Promise<AnalyticsEvent[]>;
  getAnalyticsDailyTotals(cameraId: string, eventType: string, days: number): Promise<Array<{ date: string; total: number; metadata?: Record<string, any> }>>;
  getAnalyticsDailyTotalsByScenario(cameraId: string, eventType: string, days: number): Promise<Record<string, Array<{ date: string; total: number; metadata?: Record<string, any> }>>>;
  getLatestAnalyticsPerCamera(cameraIds: string[], eventTypes: string[]): Promise<Map<string, Map<string, { value: number; metadata?: Record<string, any> }>>>;
  getGroupCurrentOccupancy(groupId: string): Promise<{ total: number; cameras: Array<{ id: string; name: string; occupancy: number }> }>;
  getGroupAnalyticsSummary(groupId: string, startDate: Date, endDate: Date): Promise<{
    totalIn: number;
    totalOut: number;
    currentOccupancy: number;
    perCamera: Array<{ id: string; name: string; in: number; out: number; occupancy: number }>;
  }>;

  // User management operations
  getAllUsers(): Promise<SafeUser[]>;
  deleteUser(id: string): Promise<void>;

  // User settings operations
  getUserSettings(userId: string): Promise<UserSettings>;
  updateUserSettings(userId: string, settings: Partial<Pick<UserSettings, 'pollingInterval' | 'dataRetentionDays' | 'emailNotifications' | 'defaultCertValidationMode' | 'globalCaCert'>>): Promise<UserSettings>;

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

    // Read from all 3 data tiers to get complete uptime picture.
    // The aggregation service deletes raw events after 6h (→ hourly summaries)
    // and hourly summaries after 48h (→ daily summaries). We must read all tiers.
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    // Tier 3: Daily summaries (oldest data, 48h+ ago)
    const dailyRows = sqlite.prepare(`
      SELECT online_count, offline_count, total_checks
      FROM uptime_daily_summary
      WHERE camera_id = ? AND day_start >= ? AND day_start <= ?
    `).all(cameraId, startTs, endTs) as Array<{ online_count: number; offline_count: number; total_checks: number }>;

    // Tier 2: Hourly summaries (6h–48h ago, not yet rolled into daily)
    const hourlyRows = sqlite.prepare(`
      SELECT online_count, offline_count, total_checks
      FROM uptime_hourly_summary
      WHERE camera_id = ? AND hour_start >= ? AND hour_start <= ?
    `).all(cameraId, startTs, endTs) as Array<{ online_count: number; offline_count: number; total_checks: number }>;

    // Tier 1: Raw events (last ~6h, not yet aggregated)
    const events = await this.getUptimeEventsInRange(
      cameraId,
      startDate,
      endDate
    );

    // Sum up online/total counts from summary tiers
    let totalOnline = 0;
    let totalChecks = 0;

    for (const row of dailyRows) {
      totalOnline += row.online_count;
      totalChecks += row.total_checks;
    }
    for (const row of hourlyRows) {
      totalOnline += row.online_count;
      totalChecks += row.total_checks;
    }

    // Count raw events (not yet aggregated)
    for (const event of events) {
      totalChecks++;
      if (event.status === "online") {
        totalOnline++;
      }
    }

    let percentage: number;

    if (totalChecks > 0) {
      // We have aggregated data — use check-count-based calculation
      percentage = (totalOnline / totalChecks) * 100;
    } else {
      // No data in any tier — fall back to event-based calculation
      // (handles edge case of brand-new cameras with no aggregation yet)
      const priorEvent = await this.getLatestEventBefore(cameraId, startDate);
      let priorStatus = priorEvent?.status;
      if (!priorStatus && camera?.lastBootAt) {
        const bootTime = new Date(camera.lastBootAt);
        if (bootTime < startDate) {
          priorStatus = "online";
        }
      }

      const { calculateUptimeFromEvents } = await import('./uptimeCalculator.js');
      const eventList = events.map(e => ({
        timestamp: new Date(e.timestamp),
        status: e.status
      }));
      percentage = calculateUptimeFromEvents(eventList, startDate, endDate, priorStatus);
    }

    const result = { percentage, monitoredDays };

    // Store in TTL cache
    uptimeCache.set(cacheKey, { value: result, expiresAt: Date.now() + UPTIME_CACHE_TTL_MS });

    return result;
  }

  /**
   * Batch calculate uptime percentages for multiple cameras in 3 queries
   * instead of 3*N queries. Uses the same 3-tier aggregation approach
   * (daily summaries, hourly summaries, raw events) but with GROUP BY.
   */
  async calculateBatchUptimePercentage(
    cameraIds: string[],
    days: number
  ): Promise<Map<string, { percentage: number; monitoredDays: number }>> {
    const results = new Map<string, { percentage: number; monitoredDays: number }>();
    if (cameraIds.length === 0) return results;

    // Check cache first, collect uncached IDs
    const uncachedIds: string[] = [];
    for (const id of cameraIds) {
      const cacheKey = `${id}:${days}`;
      const cached = uptimeCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        results.set(id, cached.value);
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length === 0) return results;

    const endDate = new Date();
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - days);
    const startTs = Math.floor(windowStart.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    // Build placeholders for IN clause
    const placeholders = uncachedIds.map(() => '?').join(',');

    // Tier 3: Daily summaries (batch)
    const dailyRows = sqlite.prepare(`
      SELECT camera_id, SUM(online_count) as online_count, SUM(total_checks) as total_checks
      FROM uptime_daily_summary
      WHERE camera_id IN (${placeholders}) AND day_start >= ? AND day_start <= ?
      GROUP BY camera_id
    `).all(...uncachedIds, startTs, endTs) as Array<{ camera_id: string; online_count: number; total_checks: number }>;

    // Tier 2: Hourly summaries (batch)
    const hourlyRows = sqlite.prepare(`
      SELECT camera_id, SUM(online_count) as online_count, SUM(total_checks) as total_checks
      FROM uptime_hourly_summary
      WHERE camera_id IN (${placeholders}) AND hour_start >= ? AND hour_start <= ?
      GROUP BY camera_id
    `).all(...uncachedIds, startTs, endTs) as Array<{ camera_id: string; online_count: number; total_checks: number }>;

    // Tier 1: Raw events count (batch)
    const rawRows = sqlite.prepare(`
      SELECT camera_id,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_count,
        COUNT(*) as total_checks
      FROM uptime_events
      WHERE camera_id IN (${placeholders}) AND timestamp >= ? AND timestamp <= ?
      GROUP BY camera_id
    `).all(...uncachedIds, windowStart.toISOString(), endDate.toISOString()) as Array<{ camera_id: string; online_count: number; total_checks: number }>;

    // Aggregate per-camera
    const dailyMap = new Map(dailyRows.map(r => [r.camera_id, r]));
    const hourlyMap = new Map(hourlyRows.map(r => [r.camera_id, r]));
    const rawMap = new Map(rawRows.map(r => [r.camera_id, r]));

    for (const id of uncachedIds) {
      const daily = dailyMap.get(id);
      const hourly = hourlyMap.get(id);
      const raw = rawMap.get(id);

      let totalOnline = (daily?.online_count ?? 0) + (hourly?.online_count ?? 0) + (raw?.online_count ?? 0);
      let totalChecks = (daily?.total_checks ?? 0) + (hourly?.total_checks ?? 0) + (raw?.total_checks ?? 0);

      const percentage = totalChecks > 0 ? (totalOnline / totalChecks) * 100 : 0;
      const monitoredDays = days;

      const value = { percentage, monitoredDays };
      results.set(id, value);

      // Cache the result
      uptimeCache.set(`${id}:${days}`, { value, expiresAt: Date.now() + UPTIME_CACHE_TTL_MS });
    }

    return results;
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

  /**
   * Get ALL latest analytics events at the most recent timestamp for a camera+eventType.
   * Returns one entry per scenario when multiple scenarios produce the same eventType.
   * Used for individual camera views where per-scenario granularity is needed.
   */
  async getLatestAnalyticsEventsByScenario(
    cameraId: string,
    eventType: string
  ): Promise<AnalyticsEvent[]> {
    // First find the latest timestamp for this camera+eventType
    const [latest] = await db
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

    if (!latest) return [];

    // Return all events at that timestamp (one per scenario)
    return await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.cameraId, cameraId),
          eq(analyticsEvents.eventType, eventType),
          eq(analyticsEvents.timestamp, latest.timestamp)
        )
      );
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
    // SUM across scenarios so multi-scenario cameras get correct combined totals
    const dailyRows = sqlite.prepare(`
      SELECT day_start, SUM(max_value) as max_value, MAX(metadata) as metadata
      FROM analytics_daily_summary
      WHERE camera_id = ? AND event_type = ? AND day_start >= ? AND day_start <= ?
      GROUP BY day_start
    `).all(cameraId, eventType, startTs, endTs) as Array<{ day_start: number; max_value: number; metadata: string | null }>;

    for (const row of dailyRows) {
      const d = new Date(row.day_start * 1000);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let meta: Record<string, any> | undefined;
      if (row.metadata) { try { meta = JSON.parse(row.metadata); } catch {} }
      dailyMap.set(dateKey, { total: row.max_value ?? 0, metadata: meta });
    }

    // 2. Fetch from hourly summary table (data 6h–48h old)
    // SUM across scenarios per hour, then JS loop takes max hourly value per day
    const hourlyRows = sqlite.prepare(`
      SELECT hour_start, SUM(max_value) as max_value, MAX(metadata) as metadata
      FROM analytics_hourly_summary
      WHERE camera_id = ? AND event_type = ? AND hour_start >= ? AND hour_start <= ?
      GROUP BY hour_start
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

    // 3. Fetch from raw events table (recent data < 6h, not yet rolled up).
    // Group by timestamp first and SUM values — multiple scenarios can produce
    // the same eventType at the same timestamp. Then take the MAX summed value
    // per day (cumulative counters grow through the day).
    const rawEvents = await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.cameraId, cameraId),
          eq(analyticsEvents.eventType, eventType),
          gte(analyticsEvents.timestamp, new Date(startTs * 1000)),
          lte(analyticsEvents.timestamp, new Date(endTs * 1000))
        )
      )
      .orderBy(analyticsEvents.timestamp);

    // Deduplicate by (scenario, timestamp) — keep highest value per scenario at
    // each timestamp — then sum across unique scenarios at each timestamp.
    // This prevents duplicate rows from inflating the combined total.
    const perScenarioTs = new Map<string, Map<number, { value: number; metadata?: Record<string, any> }>>();
    for (const evt of rawEvents) {
      const scenario = (evt.metadata as Record<string, any>)?.scenario || "default";
      const ts = evt.timestamp.getTime();
      if (!perScenarioTs.has(scenario)) perScenarioTs.set(scenario, new Map());
      const tsMap = perScenarioTs.get(scenario)!;
      const existing = tsMap.get(ts);
      if (!existing || evt.value > existing.value) {
        tsMap.set(ts, { value: evt.value, metadata: evt.metadata ?? undefined });
      }
    }

    // Sum across scenarios at each timestamp to get the combined total
    const perTimestamp = new Map<number, { sum: number; metadata?: Record<string, any> }>();
    perScenarioTs.forEach((tsMap) => {
      tsMap.forEach((data, ts) => {
        const existing = perTimestamp.get(ts);
        if (existing) {
          existing.sum += data.value;
        } else {
          perTimestamp.set(ts, { sum: data.value, metadata: data.metadata });
        }
      });
    });

    perTimestamp.forEach((data, ts) => {
      const d = new Date(ts);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const existing = dailyMap.get(dateKey);
      if (!existing || data.sum > existing.total) {
        dailyMap.set(dateKey, { total: data.sum, metadata: data.metadata });
      }
    });

    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getAnalyticsDailyTotalsByScenario(
    cameraId: string,
    eventType: string,
    days: number
  ): Promise<Record<string, Array<{ date: string; total: number; metadata?: Record<string, any> }>>> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    // scenarioMap: scenario -> dateKey -> { total, metadata }
    const scenarioMap = new Map<string, Map<string, { total: number; metadata?: Record<string, any> }>>();

    function ensureScenario(scenario: string) {
      if (!scenarioMap.has(scenario)) scenarioMap.set(scenario, new Map());
      return scenarioMap.get(scenario)!;
    }

    // 1. Daily summaries (oldest data, > 48h)
    const dailyRows = sqlite.prepare(`
      SELECT day_start, max_value, metadata, COALESCE(scenario, 'default') AS scenario
      FROM analytics_daily_summary
      WHERE camera_id = ? AND event_type = ? AND day_start >= ? AND day_start <= ?
    `).all(cameraId, eventType, startTs, endTs) as Array<{ day_start: number; max_value: number; metadata: string | null; scenario: string }>;

    for (const row of dailyRows) {
      const d = new Date(row.day_start * 1000);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let meta: Record<string, any> | undefined;
      if (row.metadata) { try { meta = JSON.parse(row.metadata); } catch {} }
      const dmap = ensureScenario(row.scenario);
      dmap.set(dateKey, { total: row.max_value ?? 0, metadata: meta });
    }

    // 2. Hourly summaries (6h–48h)
    const hourlyRows = sqlite.prepare(`
      SELECT hour_start, max_value, metadata, COALESCE(scenario, 'default') AS scenario
      FROM analytics_hourly_summary
      WHERE camera_id = ? AND event_type = ? AND hour_start >= ? AND hour_start <= ?
    `).all(cameraId, eventType, startTs, endTs) as Array<{ hour_start: number; max_value: number; metadata: string | null; scenario: string }>;

    for (const row of hourlyRows) {
      const d = new Date(row.hour_start * 1000);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hourMax = row.max_value ?? 0;
      const dmap = ensureScenario(row.scenario);
      const existing = dmap.get(dateKey);
      if (!existing || hourMax > existing.total) {
        let meta: Record<string, any> | undefined;
        if (row.metadata) { try { meta = JSON.parse(row.metadata); } catch {} }
        dmap.set(dateKey, { total: hourMax, metadata: meta });
      }
    }

    // 3. Raw events (< 6h, not yet rolled up) — group by scenario
    const rawEvents = await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.cameraId, cameraId),
          eq(analyticsEvents.eventType, eventType),
          gte(analyticsEvents.timestamp, new Date(startTs * 1000)),
          lte(analyticsEvents.timestamp, new Date(endTs * 1000))
        )
      )
      .orderBy(analyticsEvents.timestamp);

    // Group by (scenario, timestamp) then take max per (scenario, day)
    const perScenarioTs = new Map<string, Map<number, { value: number; metadata?: Record<string, any> }>>();
    for (const evt of rawEvents) {
      const scenario = (evt.metadata as Record<string, any>)?.scenario || "default";
      if (!perScenarioTs.has(scenario)) perScenarioTs.set(scenario, new Map());
      const tsMap = perScenarioTs.get(scenario)!;
      const ts = evt.timestamp.getTime();
      const existing = tsMap.get(ts);
      if (!existing || evt.value > existing.value) {
        tsMap.set(ts, { value: evt.value, metadata: evt.metadata ?? undefined });
      }
    }

    perScenarioTs.forEach((tsMap, scenario) => {
      const dmap = ensureScenario(scenario);
      tsMap.forEach((data, ts) => {
        const d = new Date(ts);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const existing = dmap.get(dateKey);
        if (!existing || data.value > existing.total) {
          dmap.set(dateKey, { total: data.value, metadata: data.metadata });
        }
      });
    });

    // Convert to result format
    const result: Record<string, Array<{ date: string; total: number; metadata?: Record<string, any> }>> = {};
    scenarioMap.forEach((dmap, scenario) => {
      result[scenario] = Array.from(dmap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));
    });
    return result;
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

    // Use raw SQL to get the SUM of values at the latest timestamp per camera+type.
    // Multiple scenarios can produce the same event_type at the same timestamp
    // (e.g., two crossline scenarios both producing line_crossing). Summing
    // ensures the total across all scenarios is returned.
    const placeholders = cameraIds.map(() => "?").join(",");
    const typePlaceholders = eventTypes.map(() => "?").join(",");

    const rows = sqlite.prepare(`
      SELECT camera_id, event_type, SUM(value) as value, metadata
      FROM analytics_events ae
      WHERE camera_id IN (${placeholders})
        AND event_type IN (${typePlaceholders})
        AND timestamp = (
          SELECT MAX(ae2.timestamp)
          FROM analytics_events ae2
          WHERE ae2.camera_id = ae.camera_id AND ae2.event_type = ae.event_type
        )
      GROUP BY camera_id, event_type
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
        // Sum across all scenarios for this camera (group view aggregates)
        const scenarioEvents = await this.getLatestAnalyticsEventsByScenario(camera.id, "occupancy");
        const occupancy = scenarioEvents.reduce((sum, e) => sum + e.value, 0);
        return {
          id: camera.id,
          name: camera.name,
          occupancy,
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
    _startDate: Date,
    _endDate: Date
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
        // Sum across all scenarios per camera for group view.
        // getLatestAnalyticsEventsByScenario returns all events at the latest
        // timestamp, so each scenario's value is included in the total.
        const [inEvents, outEvents] = await Promise.all([
          this.getLatestAnalyticsEventsByScenario(camera.id, "people_in"),
          this.getLatestAnalyticsEventsByScenario(camera.id, "people_out"),
        ]);
        const cameraOcc = occupancyData.cameras.find((c) => c.id === camera.id);

        let cameraIn = inEvents.reduce((sum, e) => sum + e.value, 0);
        let cameraOut = outEvents.reduce((sum, e) => sum + e.value, 0);

        // Fallback: crossline-only cameras store in/out in line_crossing metadata
        if (cameraIn === 0 && cameraOut === 0) {
          const lcEvents = await this.getLatestAnalyticsEventsByScenario(camera.id, "line_crossing");
          for (const lc of lcEvents) {
            const meta = lc.metadata as Record<string, any> | null;
            if (meta?.in !== undefined) cameraIn += Number(meta.in);
            if (meta?.out !== undefined) cameraOut += Number(meta.out);
          }
        }

        return {
          id: camera.id,
          name: camera.name,
          in: cameraIn,
          out: cameraOut,
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

  // User management operations
  async getAllUsers(): Promise<SafeUser[]> {
    const allUsers = await db.select().from(users).orderBy(users.createdAt);
    return allUsers.map(sanitizeUser);
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
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
    settings: Partial<Pick<UserSettings, 'pollingInterval' | 'dataRetentionDays' | 'emailNotifications' | 'defaultCertValidationMode' | 'globalCaCert'>>
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

  async getAllCameras(): Promise<Camera[]> {
    return db.select().from(cameras);
  }

  // Per-user data retention cleanup — deletes events only for specific cameras
  async deleteOldUptimeEventsForCameras(cameraIds: string[], beforeDate: Date): Promise<number> {
    if (cameraIds.length === 0) return 0;
    let totalDeleted = 0;
    const BATCH_SIZE = 10000;
    const placeholders = cameraIds.map(() => '?').join(',');
    const ts = Math.floor(beforeDate.getTime() / 1000);
    while (true) {
      const result = sqlite.prepare(
        `DELETE FROM uptime_events WHERE rowid IN (SELECT rowid FROM uptime_events WHERE camera_id IN (${placeholders}) AND timestamp <= ? LIMIT ?)`
      ).run(...cameraIds, ts, BATCH_SIZE);
      totalDeleted += result.changes;
      if (result.changes < BATCH_SIZE) break;
    }
    return totalDeleted;
  }

  async deleteOldAnalyticsEventsForCameras(cameraIds: string[], beforeDate: Date): Promise<number> {
    if (cameraIds.length === 0) return 0;
    let totalDeleted = 0;
    const BATCH_SIZE = 10000;
    const placeholders = cameraIds.map(() => '?').join(',');
    const ts = Math.floor(beforeDate.getTime() / 1000);
    while (true) {
      const result = sqlite.prepare(
        `DELETE FROM analytics_events WHERE rowid IN (SELECT rowid FROM analytics_events WHERE camera_id IN (${placeholders}) AND timestamp <= ? LIMIT ?)`
      ).run(...cameraIds, ts, BATCH_SIZE);
      totalDeleted += result.changes;
      if (result.changes < BATCH_SIZE) break;
    }
    return totalDeleted;
  }

  // Data retention cleanup — batched deletes to avoid long write locks (legacy global method)
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
