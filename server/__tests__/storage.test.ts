import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseStorage, type SafeUser } from '../storage';
import { db } from '../db';
import type { InsertUser, InsertCamera, InsertUptimeEvent, User, Camera, UptimeEvent } from '@shared/schema';

// Mock the database
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  sqlite: {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(() => ({ changes: 0 })),
      get: vi.fn(() => undefined),
    })),
  },
}));

// Mock the uptime calculator
vi.mock('../uptimeCalculator.js', () => ({
  calculateUptimeFromEvents: vi.fn((events, start, end, priorStatus) => {
    // Simple mock calculation: 100% if all events are 'online'
    const allOnline = events.every((e: any) => e.status === 'online');
    return allOnline ? 100 : 50;
  }),
}));

describe('DatabaseStorage', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    storage = new DatabaseStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('User Operations', () => {
    describe('getSafeUser', () => {
      it('should return user without password', async () => {
        const mockUser: User = {
          id: 'user-1',
          email: 'test@example.com',
          password: 'hashedPassword123',
          firstName: 'Test',
          lastName: 'User',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([mockUser]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getSafeUser('user-1');

        expect(result).toBeDefined();
        expect(result?.email).toBe('test@example.com');
        expect(result?.firstName).toBe('Test');
        expect((result as any).password).toBeUndefined();
        expect(db.select).toHaveBeenCalled();
      });

      it('should return undefined for non-existent user', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getSafeUser('nonexistent-id');

        expect(result).toBeUndefined();
      });

      it('should handle database errors', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockRejectedValue(new Error('Database error')),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        await expect(storage.getSafeUser('user-1')).rejects.toThrow('Database error');
      });
    });

    describe('getUserByEmail', () => {
      it('should return full user including password', async () => {
        const mockUser: User = {
          id: 'user-1',
          email: 'test@example.com',
          password: 'hashedPassword123',
          firstName: 'Test',
          lastName: 'User',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([mockUser]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getUserByEmail('test@example.com');

        expect(result).toBeDefined();
        expect(result?.password).toBe('hashedPassword123');
        expect(result?.email).toBe('test@example.com');
      });

      it('should return undefined for non-existent email', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getUserByEmail('nonexistent@example.com');

        expect(result).toBeUndefined();
      });

      it('should handle email case sensitivity', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        await storage.getUserByEmail('Test@Example.Com');

        expect(db.select).toHaveBeenCalled();
      });
    });

    describe('getUserById', () => {
      it('should return full user by ID', async () => {
        const mockUser: User = {
          id: 'user-1',
          email: 'test@example.com',
          password: 'hashedPassword123',
          firstName: 'Test',
          lastName: 'User',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([mockUser]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getUserById('user-1');

        expect(result).toBeDefined();
        expect(result?.id).toBe('user-1');
        expect(result?.password).toBe('hashedPassword123');
      });

      it('should return undefined for non-existent ID', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getUserById('nonexistent-id');

        expect(result).toBeUndefined();
      });
    });

    describe('createUser', () => {
      it('should create a new user and return safe user', async () => {
        const userData: InsertUser = {
          email: 'newuser@example.com',
          password: 'hashedPassword123',
          firstName: 'New',
          lastName: 'User',
        };

        const createdUser: User = {
          id: 'user-new',
          ...userData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([createdUser]),
        };
        vi.mocked(db.insert).mockReturnValue(mockQuery as any);

        const result = await storage.createUser(userData);

        expect(result).toBeDefined();
        expect(result.email).toBe('newuser@example.com');
        expect((result as any).password).toBeUndefined();
        expect(db.insert).toHaveBeenCalled();
      });

      it('should handle duplicate email error', async () => {
        const userData: InsertUser = {
          email: 'existing@example.com',
          password: 'hashedPassword123',
        };

        const mockQuery = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockRejectedValue(new Error('UNIQUE constraint failed')),
        };
        vi.mocked(db.insert).mockReturnValue(mockQuery as any);

        await expect(storage.createUser(userData)).rejects.toThrow('UNIQUE constraint failed');
      });
    });

    describe('updateUser', () => {
      it('should update user and return safe user', async () => {
        const updates: Partial<InsertUser> = {
          firstName: 'Updated',
          lastName: 'Name',
        };

        const updatedUser: User = {
          id: 'user-1',
          email: 'test@example.com',
          password: 'hashedPassword123',
          firstName: 'Updated',
          lastName: 'Name',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([updatedUser]),
        };
        vi.mocked(db.update).mockReturnValue(mockQuery as any);

        const result = await storage.updateUser('user-1', updates);

        expect(result).toBeDefined();
        expect(result.firstName).toBe('Updated');
        expect(result.lastName).toBe('Name');
        expect((result as any).password).toBeUndefined();
      });

      it('should update user password', async () => {
        const updates: Partial<InsertUser> = {
          password: 'newHashedPassword456',
        };

        const updatedUser: User = {
          id: 'user-1',
          email: 'test@example.com',
          password: 'newHashedPassword456',
          firstName: 'Test',
          lastName: 'User',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([updatedUser]),
        };
        vi.mocked(db.update).mockReturnValue(mockQuery as any);

        const result = await storage.updateUser('user-1', updates);

        expect(result).toBeDefined();
        expect((result as any).password).toBeUndefined();
      });

      it('should update updatedAt timestamp', async () => {
        const mockQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.update).mockReturnValue(mockQuery as any);

        await storage.updateUser('user-1', { firstName: 'Test' });

        expect(mockQuery.set).toHaveBeenCalledWith(
          expect.objectContaining({ updatedAt: expect.any(Date) })
        );
      });
    });
  });

  describe('Camera Operations', () => {
    describe('createCamera', () => {
      it('should create a new camera', async () => {
        const cameraData: InsertCamera = {
          userId: 'user-1',
          name: 'Front Door Camera',
          ipAddress: '192.168.1.100',
          username: 'admin',
          encryptedPassword: 'encrypted_pass',
          location: 'Front Door',
        };

        const createdCamera: Camera = {
          id: 'camera-1',
          ...cameraData,
          currentBootId: null,
          lastSeenAt: null,
          currentStatus: 'unknown',
          videoStatus: 'unknown',
          lastVideoCheck: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([createdCamera]),
        };
        vi.mocked(db.insert).mockReturnValue(mockQuery as any);

        const result = await storage.createCamera(cameraData);

        expect(result).toBeDefined();
        expect(result.name).toBe('Front Door Camera');
        expect(result.ipAddress).toBe('192.168.1.100');
      });

      it('should handle missing optional fields', async () => {
        const cameraData: InsertCamera = {
          userId: 'user-1',
          name: 'Camera',
          ipAddress: '192.168.1.100',
          username: 'admin',
          encryptedPassword: 'encrypted_pass',
        };

        const createdCamera: Camera = {
          id: 'camera-1',
          ...cameraData,
          location: null,
          notes: null,
          currentBootId: null,
          lastSeenAt: null,
          currentStatus: 'unknown',
          videoStatus: 'unknown',
          lastVideoCheck: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([createdCamera]),
        };
        vi.mocked(db.insert).mockReturnValue(mockQuery as any);

        const result = await storage.createCamera(cameraData);

        expect(result).toBeDefined();
      });
    });

    describe('getCamerasByUserId', () => {
      it('should return all cameras for a user', async () => {
        const mockCameras: Camera[] = [
          {
            id: 'camera-1',
            userId: 'user-1',
            name: 'Camera 1',
            ipAddress: '192.168.1.100',
            username: 'admin',
            encryptedPassword: 'enc1',
            location: null,
            notes: null,
            currentBootId: null,
            lastSeenAt: null,
            currentStatus: 'online',
            videoStatus: 'streaming',
            lastVideoCheck: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'camera-2',
            userId: 'user-1',
            name: 'Camera 2',
            ipAddress: '192.168.1.101',
            username: 'admin',
            encryptedPassword: 'enc2',
            location: null,
            notes: null,
            currentBootId: null,
            lastSeenAt: null,
            currentStatus: 'offline',
            videoStatus: 'no-video',
            lastVideoCheck: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockResolvedValue(mockCameras),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getCamerasByUserId('user-1');

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('Camera 1');
        expect(result[1].name).toBe('Camera 2');
      });

      it('should return empty array for user with no cameras', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getCamerasByUserId('user-no-cameras');

        expect(result).toEqual([]);
      });
    });

    describe('getCameraById', () => {
      it('should return camera by ID', async () => {
        const mockCamera: Camera = {
          id: 'camera-1',
          userId: 'user-1',
          name: 'Test Camera',
          ipAddress: '192.168.1.100',
          username: 'admin',
          encryptedPassword: 'encrypted',
          location: 'Office',
          notes: 'Test notes',
          currentBootId: 'boot-123',
          lastSeenAt: new Date(),
          currentStatus: 'online',
          videoStatus: 'streaming',
          lastVideoCheck: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([mockCamera]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getCameraById('camera-1');

        expect(result).toBeDefined();
        expect(result?.name).toBe('Test Camera');
      });

      it('should return undefined for non-existent camera', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getCameraById('nonexistent-camera');

        expect(result).toBeUndefined();
      });
    });

    describe('updateCamera', () => {
      it('should update camera details', async () => {
        const updates: Partial<InsertCamera> = {
          name: 'Updated Camera Name',
          location: 'New Location',
        };

        const updatedCamera: Camera = {
          id: 'camera-1',
          userId: 'user-1',
          name: 'Updated Camera Name',
          ipAddress: '192.168.1.100',
          username: 'admin',
          encryptedPassword: 'encrypted',
          location: 'New Location',
          notes: null,
          currentBootId: null,
          lastSeenAt: null,
          currentStatus: 'online',
          videoStatus: 'streaming',
          lastVideoCheck: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const mockQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([updatedCamera]),
        };
        vi.mocked(db.update).mockReturnValue(mockQuery as any);

        const result = await storage.updateCamera('camera-1', updates);

        expect(result).toBeDefined();
        expect(result?.name).toBe('Updated Camera Name');
        expect(result?.location).toBe('New Location');
      });

      it('should return undefined for non-existent camera', async () => {
        const mockQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.update).mockReturnValue(mockQuery as any);

        const result = await storage.updateCamera('nonexistent', { name: 'Test' });

        expect(result).toBeUndefined();
      });
    });

    describe('deleteCamera', () => {
      it('should delete camera', async () => {
        const mockQuery = {
          where: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(db.delete).mockReturnValue(mockQuery as any);

        await expect(storage.deleteCamera('camera-1')).resolves.not.toThrow();

        expect(db.delete).toHaveBeenCalled();
      });

      it('should handle deleting non-existent camera', async () => {
        const mockQuery = {
          where: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(db.delete).mockReturnValue(mockQuery as any);

        await expect(storage.deleteCamera('nonexistent')).resolves.not.toThrow();
      });
    });

    describe('updateCameraStatus', () => {
      it('should update camera status with all fields', async () => {
        const now = new Date();
        const mockQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(db.update).mockReturnValue(mockQuery as any);

        await storage.updateCameraStatus('camera-1', 'online', 'boot-123', now);

        expect(mockQuery.set).toHaveBeenCalledWith(
          expect.objectContaining({
            currentStatus: 'online',
            currentBootId: 'boot-123',
            lastSeenAt: now,
            updatedAt: expect.any(Date),
          })
        );
      });

      it('should update camera status without optional fields', async () => {
        const mockQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(db.update).mockReturnValue(mockQuery as any);

        await storage.updateCameraStatus('camera-1', 'offline');

        expect(mockQuery.set).toHaveBeenCalledWith(
          expect.objectContaining({
            currentStatus: 'offline',
            updatedAt: expect.any(Date),
          })
        );
      });
    });

    describe('updateVideoStatus', () => {
      it('should update video status with timestamp', async () => {
        const checkTime = new Date();
        const mockQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(db.update).mockReturnValue(mockQuery as any);

        await storage.updateVideoStatus('camera-1', 'streaming', checkTime);

        expect(mockQuery.set).toHaveBeenCalledWith(
          expect.objectContaining({
            videoStatus: 'streaming',
            lastVideoCheck: checkTime,
            updatedAt: expect.any(Date),
          })
        );
      });

      it('should use current time if not provided', async () => {
        const mockQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(db.update).mockReturnValue(mockQuery as any);

        await storage.updateVideoStatus('camera-1', 'no-video');

        expect(mockQuery.set).toHaveBeenCalledWith(
          expect.objectContaining({
            videoStatus: 'no-video',
            lastVideoCheck: expect.any(Date),
          })
        );
      });
    });
  });

  describe('Uptime Event Operations', () => {
    describe('createUptimeEvent', () => {
      it('should create uptime event', async () => {
        const eventData: InsertUptimeEvent = {
          cameraId: 'camera-1',
          timestamp: new Date(),
          status: 'online',
          videoStatus: 'streaming',
          uptimeSeconds: 3600,
          bootId: 'boot-123',
          responseTimeMs: 150,
        };

        const createdEvent: UptimeEvent = {
          id: 'event-1',
          ...eventData,
          errorMessage: null,
        };

        const mockQuery = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([createdEvent]),
        };
        vi.mocked(db.insert).mockReturnValue(mockQuery as any);

        const result = await storage.createUptimeEvent(eventData);

        expect(result).toBeDefined();
        expect(result.status).toBe('online');
        expect(result.uptimeSeconds).toBe(3600);
      });

      it('should create event with error message', async () => {
        const eventData: InsertUptimeEvent = {
          cameraId: 'camera-1',
          timestamp: new Date(),
          status: 'offline',
          errorMessage: 'Connection timeout',
        };

        const createdEvent: UptimeEvent = {
          id: 'event-2',
          ...eventData,
          videoStatus: null,
          uptimeSeconds: null,
          bootId: null,
          responseTimeMs: null,
        };

        const mockQuery = {
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([createdEvent]),
        };
        vi.mocked(db.insert).mockReturnValue(mockQuery as any);

        const result = await storage.createUptimeEvent(eventData);

        expect(result.errorMessage).toBe('Connection timeout');
      });
    });

    describe('getUptimeEventsByCameraId', () => {
      it('should return events for camera with default limit', async () => {
        const mockEvents: UptimeEvent[] = Array.from({ length: 50 }, (_, i) => ({
          id: `event-${i}`,
          cameraId: 'camera-1',
          timestamp: new Date(Date.now() - i * 60000),
          status: i % 2 === 0 ? 'online' : 'offline',
          videoStatus: null,
          uptimeSeconds: null,
          bootId: null,
          responseTimeMs: null,
          errorMessage: null,
        }));

        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue(mockEvents),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getUptimeEventsByCameraId('camera-1');

        expect(result).toHaveLength(50);
        expect(mockQuery.limit).toHaveBeenCalledWith(100);
      });

      it('should respect custom limit', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        await storage.getUptimeEventsByCameraId('camera-1', 10);

        expect(mockQuery.limit).toHaveBeenCalledWith(10);
      });
    });

    describe('getLatestEventBefore', () => {
      it('should return latest event before date', async () => {
        const beforeDate = new Date();
        const mockEvent: UptimeEvent = {
          id: 'event-1',
          cameraId: 'camera-1',
          timestamp: new Date(beforeDate.getTime() - 3600000),
          status: 'online',
          videoStatus: null,
          uptimeSeconds: null,
          bootId: null,
          responseTimeMs: null,
          errorMessage: null,
        };

        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([mockEvent]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getLatestEventBefore('camera-1', beforeDate);

        expect(result).toBeDefined();
        expect(result?.id).toBe('event-1');
      });

      it('should return undefined if no events before date', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getLatestEventBefore('camera-1', new Date());

        expect(result).toBeUndefined();
      });
    });

    describe('getUptimeEventsInRange', () => {
      it('should return events within date range', async () => {
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-01-02');

        const mockEvents: UptimeEvent[] = [
          {
            id: 'event-1',
            cameraId: 'camera-1',
            timestamp: new Date('2024-01-01T12:00:00'),
            status: 'online',
            videoStatus: null,
            uptimeSeconds: null,
            bootId: null,
            responseTimeMs: null,
            errorMessage: null,
          },
          {
            id: 'event-2',
            cameraId: 'camera-1',
            timestamp: new Date('2024-01-01T18:00:00'),
            status: 'offline',
            videoStatus: null,
            uptimeSeconds: null,
            bootId: null,
            responseTimeMs: null,
            errorMessage: null,
          },
        ];

        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockResolvedValue(mockEvents),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getUptimeEventsInRange('camera-1', startDate, endDate);

        expect(result).toHaveLength(2);
      });

      it('should return empty array for range with no events', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getUptimeEventsInRange(
          'camera-1',
          new Date('2024-01-01'),
          new Date('2024-01-02')
        );

        expect(result).toEqual([]);
      });
    });

    describe('calculateUptimePercentage', () => {
      // Helper: create a thenable mock query that supports both chaining and direct await.
      // Drizzle query builders are thenable — await db.select().from().where() returns rows.
      function makeMockQuery(resolveValue: any) {
        const query: any = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: any) => resolve(resolveValue)),
        };
        // Make chained methods also resolve to the same value when awaited
        for (const key of ['from', 'where', 'orderBy', 'limit']) {
          query[key].mockImplementation((..._args: any[]) => query);
        }
        return query;
      }

      it('should calculate uptime for all online events', async () => {
        // getCameraById returns undefined (no camera found → uses windowStart)
        // getUptimeEventsInRange returns 1 online event
        // getLatestEventBefore returns undefined
        let callCount = 0;
        vi.mocked(db.select).mockImplementation(() => {
          callCount++;
          if (callCount === 1) return makeMockQuery([]) as any; // getCameraById
          if (callCount === 2) return makeMockQuery([{ // getUptimeEventsInRange
            id: 'event-1', cameraId: 'camera-1', timestamp: new Date(),
            status: 'online', videoStatus: null, uptimeSeconds: null,
            bootId: null, responseTimeMs: null, errorMessage: null,
          }]) as any;
          return makeMockQuery([]) as any; // getLatestEventBefore
        });

        const result = await storage.calculateUptimePercentage('camera-1', 7);

        expect(result.percentage).toBe(100);
        expect(result.monitoredDays).toBeGreaterThanOrEqual(1);
      });

      it('should calculate mixed uptime', async () => {
        let callCount = 0;
        vi.mocked(db.select).mockImplementation(() => {
          callCount++;
          if (callCount === 1) return makeMockQuery([]) as any; // getCameraById
          if (callCount === 2) return makeMockQuery([ // getUptimeEventsInRange
            { id: 'e1', cameraId: 'camera-mixed', timestamp: new Date(), status: 'online',
              videoStatus: null, uptimeSeconds: null, bootId: null, responseTimeMs: null, errorMessage: null },
            { id: 'e2', cameraId: 'camera-mixed', timestamp: new Date(), status: 'offline',
              videoStatus: null, uptimeSeconds: null, bootId: null, responseTimeMs: null, errorMessage: null },
          ]) as any;
          return makeMockQuery([]) as any;
        });

        const result = await storage.calculateUptimePercentage('camera-mixed', 7);

        expect(result.percentage).toBe(50);
      });

      it('should handle 0 days input', async () => {
        vi.mocked(db.select).mockImplementation(() => makeMockQuery([]) as any);

        const result = await storage.calculateUptimePercentage('camera-1', 0);

        expect(result.percentage).toBeGreaterThanOrEqual(0);
        expect(result.percentage).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Dashboard Layout Operations', () => {
    describe('getDashboardLayout', () => {
      it('should return layout for user', async () => {
        const mockLayout = {
          widgets: [
            { id: 'w1', type: 'camera', x: 0, y: 0, w: 2, h: 2 },
          ],
        };

        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ layout: mockLayout }]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getDashboardLayout('user-1');

        expect(result).toEqual(mockLayout);
      });

      it('should return null for user without layout', async () => {
        const mockQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockQuery as any);

        const result = await storage.getDashboardLayout('user-no-layout');

        expect(result).toBeNull();
      });
    });

    describe('saveDashboardLayout', () => {
      it('should create new layout if none exists', async () => {
        const layout = {
          widgets: [
            { id: 'w1', type: 'camera', x: 0, y: 0, w: 2, h: 2 },
          ],
        };

        const mockSelectQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        };
        vi.mocked(db.select).mockReturnValue(mockSelectQuery as any);

        const mockInsertQuery = {
          values: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(db.insert).mockReturnValue(mockInsertQuery as any);

        const result = await storage.saveDashboardLayout('user-1', layout);

        expect(result).toEqual(layout);
        expect(db.insert).toHaveBeenCalled();
      });

      it('should update existing layout', async () => {
        const layout = {
          widgets: [
            { id: 'w1', type: 'camera', x: 0, y: 0, w: 2, h: 2 },
          ],
        };

        const mockSelectQuery = {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ id: 'layout-1' }]),
        };
        vi.mocked(db.select).mockReturnValue(mockSelectQuery as any);

        const mockUpdateQuery = {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(db.update).mockReturnValue(mockUpdateQuery as any);

        const result = await storage.saveDashboardLayout('user-1', layout);

        expect(result).toEqual(layout);
        expect(db.update).toHaveBeenCalled();
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null values gracefully', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        password: 'hash',
        firstName: null,
        lastName: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([mockUser]),
      };
      vi.mocked(db.select).mockReturnValue(mockQuery as any);

      const result = await storage.getSafeUser('user-1');

      expect(result?.firstName).toBeNull();
      expect(result?.lastName).toBeNull();
    });

    it('should handle concurrent operations', async () => {
      const mockQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(db.select).mockReturnValue(mockQuery as any);

      const promises = [
        storage.getSafeUser('user-1'),
        storage.getSafeUser('user-2'),
        storage.getSafeUser('user-3'),
      ];

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    it('should handle database connection failures', async () => {
      const mockQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('Connection lost')),
      };
      vi.mocked(db.select).mockReturnValue(mockQuery as any);

      await expect(storage.getSafeUser('user-1')).rejects.toThrow('Connection lost');
    });
  });
});
