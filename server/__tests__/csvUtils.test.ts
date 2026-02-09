import { describe, it, expect } from 'vitest';
import { parseCSV, generateCameraCSV, generateUptimeReportCSV } from '../csvUtils';

describe('CSV Utilities', () => {
  describe('parseCSV', () => {
    it('should parse valid CSV with required columns', () => {
      const csv = [
        'Name,IPAddress,Username,Password',
        'Lobby Cam,192.168.1.10,admin,pass123',
        'Entrance Cam,192.168.1.11,root,secret',
      ].join('\n');

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Lobby Cam',
        ipAddress: '192.168.1.10',
        username: 'admin',
        password: 'pass123',
        location: '',
        notes: '',
      });
      expect(result[1]).toEqual({
        name: 'Entrance Cam',
        ipAddress: '192.168.1.11',
        username: 'root',
        password: 'secret',
        location: '',
        notes: '',
      });
    });

    it('should be case-insensitive for header names', () => {
      const csv = [
        'NAME,IPADDRESS,USERNAME,PASSWORD',
        'Test,10.0.0.1,admin,pass',
      ].join('\n');

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test');
      expect(result[0].ipAddress).toBe('10.0.0.1');
    });

    it('should throw on missing required header: name', () => {
      const csv = 'IPAddress,Username,Password\n192.168.1.1,admin,pass';
      expect(() => parseCSV(csv)).toThrow('Missing required column: name');
    });

    it('should throw on missing required header: ipaddress', () => {
      const csv = 'Name,Username,Password\nCam1,admin,pass';
      expect(() => parseCSV(csv)).toThrow('Missing required column: ipaddress');
    });

    it('should throw on missing required header: username', () => {
      const csv = 'Name,IPAddress,Password\nCam1,192.168.1.1,pass';
      expect(() => parseCSV(csv)).toThrow('Missing required column: username');
    });

    it('should throw on missing required header: password', () => {
      const csv = 'Name,IPAddress,Username\nCam1,192.168.1.1,admin';
      expect(() => parseCSV(csv)).toThrow('Missing required column: password');
    });

    it('should throw on empty CSV', () => {
      // Empty string trimmed means no lines with content
      // But the code checks lines.length === 0, which won't trigger for ""
      // since "".split("\n") => [""]
      // Actually the code checks header for required fields, which will fail
      expect(() => parseCSV('')).toThrow('Missing required column');
    });

    it('should parse optional columns: protocol, port, verifySslCert', () => {
      const csv = [
        'Name,IPAddress,Username,Password,Protocol,Port,VerifySslCert',
        'HTTPS Cam,192.168.1.10,admin,pass,https,8443,true',
        'HTTP Cam,192.168.1.11,admin,pass,http,8080,false',
      ].join('\n');

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].protocol).toBe('https');
      expect(result[0].port).toBe(8443);
      expect(result[0].verifySslCert).toBe(true);

      expect(result[1].protocol).toBe('http');
      expect(result[1].port).toBe(8080);
      expect(result[1].verifySslCert).toBe(false);
    });

    it('should handle optional columns with missing values', () => {
      const csv = [
        'Name,IPAddress,Username,Password,Protocol,Port,VerifySslCert',
        'Basic Cam,192.168.1.10,admin,pass,,,',
      ].join('\n');

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      // When values are empty, the spread with conditional should not set them
      expect(result[0].protocol).toBeUndefined();
      expect(result[0].port).toBeUndefined();
      expect(result[0].verifySslCert).toBeUndefined();
    });

    it('should handle quoted values containing commas', () => {
      const csv = [
        'Name,IPAddress,Username,Password,Location',
        '"Camera, Lobby",192.168.1.10,admin,pass,"Building A, Floor 1"',
      ].join('\n');

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Camera, Lobby');
      expect(result[0].location).toBe('Building A, Floor 1');
    });

    it('should handle Windows line endings (CRLF)', () => {
      const csv = 'Name,IPAddress,Username,Password\r\nCam1,192.168.1.10,admin,pass\r\nCam2,192.168.1.11,root,secret\r\n';

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Cam1');
      expect(result[1].name).toBe('Cam2');
    });

    it('should skip empty lines', () => {
      const csv = [
        'Name,IPAddress,Username,Password',
        'Cam1,192.168.1.10,admin,pass',
        '',
        '',
        'Cam2,192.168.1.11,root,secret',
        '',
      ].join('\n');

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
    });

    it('should skip rows with fewer than 4 values', () => {
      const csv = [
        'Name,IPAddress,Username,Password',
        'Cam1,192.168.1.10,admin,pass',
        'Incomplete,192.168.1.11',
        'Also Incomplete',
      ].join('\n');

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Cam1');
    });

    it('should skip rows missing required field values', () => {
      const csv = [
        'Name,IPAddress,Username,Password',
        ',192.168.1.10,admin,pass',    // empty name
        'Cam2,,admin,pass',             // empty ipAddress
        'Cam3,192.168.1.12,,pass',      // empty username
        'Cam4,192.168.1.13,admin,',     // empty password
        'Valid,192.168.1.14,admin,pass', // valid row
      ].join('\n');

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Valid');
    });

    it('should parse optional location and notes columns', () => {
      const csv = [
        'Name,IPAddress,Username,Password,Location,Notes',
        'Cam1,192.168.1.10,admin,pass,Main Entrance,Front door camera',
      ].join('\n');

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].location).toBe('Main Entrance');
      expect(result[0].notes).toBe('Front door camera');
    });
  });

  describe('generateCameraCSV', () => {
    it('should generate proper header row', () => {
      const csv = generateCameraCSV([]);
      expect(csv).toBe('Name,IPAddress,Location,Status,LastSeen,Notes,Protocol,Port,VerifySSLCert');
    });

    it('should generate rows with correct values', () => {
      const cameras = [
        {
          name: 'Lobby Cam',
          ipAddress: '192.168.1.10',
          location: 'Main Lobby',
          currentStatus: 'online',
          lastSeenAt: new Date('2025-06-15T10:30:00Z'),
          notes: 'Primary entrance',
          protocol: 'http',
          port: 80,
          verifySslCert: false,
        },
      ];

      const csv = generateCameraCSV(cameras);
      const lines = csv.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('Name,IPAddress,Location,Status,LastSeen,Notes,Protocol,Port,VerifySSLCert');

      // toLocaleString() may contain commas (e.g. "6/15/2025, 10:30:00 AM")
      // so simple comma-split won't work reliably. Check the row as a whole.
      const row = lines[1];
      expect(row).toContain('Lobby Cam');
      expect(row).toContain('192.168.1.10');
      expect(row).toContain('Main Lobby');
      expect(row).toContain('online');
      expect(row).not.toContain('Never');
      expect(row).toContain('Primary entrance');
      expect(row).toContain('http');
      expect(row).toContain(',80,');
      expect(row.endsWith('false')).toBe(true);
    });

    it('should escape commas in name, location, and notes by replacing with semicolons', () => {
      const cameras = [
        {
          name: 'Camera, East Wing',
          ipAddress: '192.168.1.10',
          location: 'Building A, Floor 2',
          currentStatus: 'online',
          notes: 'Monitor entrance, exit',
        },
      ];

      const csv = generateCameraCSV(cameras);
      const lines = csv.split('\n');
      const row = lines[1];

      expect(row).toContain('Camera; East Wing');
      expect(row).toContain('Building A; Floor 2');
      expect(row).toContain('Monitor entrance; exit');
    });

    it('should show "Never" for cameras with no lastSeenAt', () => {
      const cameras = [
        {
          name: 'New Camera',
          ipAddress: '192.168.1.10',
          lastSeenAt: null,
        },
      ];

      const csv = generateCameraCSV(cameras as any);
      expect(csv).toContain('Never');
    });

    it('should default to "unknown" status when currentStatus is missing', () => {
      const cameras = [
        {
          name: 'Camera',
          ipAddress: '192.168.1.10',
        },
      ];

      const csv = generateCameraCSV(cameras as any);
      expect(csv).toContain('unknown');
    });

    it('should default protocol to http and port to 80', () => {
      const cameras = [
        {
          name: 'Camera',
          ipAddress: '192.168.1.10',
        },
      ];

      const csv = generateCameraCSV(cameras as any);
      const lines = csv.split('\n');
      const values = lines[1].split(',');

      expect(values[6]).toBe('http');
      expect(values[7]).toBe('80');
    });

    it('should set port to 443 when protocol is https and port is not specified', () => {
      const cameras = [
        {
          name: 'Camera',
          ipAddress: '192.168.1.10',
          protocol: 'https',
        },
      ];

      const csv = generateCameraCSV(cameras as any);
      const lines = csv.split('\n');
      const values = lines[1].split(',');

      expect(values[6]).toBe('https');
      expect(values[7]).toBe('443');
    });
  });

  describe('generateUptimeReportCSV', () => {
    it('should generate proper header row', () => {
      const csv = generateUptimeReportCSV([]);
      expect(csv).toBe('Camera Name,IP Address,Uptime (%),Status');
    });

    it('should classify 99%+ uptime as Excellent', () => {
      const cameras = [
        { name: 'Great Cam', ipAddress: '192.168.1.10', uptime: 99.5 },
        { name: 'Perfect Cam', ipAddress: '192.168.1.11', uptime: 100 },
        { name: 'Threshold Cam', ipAddress: '192.168.1.12', uptime: 99.0 },
      ];

      const csv = generateUptimeReportCSV(cameras);
      const lines = csv.split('\n');

      expect(lines[1]).toContain('Excellent');
      expect(lines[2]).toContain('Excellent');
      expect(lines[3]).toContain('Excellent');
    });

    it('should classify 95%-98.99% uptime as Good', () => {
      const cameras = [
        { name: 'Good Cam', ipAddress: '192.168.1.10', uptime: 97.5 },
        { name: 'Threshold Cam', ipAddress: '192.168.1.11', uptime: 95.0 },
        { name: 'Near Excellent', ipAddress: '192.168.1.12', uptime: 98.99 },
      ];

      const csv = generateUptimeReportCSV(cameras);
      const lines = csv.split('\n');

      expect(lines[1]).toContain('Good');
      expect(lines[2]).toContain('Good');
      expect(lines[3]).toContain('Good');
    });

    it('should classify below 95% uptime as Poor', () => {
      const cameras = [
        { name: 'Poor Cam', ipAddress: '192.168.1.10', uptime: 80.0 },
        { name: 'Bad Cam', ipAddress: '192.168.1.11', uptime: 0 },
        { name: 'Near Good', ipAddress: '192.168.1.12', uptime: 94.99 },
      ];

      const csv = generateUptimeReportCSV(cameras);
      const lines = csv.split('\n');

      expect(lines[1]).toContain('Poor');
      expect(lines[2]).toContain('Poor');
      expect(lines[3]).toContain('Poor');
    });

    it('should format uptime to 2 decimal places', () => {
      const cameras = [
        { name: 'Cam', ipAddress: '192.168.1.10', uptime: 99.12345 },
      ];

      const csv = generateUptimeReportCSV(cameras);
      const lines = csv.split('\n');
      const values = lines[1].split(',');

      expect(values[2]).toBe('99.12');
    });

    it('should escape commas in camera name', () => {
      const cameras = [
        { name: 'Camera, Building A', ipAddress: '192.168.1.10', uptime: 99.5 },
      ];

      const csv = generateUptimeReportCSV(cameras);
      expect(csv).toContain('Camera; Building A');
    });
  });
});
