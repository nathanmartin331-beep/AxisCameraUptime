import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Integration tests for video health detection
 * Tests the checkVideoStream function with mocked authFetch responses
 */

// Mock the dependencies that checkVideoStream imports
vi.mock('../services/digestAuth', () => ({
  authFetch: vi.fn(),
}));

vi.mock('../services/cameraUrl', () => ({
  buildCameraUrl: vi.fn((ip: string, endpoint: string, _conn?: any) => `http://${ip}${endpoint}`),
  getCameraDispatcher: vi.fn(() => undefined),
  getConnectionInfo: vi.fn(() => ({ protocol: 'http', port: 80, verifySslCert: false })),
}));

import { checkVideoStream } from '../cameraMonitor';
import { authFetch } from '../services/digestAuth';

const mockAuthFetch = vi.mocked(authFetch);

describe('Video Health Detection Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Video Checks', () => {
    it('should successfully validate JPEG snapshot', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(5000),
      } as unknown as Response);

      const result = await checkVideoStream(
        '192.168.1.100', 'admin', 'password',
        '/axis-cgi/jpg/image.cgi', 5000, '160x90'
      );

      expect(result.videoAvailable).toBe(true);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.100'),
        'admin',
        'password',
        expect.any(Object)
      );
    });

    it('should accept various image MIME types', async () => {
      const mimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];

      for (const mimeType of mimeTypes) {
        mockAuthFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers([['content-type', mimeType]]),
          arrayBuffer: async () => new ArrayBuffer(5000),
        } as unknown as Response);

        const result = await checkVideoStream(
          '192.168.1.100', 'admin', 'password',
          '/axis-cgi/jpg/image.cgi', 5000, '160x90'
        );
        expect(result.videoAvailable).toBe(true);
      }
    });
  });

  describe('Authentication Failures', () => {
    it('should detect 401 authentication failure', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
      } as unknown as Response);

      await expect(
        checkVideoStream(
          '192.168.1.100', 'admin', 'wrongpassword',
          '/axis-cgi/jpg/image.cgi', 5000, '160x90'
        )
      ).rejects.toThrow('Authentication failed - invalid credentials');
    });
  });

  describe('HTTP Error Responses', () => {
    it('should detect 404 not found', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      } as unknown as Response);

      await expect(
        checkVideoStream(
          '192.168.1.100', 'admin', 'password',
          '/axis-cgi/jpg/image.cgi', 5000, '160x90'
        )
      ).rejects.toThrow('Video endpoint not found - camera may not support JPEG API');
    });

    it('should detect 500 server error', async () => {
      // First call (thumbnail URL) returns 500, second (fallback) also returns 500
      mockAuthFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers(),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers(),
        } as unknown as Response);

      await expect(
        checkVideoStream(
          '192.168.1.100', 'admin', 'password',
          '/axis-cgi/jpg/image.cgi', 5000, '160x90'
        )
      ).rejects.toThrow('HTTP 500: Internal Server Error');
    });
  });

  describe('Content Validation', () => {
    it('should reject non-image content types', async () => {
      // First call (thumbnail) returns non-image, second (fallback) also returns non-image
      mockAuthFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers([['content-type', 'text/html']]),
          arrayBuffer: async () => new ArrayBuffer(5000),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers([['content-type', 'text/html']]),
          arrayBuffer: async () => new ArrayBuffer(5000),
        } as unknown as Response);

      await expect(
        checkVideoStream(
          '192.168.1.100', 'admin', 'password',
          '/axis-cgi/jpg/image.cgi', 5000, '160x90'
        )
      ).rejects.toThrow('Unexpected content type: text/html (expected image/*)');
    });

    it('should detect empty response', async () => {
      // Both thumbnail and fallback return empty
      mockAuthFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers([['content-type', 'image/jpeg']]),
          arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers([['content-type', 'image/jpeg']]),
          arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as Response);

      await expect(
        checkVideoStream(
          '192.168.1.100', 'admin', 'password',
          '/axis-cgi/jpg/image.cgi', 5000, '160x90'
        )
      ).rejects.toThrow('Empty response - no image data received');
    });

    it('should detect missing content-type header', async () => {
      // Both attempts return no content-type
      mockAuthFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: async () => new ArrayBuffer(5000),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: async () => new ArrayBuffer(5000),
        } as unknown as Response);

      await expect(
        checkVideoStream(
          '192.168.1.100', 'admin', 'password',
          '/axis-cgi/jpg/image.cgi', 5000, '160x90'
        )
      ).rejects.toThrow('Unexpected content type');
    });
  });

  describe('Network Errors', () => {
    it('should handle network failure', async () => {
      mockAuthFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        checkVideoStream(
          '192.168.1.100', 'admin', 'password',
          '/axis-cgi/jpg/image.cgi', 5000, '160x90'
        )
      ).rejects.toThrow('Network error');
    });

    it('should handle connection refused', async () => {
      mockAuthFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        checkVideoStream(
          '192.168.1.100', 'admin', 'password',
          '/axis-cgi/jpg/image.cgi', 5000, '160x90'
        )
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('Response Time Tracking', () => {
    it('should measure response time', async () => {
      mockAuthFetch.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          ok: true,
          status: 200,
          headers: new Headers([['content-type', 'image/jpeg']]),
          arrayBuffer: async () => new ArrayBuffer(5000),
        } as unknown as Response;
      });

      const result = await checkVideoStream(
        '192.168.1.100', 'admin', 'password',
        '/axis-cgi/jpg/image.cgi', 5000, '160x90'
      );

      expect(result.responseTime).toBeGreaterThanOrEqual(90);
      expect(result.responseTime).toBeLessThan(500);
    });
  });

  describe('Camera IP Address Handling', () => {
    it('should construct correct URL for private IP', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(5000),
      } as unknown as Response);

      await checkVideoStream(
        '192.168.1.100', 'admin', 'password',
        '/axis-cgi/jpg/image.cgi', 5000, '160x90'
      );

      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.100'),
        'admin',
        'password',
        expect.any(Object)
      );
    });

    it('should construct correct URL for public IP', async () => {
      mockAuthFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => new ArrayBuffer(5000),
      } as unknown as Response);

      await checkVideoStream(
        '203.0.113.42', 'admin', 'password',
        '/axis-cgi/jpg/image.cgi', 5000, '160x90'
      );

      expect(mockAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('203.0.113.42'),
        'admin',
        'password',
        expect.any(Object)
      );
    });
  });

  describe('Thumbnail Resolution', () => {
    it('should try thumbnail resolution first then fallback', async () => {
      // First call (with resolution param) fails, second succeeds
      mockAuthFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers(),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers([['content-type', 'image/jpeg']]),
          arrayBuffer: async () => new ArrayBuffer(5000),
        } as unknown as Response);

      const result = await checkVideoStream(
        '192.168.1.100', 'admin', 'password',
        '/axis-cgi/jpg/image.cgi', 5000, '160x90'
      );

      expect(result.videoAvailable).toBe(true);
      expect(mockAuthFetch).toHaveBeenCalledTimes(2);
      // First call should include resolution param
      expect(mockAuthFetch.mock.calls[0][0]).toContain('resolution=160x90');
      // Second call should be without resolution
      expect(mockAuthFetch.mock.calls[1][0]).not.toContain('resolution=');
    });
  });
});
