import { describe, it, expect } from 'vitest';
import { buildCameraUrl, getConnectionInfo, getCameraDispatcher } from '../services/cameraUrl';

describe('Camera URL Builder', () => {
  describe('buildCameraUrl', () => {
    it('should build HTTP URL with default port (omit :80)', () => {
      const url = buildCameraUrl('192.168.1.100', '/axis-cgi/systemready.cgi');
      expect(url).toBe('http://192.168.1.100/axis-cgi/systemready.cgi');
    });

    it('should build HTTP URL with explicit default port (omit :80)', () => {
      const url = buildCameraUrl('192.168.1.100', '/axis-cgi/systemready.cgi', {
        protocol: 'http',
        port: 80,
      });
      expect(url).toBe('http://192.168.1.100/axis-cgi/systemready.cgi');
    });

    it('should build HTTPS URL with default port (omit :443)', () => {
      const url = buildCameraUrl('192.168.1.100', '/axis-cgi/param.cgi', {
        protocol: 'https',
        port: 443,
      });
      expect(url).toBe('https://192.168.1.100/axis-cgi/param.cgi');
    });

    it('should build HTTPS URL without explicit port (default 443, omitted)', () => {
      const url = buildCameraUrl('192.168.1.100', '/axis-cgi/param.cgi', {
        protocol: 'https',
      });
      expect(url).toBe('https://192.168.1.100/axis-cgi/param.cgi');
    });

    it('should include custom HTTP port', () => {
      const url = buildCameraUrl('192.168.1.100', '/axis-cgi/param.cgi', {
        protocol: 'http',
        port: 8080,
      });
      expect(url).toBe('http://192.168.1.100:8080/axis-cgi/param.cgi');
    });

    it('should include custom HTTPS port', () => {
      const url = buildCameraUrl('192.168.1.100', '/axis-cgi/param.cgi', {
        protocol: 'https',
        port: 8443,
      });
      expect(url).toBe('https://192.168.1.100:8443/axis-cgi/param.cgi');
    });

    it('should default to HTTP when no connection info provided', () => {
      const url = buildCameraUrl('10.0.0.1', '/test');
      expect(url).toBe('http://10.0.0.1/test');
    });

    it('should default to HTTP when connection info is undefined', () => {
      const url = buildCameraUrl('10.0.0.1', '/test', undefined);
      expect(url).toBe('http://10.0.0.1/test');
    });

    it('should handle empty endpoint', () => {
      const url = buildCameraUrl('192.168.1.1', '');
      expect(url).toBe('http://192.168.1.1');
    });

    it('should handle endpoint with query parameters', () => {
      const url = buildCameraUrl('192.168.1.1', '/axis-cgi/param.cgi?action=list&group=Brand', {
        protocol: 'https',
        port: 443,
      });
      expect(url).toBe('https://192.168.1.1/axis-cgi/param.cgi?action=list&group=Brand');
    });

    it('should handle hostname instead of IP', () => {
      const url = buildCameraUrl('camera-lobby.local', '/axis-cgi/systemready.cgi');
      expect(url).toBe('http://camera-lobby.local/axis-cgi/systemready.cgi');
    });
  });

  describe('getConnectionInfo', () => {
    it('should return defaults for null fields', () => {
      const info = getConnectionInfo({
        protocol: null,
        port: null,
        verifySslCert: null,
      });

      expect(info.protocol).toBe('http');
      expect(info.port).toBe(80);
      expect(info.verifySslCert).toBe(false);
    });

    it('should return defaults for undefined fields', () => {
      const info = getConnectionInfo({});

      expect(info.protocol).toBe('http');
      expect(info.port).toBe(80);
      expect(info.verifySslCert).toBe(false);
    });

    it('should pass through explicit HTTP values', () => {
      const info = getConnectionInfo({
        protocol: 'http',
        port: 8080,
        verifySslCert: false,
      });

      expect(info.protocol).toBe('http');
      expect(info.port).toBe(8080);
      expect(info.verifySslCert).toBe(false);
    });

    it('should pass through explicit HTTPS values', () => {
      const info = getConnectionInfo({
        protocol: 'https',
        port: 8443,
        certValidationMode: 'ca',
      });

      expect(info.protocol).toBe('https');
      expect(info.port).toBe(8443);
      expect(info.verifySslCert).toBe(true);
      expect(info.certValidationMode).toBe('ca');
    });

    it('should default HTTPS port to 443 when protocol is https and port is null', () => {
      const info = getConnectionInfo({
        protocol: 'https',
        port: null,
        verifySslCert: null,
      });

      expect(info.protocol).toBe('https');
      expect(info.port).toBe(443);
      expect(info.verifySslCert).toBe(false);
    });

    it('should default HTTP port to 80 when protocol is http and port is null', () => {
      const info = getConnectionInfo({
        protocol: 'http',
        port: null,
      });

      expect(info.port).toBe(80);
    });

    it('should default verifySslCert to false via nullish coalescing', () => {
      // Explicitly passing false should still be false
      const info = getConnectionInfo({ verifySslCert: false });
      expect(info.verifySslCert).toBe(false);

      // null should default to false
      const info2 = getConnectionInfo({ verifySslCert: null });
      expect(info2.verifySslCert).toBe(false);
    });
  });

  describe('getCameraDispatcher', () => {
    it('should return undefined for HTTP connections', () => {
      const dispatcher = getCameraDispatcher({ protocol: 'http' });
      expect(dispatcher).toBeUndefined();
    });

    it('should return undefined when no connection info provided', () => {
      const dispatcher = getCameraDispatcher();
      expect(dispatcher).toBeUndefined();
    });

    it('should return undefined when connection info is undefined', () => {
      const dispatcher = getCameraDispatcher(undefined);
      expect(dispatcher).toBeUndefined();
    });

    it('should return an Agent for HTTPS connections', () => {
      const dispatcher = getCameraDispatcher({ protocol: 'https' });
      expect(dispatcher).toBeDefined();
      expect(dispatcher).not.toBeUndefined();
    });

    it('should return the same cached Agent for same verify setting', () => {
      const dispatcher1 = getCameraDispatcher({ protocol: 'https', verifySslCert: false });
      const dispatcher2 = getCameraDispatcher({ protocol: 'https', verifySslCert: false });
      expect(dispatcher1).toBe(dispatcher2);
    });

    it('should return different Agents for different verify settings', () => {
      const dispatcherNoVerify = getCameraDispatcher({ protocol: 'https', certValidationMode: 'none' });
      const dispatcherVerify = getCameraDispatcher({ protocol: 'https', certValidationMode: 'ca' });
      expect(dispatcherNoVerify).not.toBe(dispatcherVerify);
    });
  });
});
