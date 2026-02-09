import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authFetch } from '../services/digestAuth';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Digest Authentication Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authFetch - Basic auth success path', () => {
    it('should succeed with Basic auth on first attempt (200)', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      const response = await authFetch(
        'http://192.168.1.10/axis-cgi/systemready.cgi',
        'admin',
        'pass123'
      );

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify Basic auth header was sent
      const callArgs = mockFetch.mock.calls[0];
      const headers = callArgs[1].headers;
      const expectedBasic = Buffer.from('admin:pass123').toString('base64');
      expect(headers.Authorization).toBe(`Basic ${expectedBasic}`);
    });

    it('should include User-Agent header', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      await authFetch('http://192.168.1.10/test', 'admin', 'pass');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['User-Agent']).toBe('AxisCameraMonitor/2.0');
    });

    it('should pass through custom method', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      await authFetch('http://192.168.1.10/test', 'admin', 'pass', {
        method: 'POST',
        body: '{"test": true}',
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].body).toBe('{"test": true}');
    });

    it('should pass through custom headers', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      await authFetch('http://192.168.1.10/test', 'admin', 'pass', {
        headers: { 'Content-Type': 'application/json' },
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    });

    it('should pass through dispatcher option for HTTPS', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      const mockDispatcher = { connect: {} };
      await authFetch('https://192.168.1.10/test', 'admin', 'pass', {
        dispatcher: mockDispatcher,
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].dispatcher).toBe(mockDispatcher);
    });
  });

  describe('authFetch - Digest auth fallback on 401', () => {
    it('should retry with Digest auth when 401 includes Digest challenge', async () => {
      // First call returns 401 with Digest challenge
      const challengeHeaders = new Headers();
      challengeHeaders.set(
        'www-authenticate',
        'Digest realm="AXIS_00408C123456", nonce="abc123def", qop="auth"'
      );
      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, headers: challengeHeaders })
      );

      // Second call (with Digest) returns 200
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      const response = await authFetch(
        'http://192.168.1.10/axis-cgi/param.cgi?action=list',
        'admin',
        'pass123'
      );

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify second call has Digest Authorization header
      const secondCallArgs = mockFetch.mock.calls[1];
      const authHeader = secondCallArgs[1].headers.Authorization;
      expect(authHeader).toMatch(/^Digest /);
      expect(authHeader).toContain('username="admin"');
      expect(authHeader).toContain('realm="AXIS_00408C123456"');
      expect(authHeader).toContain('nonce="abc123def"');
      expect(authHeader).toContain('qop=auth');
      expect(authHeader).toContain('response="');
      expect(authHeader).toContain('uri="/axis-cgi/param.cgi?action=list"');
    });

    it('should return 401 response if no WWW-Authenticate header', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 })
      );

      const response = await authFetch(
        'http://192.168.1.10/test',
        'admin',
        'wrong'
      );

      expect(response.status).toBe(401);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return 401 response if WWW-Authenticate is not Digest', async () => {
      const headers = new Headers();
      headers.set('www-authenticate', 'Bearer realm="camera"');
      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, headers })
      );

      const response = await authFetch(
        'http://192.168.1.10/test',
        'admin',
        'pass'
      );

      expect(response.status).toBe(401);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return 401 if Digest challenge is malformed (missing realm/nonce)', async () => {
      const headers = new Headers();
      headers.set('www-authenticate', 'Digest opaque="something"');
      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, headers })
      );

      const response = await authFetch(
        'http://192.168.1.10/test',
        'admin',
        'pass'
      );

      expect(response.status).toBe(401);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle Digest challenge without qop', async () => {
      const challengeHeaders = new Headers();
      challengeHeaders.set(
        'www-authenticate',
        'Digest realm="AXIS_CAM", nonce="xyz789"'
      );
      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, headers: challengeHeaders })
      );

      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      const response = await authFetch(
        'http://192.168.1.10/axis-cgi/basicdeviceinfo.cgi',
        'root',
        'password'
      );

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify Digest header without qop fields
      const authHeader = mockFetch.mock.calls[1][1].headers.Authorization;
      expect(authHeader).toMatch(/^Digest /);
      expect(authHeader).toContain('username="root"');
      expect(authHeader).not.toContain('qop=');
      expect(authHeader).not.toContain('cnonce=');
      expect(authHeader).not.toContain('nc=');
    });

    it('should include opaque if present in challenge', async () => {
      const challengeHeaders = new Headers();
      challengeHeaders.set(
        'www-authenticate',
        'Digest realm="CAM", nonce="n1", opaque="op123"'
      );
      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, headers: challengeHeaders })
      );
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      await authFetch('http://192.168.1.10/test', 'admin', 'pass');

      const authHeader = mockFetch.mock.calls[1][1].headers.Authorization;
      expect(authHeader).toContain('opaque="op123"');
    });

    it('should preserve dispatcher on Digest retry', async () => {
      const challengeHeaders = new Headers();
      challengeHeaders.set(
        'www-authenticate',
        'Digest realm="CAM", nonce="n1", qop="auth"'
      );
      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, headers: challengeHeaders })
      );
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      const mockDispatcher = { connect: {} };
      await authFetch('https://192.168.1.10/test', 'admin', 'pass', {
        dispatcher: mockDispatcher,
      });

      expect(mockFetch.mock.calls[1][1].dispatcher).toBe(mockDispatcher);
    });
  });

  describe('authFetch - Non-401 responses', () => {
    it('should return non-401 errors directly without retry', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Not Found', { status: 404 })
      );

      const response = await authFetch(
        'http://192.168.1.10/nonexistent',
        'admin',
        'pass'
      );

      expect(response.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return 500 errors directly', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Server Error', { status: 500 })
      );

      const response = await authFetch(
        'http://192.168.1.10/test',
        'admin',
        'pass'
      );

      expect(response.status).toBe(500);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return 200 response without retry', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"ready": true}', { status: 200 })
      );

      const response = await authFetch(
        'http://192.168.1.10/axis-cgi/systemready.cgi',
        'admin',
        'pass'
      );

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toBe('{"ready": true}');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('authFetch - defaults', () => {
    it('should default to GET method', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      await authFetch('http://192.168.1.10/test', 'admin', 'pass');

      expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    });

    it('should handle signal pass-through', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      );

      const controller = new AbortController();
      await authFetch('http://192.168.1.10/test', 'admin', 'pass', {
        signal: controller.signal,
      });

      expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal);
    });
  });
});
