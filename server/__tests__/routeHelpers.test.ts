import { describe, it, expect } from 'vitest';
import { validateId, validateDays, sanitizeString, sendError, dashboardCacheSet, dashboardCache, DASHBOARD_CACHE_TTL_MS } from '../routes/shared';

describe('Route Helpers (shared.ts)', () => {
  describe('validateId', () => {
    it('should accept valid alphanumeric IDs', () => {
      expect(validateId('camera-123')).toBe('camera-123');
      expect(validateId('abc_def')).toBe('abc_def');
      expect(validateId('ABC123')).toBe('ABC123');
    });

    it('should trim whitespace', () => {
      expect(validateId('  camera-1  ')).toBe('camera-1');
    });

    it('should reject empty or non-string input', () => {
      expect(validateId('')).toBeNull();
      expect(validateId('   ')).toBeNull();
      expect(validateId(null)).toBeNull();
      expect(validateId(undefined)).toBeNull();
      expect(validateId(123)).toBeNull();
    });

    it('should reject IDs with special characters', () => {
      expect(validateId('cam/../etc')).toBeNull();
      expect(validateId('cam;DROP')).toBeNull();
      expect(validateId('<script>')).toBeNull();
      expect(validateId('cam id')).toBeNull();
    });

    it('should reject IDs longer than 128 chars', () => {
      expect(validateId('a'.repeat(129))).toBeNull();
      expect(validateId('a'.repeat(128))).toBe('a'.repeat(128));
    });
  });

  describe('validateDays', () => {
    it('should return default for empty/undefined input', () => {
      expect(validateDays(undefined)).toBe(30);
      expect(validateDays(null)).toBe(30);
      expect(validateDays('')).toBe(30);
    });

    it('should accept custom default', () => {
      expect(validateDays(undefined, 7)).toBe(7);
    });

    it('should parse valid day values', () => {
      expect(validateDays('1')).toBe(1);
      expect(validateDays('30')).toBe(30);
      expect(validateDays('365')).toBe(365);
    });

    it('should reject out-of-range values', () => {
      expect(validateDays('0')).toEqual({ error: expect.stringContaining('between 1 and 365') });
      expect(validateDays('366')).toEqual({ error: expect.stringContaining('between 1 and 365') });
      expect(validateDays('-5')).toEqual({ error: expect.stringContaining('between 1 and 365') });
    });

    it('should reject non-integer values', () => {
      expect(validateDays('3.5')).toEqual({ error: expect.any(String) });
      expect(validateDays('abc')).toEqual({ error: expect.any(String) });
      expect(validateDays('Infinity')).toEqual({ error: expect.any(String) });
    });
  });

  describe('sanitizeString', () => {
    it('should trim and return valid strings', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
      expect(sanitizeString('camera name')).toBe('camera name');
    });

    it('should reject empty or whitespace-only strings', () => {
      expect(sanitizeString('')).toBeNull();
      expect(sanitizeString('   ')).toBeNull();
    });

    it('should reject non-string input', () => {
      expect(sanitizeString(null)).toBeNull();
      expect(sanitizeString(undefined)).toBeNull();
      expect(sanitizeString(123)).toBeNull();
    });

    it('should reject strings over 10000 chars', () => {
      expect(sanitizeString('a'.repeat(10001))).toBeNull();
      expect(sanitizeString('a'.repeat(10000))).toBe('a'.repeat(10000));
    });
  });

  describe('sendError', () => {
    it('should send status and JSON with message+error fields', () => {
      const res = {
        status: (code: number) => res,
        json: (body: any) => body,
      } as any;

      const spy = { statusCode: 0, body: null as any };
      res.status = (code: number) => { spy.statusCode = code; return res; };
      res.json = (body: any) => { spy.body = body; return body; };

      sendError(res, 400, 'Bad request');

      expect(spy.statusCode).toBe(400);
      expect(spy.body).toEqual({ message: 'Bad request', error: 'Bad request' });
    });
  });

  describe('dashboardCache', () => {
    it('should store and retrieve values', () => {
      dashboardCache.clear();
      dashboardCacheSet('test-key', { data: { cameras: 5 }, expiresAt: Date.now() + 60000 });
      expect(dashboardCache.get('test-key')?.data).toEqual({ cameras: 5 });
    });

    it('should evict expired entries when at capacity', () => {
      dashboardCache.clear();
      // Fill with expired entries
      for (let i = 0; i < 1000; i++) {
        dashboardCache.set(`expired-${i}`, { data: null, expiresAt: Date.now() - 1000 });
      }
      expect(dashboardCache.size).toBe(1000);

      // Adding one more should trigger cleanup of expired entries
      dashboardCacheSet('fresh', { data: 'new', expiresAt: Date.now() + 60000 });

      // All expired should be gone, only fresh remains
      expect(dashboardCache.size).toBe(1);
      expect(dashboardCache.get('fresh')?.data).toBe('new');
    });

    it('should clear everything if still at capacity after evicting expired', () => {
      dashboardCache.clear();
      // Fill with non-expired entries
      for (let i = 0; i < 1000; i++) {
        dashboardCache.set(`live-${i}`, { data: null, expiresAt: Date.now() + 60000 });
      }

      dashboardCacheSet('overflow', { data: 'overflow', expiresAt: Date.now() + 60000 });

      // All cleared + new entry
      expect(dashboardCache.size).toBe(1);
      expect(dashboardCache.get('overflow')?.data).toBe('overflow');
    });
  });
});
