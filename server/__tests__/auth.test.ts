import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import { hashPassword, verifyPassword, requireAuth } from '../auth';
import { storage } from '../storage';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';

// Mock dependencies
vi.mock('../storage', () => ({
  storage: {
    getUserByEmail: vi.fn(),
    getSafeUser: vi.fn(),
  },
}));

describe('Authentication Module', () => {
  describe('hashPassword', () => {
    it('should hash a password with bcrypt', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).toMatch(/^\$2[ayb]\$.{56}$/); // bcrypt hash format
    });

    it('should produce different hashes for the same password', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string password', async () => {
      const password = '';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should handle very long passwords', async () => {
      const password = 'a'.repeat(1000);
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should handle special characters in password', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(await verifyPassword(password, hash)).toBe(true);
    });

    it('should handle unicode characters in password', async () => {
      const password = '密码测试🔒🔑';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(await verifyPassword(password, hash)).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);

      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword456';
      const hash = await hashPassword(password);
      const result = await verifyPassword(wrongPassword, hash);

      expect(result).toBe(false);
    });

    it('should be case-sensitive', async () => {
      const password = 'TestPassword123';
      const hash = await hashPassword(password);
      const result = await verifyPassword('testpassword123', hash);

      expect(result).toBe(false);
    });

    it('should handle empty string verification', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      const result = await verifyPassword('', hash);

      expect(result).toBe(false);
    });

    it('should return false for invalid hash format', async () => {
      const password = 'testPassword123';
      const invalidHash = 'not-a-valid-hash';

      await expect(verifyPassword(password, invalidHash)).rejects.toThrow();
    });

    it('should handle whitespace differences', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);
      const result1 = await verifyPassword('testPassword123 ', hash);
      const result2 = await verifyPassword(' testPassword123', hash);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe('Passport LocalStrategy', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should authenticate user with correct credentials', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        password: await hashPassword('correctPassword'),
        firstName: 'Test',
        lastName: 'User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(storage.getUserByEmail).mockResolvedValue(mockUser);

      // Get the LocalStrategy verify callback
      const localStrategy = passport._strategies.local;
      const verifyCallback = localStrategy._verify;

      let authResult: any;
      let authError: any;
      let authInfo: any;

      await new Promise<void>((resolve) => {
        verifyCallback(
          'test@example.com',
          'correctPassword',
          (err: any, user: any, info: any) => {
            authError = err;
            authResult = user;
            authInfo = info;
            resolve();
          }
        );
      });

      expect(authError).toBeNull();
      expect(authResult).toBeDefined();
      expect(authResult.email).toBe('test@example.com');
      expect(authResult.password).toBeUndefined(); // Password should be stripped
      expect(storage.getUserByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should reject authentication with incorrect password', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        password: await hashPassword('correctPassword'),
        firstName: 'Test',
        lastName: 'User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(storage.getUserByEmail).mockResolvedValue(mockUser);

      const localStrategy = passport._strategies.local;
      const verifyCallback = localStrategy._verify;

      let authResult: any;
      let authError: any;
      let authInfo: any;

      await new Promise<void>((resolve) => {
        verifyCallback(
          'test@example.com',
          'wrongPassword',
          (err: any, user: any, info: any) => {
            authError = err;
            authResult = user;
            authInfo = info;
            resolve();
          }
        );
      });

      expect(authError).toBeNull();
      expect(authResult).toBe(false);
      expect(authInfo).toEqual({ message: 'Invalid email or password' });
    });

    it('should reject authentication for non-existent user', async () => {
      vi.mocked(storage.getUserByEmail).mockResolvedValue(undefined);

      const localStrategy = passport._strategies.local;
      const verifyCallback = localStrategy._verify;

      let authResult: any;
      let authError: any;
      let authInfo: any;

      await new Promise<void>((resolve) => {
        verifyCallback(
          'nonexistent@example.com',
          'anyPassword',
          (err: any, user: any, info: any) => {
            authError = err;
            authResult = user;
            authInfo = info;
            resolve();
          }
        );
      });

      expect(authError).toBeNull();
      expect(authResult).toBe(false);
      expect(authInfo).toEqual({ message: 'Invalid email or password' });
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      vi.mocked(storage.getUserByEmail).mockRejectedValue(dbError);

      const localStrategy = passport._strategies.local;
      const verifyCallback = localStrategy._verify;

      let authResult: any;
      let authError: any;
      let authInfo: any;

      await new Promise<void>((resolve) => {
        verifyCallback(
          'test@example.com',
          'anyPassword',
          (err: any, user: any, info: any) => {
            authError = err;
            authResult = user;
            authInfo = info;
            resolve();
          }
        );
      });

      expect(authError).toBe(dbError);
    });
  });

  describe('Passport serializeUser', () => {
    it('should serialize user by ID', (done) => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
      };

      passport.serializeUser(mockUser as any, (err, id) => {
        expect(err).toBeNull();
        expect(id).toBe('user-123');
        done();
      });
    });

    it('should handle user without ID', (done) => {
      const mockUser = {
        email: 'test@example.com',
      };

      passport.serializeUser(mockUser as any, (err, id) => {
        expect(id).toBeUndefined();
        done();
      });
    });
  });

  describe('Passport deserializeUser', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should deserialize user from ID', (done) => {
      const mockSafeUser = {
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(storage.getSafeUser).mockResolvedValue(mockSafeUser);

      passport.deserializeUser('user-123', (err, user) => {
        expect(err).toBeNull();
        expect(user).toEqual(mockSafeUser);
        expect(storage.getSafeUser).toHaveBeenCalledWith('user-123');
        done();
      });
    });

    it('should handle user not found', (done) => {
      vi.mocked(storage.getSafeUser).mockResolvedValue(undefined);

      passport.deserializeUser('nonexistent-id', (err, user) => {
        expect(err).toBeNull();
        expect(user).toBeUndefined();
        done();
      });
    });

    it('should handle database errors', (done) => {
      const dbError = new Error('Database error');
      vi.mocked(storage.getSafeUser).mockRejectedValue(dbError);

      passport.deserializeUser('user-123', (err, user) => {
        expect(err).toBe(dbError);
        done();
      });
    });
  });

  describe('requireAuth middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        isAuthenticated: vi.fn(),
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      mockNext = vi.fn();
    });

    it('should call next() for authenticated user', () => {
      vi.mocked(mockReq.isAuthenticated!).mockReturnValue(true);

      requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should return 401 for unauthenticated user', () => {
      vi.mocked(mockReq.isAuthenticated!).mockReturnValue(false);

      requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Authentication required',
      });
    });

    it('should handle missing isAuthenticated method', () => {
      mockReq.isAuthenticated = undefined;

      requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Authentication required',
      });
    });
  });

  describe('Integration: Password hash and verify cycle', () => {
    it('should successfully hash and verify multiple passwords', async () => {
      const passwords = [
        'simplePassword',
        'Complex!Pass@123',
        '12345678',
        'with spaces in it',
        '密码🔒',
      ];

      for (const password of passwords) {
        const hash = await hashPassword(password);
        const isValid = await verifyPassword(password, hash);
        expect(isValid).toBe(true);
      }
    });

    it('should maintain security with rapid hash generation', async () => {
      const password = 'testPassword123';
      const hashes = await Promise.all([
        hashPassword(password),
        hashPassword(password),
        hashPassword(password),
      ]);

      // All hashes should be different
      expect(hashes[0]).not.toBe(hashes[1]);
      expect(hashes[1]).not.toBe(hashes[2]);
      expect(hashes[0]).not.toBe(hashes[2]);

      // All should verify correctly
      for (const hash of hashes) {
        expect(await verifyPassword(password, hash)).toBe(true);
      }
    });
  });

  describe('Security edge cases', () => {
    it('should handle SQL injection attempts in password', async () => {
      const maliciousPassword = "'; DROP TABLE users; --";
      const hash = await hashPassword(maliciousPassword);

      expect(await verifyPassword(maliciousPassword, hash)).toBe(true);
      expect(await verifyPassword('normalPassword', hash)).toBe(false);
    });

    it('should handle XSS attempts in password', async () => {
      const xssPassword = '<script>alert("xss")</script>';
      const hash = await hashPassword(xssPassword);

      expect(await verifyPassword(xssPassword, hash)).toBe(true);
    });

    it('should handle null bytes in password', async () => {
      const nullBytePassword = 'password\0secret';
      const hash = await hashPassword(nullBytePassword);

      expect(await verifyPassword(nullBytePassword, hash)).toBe(true);
      expect(await verifyPassword('password', hash)).toBe(false);
    });
  });
});
