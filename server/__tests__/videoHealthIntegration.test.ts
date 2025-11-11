import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkVideoStream } from '../cameraMonitor.js';

/**
 * Integration tests for video health detection
 * Tests the actual checkVideoStream function with mocked fetch responses
 */

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('Video Health Detection Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Video Checks', () => {
    it('should successfully validate JPEG snapshot', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(5000),
      });

      const result = await checkVideoStream('192.168.1.100', 'admin', 'password', 5000);

      expect(result.videoAvailable).toBe(true);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://192.168.1.100/axis-cgi/jpg/image.cgi',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'AxisCameraMonitor/1.0',
            'Authorization': expect.stringContaining('Basic'),
          }),
        })
      );
    });

    it('should encode HTTP Basic Auth credentials correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(5000),
      });

      await checkVideoStream('192.168.1.100', 'admin', 'password123', 5000);

      const expectedAuth = Buffer.from('admin:password123').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${expectedAuth}`,
          }),
        })
      );
    });

    it('should accept various image MIME types', async () => {
      const mimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];

      for (const mimeType of mimeTypes) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', mimeType]]),
          arrayBuffer: async () => new ArrayBuffer(5000),
        });

        const result = await checkVideoStream('192.168.1.100', 'admin', 'password', 5000);
        expect(result.videoAvailable).toBe(true);
      }
    });
  });

  describe('Authentication Failures', () => {
    it('should detect 401 authentication failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(
        checkVideoStream('192.168.1.100', 'admin', 'wrongpassword', 5000)
      ).rejects.toThrow('Authentication failed - invalid credentials');
    });

    it('should handle special characters in password', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(5000),
      });

      const specialPassword = 'p@$$w0rd!#%';
      await checkVideoStream('192.168.1.100', 'admin', specialPassword, 5000);

      const expectedAuth = Buffer.from(`admin:${specialPassword}`).toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${expectedAuth}`,
          }),
        })
      );
    });
  });

  describe('HTTP Error Responses', () => {
    it('should detect 404 not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        checkVideoStream('192.168.1.100', 'admin', 'password', 5000)
      ).rejects.toThrow('Video endpoint not found - camera may not support JPEG API');
    });

    it('should detect 500 server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        checkVideoStream('192.168.1.100', 'admin', 'password', 5000)
      ).rejects.toThrow('HTTP 500: Internal Server Error');
    });
  });

  describe('Content Validation', () => {
    it('should reject non-image content types', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        arrayBuffer: async () => new ArrayBuffer(5000),
      });

      await expect(
        checkVideoStream('192.168.1.100', 'admin', 'password', 5000)
      ).rejects.toThrow('Unexpected content type: text/html (expected image/*)');
    });

    it('should detect empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(0),
      });

      await expect(
        checkVideoStream('192.168.1.100', 'admin', 'password', 5000)
      ).rejects.toThrow('Empty response - no image data received');
    });

    it('should detect missing content-type header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        arrayBuffer: async () => new ArrayBuffer(5000),
      });

      await expect(
        checkVideoStream('192.168.1.100', 'admin', 'password', 5000)
      ).rejects.toThrow('Unexpected content type');
    });
  });

  describe('Network Errors', () => {
    it('should handle network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        checkVideoStream('192.168.1.100', 'admin', 'password', 5000)
      ).rejects.toThrow('Network error');
    });

    it('should handle connection refused', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        checkVideoStream('192.168.1.100', 'admin', 'password', 5000)
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('Response Time Tracking', () => {
    it('should measure response time', async () => {
      mockFetch.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'image/jpeg']]),
          arrayBuffer: async () => new ArrayBuffer(5000),
        };
      });

      const result = await checkVideoStream('192.168.1.100', 'admin', 'password', 5000);

      expect(result.responseTime).toBeGreaterThanOrEqual(100);
      expect(result.responseTime).toBeLessThan(200);
    });
  });

  describe('Camera IP Address Handling', () => {
    it('should construct correct URL for private IP', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(5000),
      });

      await checkVideoStream('192.168.1.100', 'admin', 'password', 5000);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://192.168.1.100/axis-cgi/jpg/image.cgi',
        expect.any(Object)
      );
    });

    it('should construct correct URL for public IP', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(5000),
      });

      await checkVideoStream('203.0.113.42', 'admin', 'password', 5000);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://203.0.113.42/axis-cgi/jpg/image.cgi',
        expect.any(Object)
      );
    });
  });
});
