/**
 * Unit tests for storage model extension
 *
 * PREREQUISITES:
 * - Schema must be updated with model fields before running these tests
 * - Database must be initialized with test data
 *
 * Run with: npm test -- storage-model-extension.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ModelStorageMethods } from '../storage-model-extension';
import { db } from '../db';
import { cameras, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('ModelStorageMethods', () => {
  let modelStorage: ModelStorageMethods;
  let testUserId: string;
  let testCameraId: string;

  beforeEach(async () => {
    modelStorage = new ModelStorageMethods();

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: 'test@example.com',
        password: 'hashed_password',
        firstName: 'Test',
        lastName: 'User',
      })
      .returning();
    testUserId = user.id;

    // Create test camera without model
    const [camera] = await db
      .insert(cameras)
      .values({
        userId: testUserId,
        name: 'Test Camera',
        ipAddress: '192.168.1.100',
        username: 'admin',
        encryptedPassword: 'encrypted',
      })
      .returning();
    testCameraId = camera.id;
  });

  afterEach(async () => {
    // Cleanup test data
    await db.delete(cameras).where(eq(cameras.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('updateCameraModel', () => {
    it('should update camera model and set detection timestamp', async () => {
      const result = await modelStorage.updateCameraModel(testCameraId, {
        model: 'AXIS M3046-V',
        capabilities: {
          ptz: false,
          audio: true,
          resolution: '1920x1080',
        },
      });

      expect(result).toBeDefined();
      expect(result?.model).toBe('AXIS M3046-V');
      expect(result?.detectedAt).toBeInstanceOf(Date);
      expect(result?.capabilities).toMatchObject({
        ptz: false,
        audio: true,
        resolution: '1920x1080',
      });
    });

    it('should update model without capabilities', async () => {
      const result = await modelStorage.updateCameraModel(testCameraId, {
        model: 'AXIS P1455-LE',
      });

      expect(result).toBeDefined();
      expect(result?.model).toBe('AXIS P1455-LE');
      expect(result?.detectedAt).toBeInstanceOf(Date);
    });

    it('should handle non-existent camera ID', async () => {
      const result = await modelStorage.updateCameraModel('non-existent', {
        model: 'AXIS M3046-V',
      });

      expect(result).toBeUndefined();
    });

    it('should throw error on database failure', async () => {
      // Mock database error
      const invalidCameraId = ''; // Invalid ID format

      await expect(
        modelStorage.updateCameraModel(invalidCameraId, {
          model: 'AXIS M3046-V',
        })
      ).rejects.toThrow();
    });
  });

  describe('getCameraModel', () => {
    it('should return model info for camera with model', async () => {
      // First update the camera with model info
      await modelStorage.updateCameraModel(testCameraId, {
        model: 'AXIS M3046-V',
        capabilities: { ptz: false, audio: true },
      });

      const modelInfo = await modelStorage.getCameraModel(testCameraId);

      expect(modelInfo).not.toBeNull();
      expect(modelInfo?.model).toBe('AXIS M3046-V');
      expect(modelInfo?.detectedAt).toBeInstanceOf(Date);
      expect(modelInfo?.capabilities).toMatchObject({
        ptz: false,
        audio: true,
      });
    });

    it('should return null for camera without model', async () => {
      const modelInfo = await modelStorage.getCameraModel(testCameraId);

      expect(modelInfo).toBeNull();
    });

    it('should return null for non-existent camera', async () => {
      const modelInfo = await modelStorage.getCameraModel('non-existent');

      expect(modelInfo).toBeNull();
    });
  });

  describe('getCamerasWithoutModel', () => {
    it('should return cameras without model detection', async () => {
      const cameras = await modelStorage.getCamerasWithoutModel();

      expect(cameras.length).toBeGreaterThan(0);
      expect(cameras.some(c => c.id === testCameraId)).toBe(true);
    });

    it('should not return cameras with model', async () => {
      // Update camera with model
      await modelStorage.updateCameraModel(testCameraId, {
        model: 'AXIS M3046-V',
      });

      const cameras = await modelStorage.getCamerasWithoutModel();

      expect(cameras.some(c => c.id === testCameraId)).toBe(false);
    });

    it('should filter by userId', async () => {
      const cameras = await modelStorage.getCamerasWithoutModel(testUserId);

      expect(cameras.length).toBeGreaterThan(0);
      cameras.forEach(camera => {
        expect(camera.userId).toBe(testUserId);
      });
    });

    it('should return empty array when all cameras have models', async () => {
      // Update all test cameras with models
      await modelStorage.updateCameraModel(testCameraId, {
        model: 'AXIS M3046-V',
      });

      const cameras = await modelStorage.getCamerasWithoutModel(testUserId);

      expect(cameras.length).toBe(0);
    });
  });

  describe('updateCameraCapabilities', () => {
    beforeEach(async () => {
      // Setup camera with initial capabilities
      await modelStorage.updateCameraModel(testCameraId, {
        model: 'AXIS M3046-V',
        capabilities: {
          ptz: false,
          audio: true,
          resolution: '1920x1080',
        },
      });
    });

    it('should merge capabilities by default', async () => {
      const result = await modelStorage.updateCameraCapabilities(
        testCameraId,
        {
          ir: true,
          weatherproof: true,
        },
        true
      );

      expect(result?.capabilities).toMatchObject({
        ptz: false,
        audio: true,
        resolution: '1920x1080',
        ir: true,
        weatherproof: true,
      });
    });

    it('should replace capabilities when merge is false', async () => {
      const result = await modelStorage.updateCameraCapabilities(
        testCameraId,
        {
          ir: true,
          weatherproof: true,
        },
        false
      );

      expect(result?.capabilities).toEqual({
        ir: true,
        weatherproof: true,
      });
      expect(result?.capabilities).not.toHaveProperty('ptz');
    });

    it('should handle nested capability objects', async () => {
      const result = await modelStorage.updateCameraCapabilities(
        testCameraId,
        {
          video: {
            codec: 'H.264',
            fps: 30,
          },
        },
        true
      );

      expect(result?.capabilities).toMatchObject({
        ptz: false,
        audio: true,
        video: {
          codec: 'H.264',
          fps: 30,
        },
      });
    });

    it('should handle empty capabilities object', async () => {
      const result = await modelStorage.updateCameraCapabilities(
        testCameraId,
        {},
        true
      );

      expect(result?.capabilities).toMatchObject({
        ptz: false,
        audio: true,
        resolution: '1920x1080',
      });
    });
  });

  describe('getCamerasByModel', () => {
    beforeEach(async () => {
      // Create multiple test cameras with different models
      await modelStorage.updateCameraModel(testCameraId, {
        model: 'AXIS M3046-V',
      });

      const [camera2] = await db
        .insert(cameras)
        .values({
          userId: testUserId,
          name: 'Test Camera 2',
          ipAddress: '192.168.1.101',
          username: 'admin',
          encryptedPassword: 'encrypted',
        })
        .returning();

      await modelStorage.updateCameraModel(camera2.id, {
        model: 'AXIS P1455-LE',
      });
    });

    it('should find cameras by exact model name', async () => {
      const cameras = await modelStorage.getCamerasByModel('AXIS M3046-V');

      expect(cameras.length).toBeGreaterThan(0);
      cameras.forEach(camera => {
        expect(camera.model).toBe('AXIS M3046-V');
      });
    });

    it('should be case-insensitive', async () => {
      const cameras = await modelStorage.getCamerasByModel('axis m3046-v');

      expect(cameras.length).toBeGreaterThan(0);
      cameras.forEach(camera => {
        expect(camera.model?.toLowerCase()).toBe('axis m3046-v');
      });
    });

    it('should filter by userId', async () => {
      const cameras = await modelStorage.getCamerasByModel(
        'AXIS M3046-V',
        testUserId
      );

      expect(cameras.length).toBeGreaterThan(0);
      cameras.forEach(camera => {
        expect(camera.userId).toBe(testUserId);
        expect(camera.model).toBe('AXIS M3046-V');
      });
    });

    it('should return empty array for non-existent model', async () => {
      const cameras = await modelStorage.getCamerasByModel('NonExistentModel');

      expect(cameras.length).toBe(0);
    });
  });

  describe('getCamerasByCapability', () => {
    beforeEach(async () => {
      // Setup cameras with different capabilities
      await modelStorage.updateCameraModel(testCameraId, {
        model: 'AXIS M3046-V',
        capabilities: {
          ptz: true,
          audio: true,
          ir: true,
        },
      });

      const [camera2] = await db
        .insert(cameras)
        .values({
          userId: testUserId,
          name: 'Test Camera 2',
          ipAddress: '192.168.1.101',
          username: 'admin',
          encryptedPassword: 'encrypted',
        })
        .returning();

      await modelStorage.updateCameraModel(camera2.id, {
        model: 'AXIS P1455-LE',
        capabilities: {
          ptz: false,
          audio: true,
          weatherproof: true,
        },
      });
    });

    it('should find cameras with specific capability value', async () => {
      const ptzCameras = await modelStorage.getCamerasByCapability('ptz', true);

      expect(ptzCameras.length).toBeGreaterThan(0);
      ptzCameras.forEach(camera => {
        expect(camera.capabilities?.ptz).toBe(true);
      });
    });

    it('should find cameras with capability regardless of value', async () => {
      const audioCameras = await modelStorage.getCamerasByCapability('audio');

      expect(audioCameras.length).toBeGreaterThan(0);
      audioCameras.forEach(camera => {
        expect(camera.capabilities).toHaveProperty('audio');
      });
    });

    it('should filter by userId', async () => {
      const cameras = await modelStorage.getCamerasByCapability(
        'audio',
        true,
        testUserId
      );

      expect(cameras.length).toBeGreaterThan(0);
      cameras.forEach(camera => {
        expect(camera.userId).toBe(testUserId);
        expect(camera.capabilities?.audio).toBe(true);
      });
    });

    it('should return empty array for non-existent capability', async () => {
      const cameras = await modelStorage.getCamerasByCapability(
        'nonExistentCapability'
      );

      expect(cameras.length).toBe(0);
    });

    it('should handle boolean capability values', async () => {
      const noPtzCameras = await modelStorage.getCamerasByCapability(
        'ptz',
        false
      );

      expect(noPtzCameras.length).toBeGreaterThan(0);
      noPtzCameras.forEach(camera => {
        expect(camera.capabilities?.ptz).toBe(false);
      });
    });
  });
});
