/**
 * Storage Model Extension
 *
 * This module extends the DatabaseStorage class with model-related methods.
 *
 * PREREQUISITES:
 * - Schema must be updated with model, detectedAt, and capabilities fields
 * - See: docs/storage-model-extension-plan.md
 *
 * INTEGRATION:
 * Once schema is updated, merge these methods into server/storage.ts
 */

import { db } from "./db";
import { cameras, type Camera } from "@shared/schema";
import { eq, isNull, sql, desc } from "drizzle-orm";

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

/**
 * Model-related storage methods
 * These methods should be added to the DatabaseStorage class in storage.ts
 */
export class ModelStorageMethods {
  /**
   * Update camera model information after detection
   *
   * @param cameraId - Camera ID
   * @param modelData - Model name and optional capabilities
   * @returns Updated camera or undefined if not found
   *
   * @example
   * await storage.updateCameraModel("cam-123", {
   *   model: "AXIS M3046-V",
   *   capabilities: { ptz: false, audio: true, resolution: "1920x1080" }
   * });
   */
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

  /**
   * Retrieve camera model information
   *
   * @param cameraId - Camera ID
   * @returns Model info or null if not detected
   *
   * @example
   * const modelInfo = await storage.getCameraModel("cam-123");
   * if (modelInfo) {
   *   console.log(`Model: ${modelInfo.model}`);
   * }
   */
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

  /**
   * Find cameras that need model detection
   *
   * @param userId - Optional user ID filter
   * @returns Array of cameras without model information
   *
   * @example
   * const needDetection = await storage.getCamerasWithoutModel();
   * console.log(`${needDetection.length} cameras need model detection`);
   */
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
            sql`${cameras.model} IS NULL AND ${cameras.userId} = ${userId}`
          )
          .orderBy(cameras.createdAt);
      }

      return await query;
    } catch (error) {
      console.error('Error getting cameras without model:', error);
      throw new Error(`Failed to get cameras without model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update camera capabilities (merge or replace)
   *
   * @param cameraId - Camera ID
   * @param capabilities - New capabilities
   * @param merge - If true, deep merge with existing; if false, replace
   * @returns Updated camera or undefined if not found
   *
   * @example
   * // Merge new capabilities
   * await storage.updateCameraCapabilities("cam-123", {
   *   ir: true,
   *   weatherproof: true
   * }, true);
   *
   * // Replace all capabilities
   * await storage.updateCameraCapabilities("cam-123", {
   *   ptz: false,
   *   audio: true
   * }, false);
   */
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
        } as any)
        .where(eq(cameras.id, cameraId))
        .returning();

      return updated;
    } catch (error) {
      console.error(`Error updating camera capabilities for ${cameraId}:`, error);
      throw new Error(`Failed to update camera capabilities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Query cameras by model name
   *
   * @param modelName - Model name (case-insensitive)
   * @param userId - Optional user ID filter
   * @returns Array of cameras with matching model
   *
   * @example
   * const axisCameras = await storage.getCamerasByModel("AXIS M3046-V");
   * console.log(`Found ${axisCameras.length} AXIS M3046-V cameras`);
   */
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
            sql`LOWER(${cameras.model}) = LOWER(${modelName}) AND ${cameras.userId} = ${userId}`
          )
          .orderBy(cameras.name);
      }

      return await query;
    } catch (error) {
      console.error(`Error getting cameras by model ${modelName}:`, error);
      throw new Error(`Failed to get cameras by model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find cameras with specific capability
   *
   * @param capabilityName - Capability key name
   * @param capabilityValue - Optional value to match
   * @param userId - Optional user ID filter
   * @returns Array of cameras with matching capability
   *
   * @example
   * // All PTZ cameras
   * const ptzCameras = await storage.getCamerasByCapability("ptz", true);
   *
   * // All cameras with audio capability (any value)
   * const audioCameras = await storage.getCamerasByCapability("audio");
   */
  async getCamerasByCapability(
    capabilityName: string,
    capabilityValue?: any,
    userId?: string
  ): Promise<Camera[]> {
    try {
      // Build WHERE clause based on whether we're checking value
      let whereClause;

      if (capabilityValue !== undefined) {
        // Check for specific capability value
        whereClause = sql`json_extract(${cameras.capabilities}, '$.${sql.raw(capabilityName)}') = ${JSON.stringify(capabilityValue)}`;
      } else {
        // Check for capability existence (not null)
        whereClause = sql`json_extract(${cameras.capabilities}, '$.${sql.raw(capabilityName)}') IS NOT NULL`;
      }

      // Add user filter if provided
      if (userId) {
        whereClause = sql`${whereClause} AND ${cameras.userId} = ${userId}`;
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
}

// Export singleton instance for testing
export const modelStorage = new ModelStorageMethods();
