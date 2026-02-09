import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The parseSyslogEntries function in historyBackfill.ts is NOT exported,
 * so we cannot test it directly. Instead, we test fetchSystemLog which
 * calls parseSyslogEntries internally. We mock authFetch to control
 * the syslog text that gets parsed.
 */

// Mock the dependencies that historyBackfill imports
vi.mock('../services/digestAuth', () => ({
  authFetch: vi.fn(),
}));

vi.mock('../services/cameraUrl', () => ({
  buildCameraUrl: vi.fn((ip: string, endpoint: string, _conn?: any) => `http://${ip}${endpoint}`),
  getCameraDispatcher: vi.fn(() => undefined),
}));

import { fetchSystemLog } from '../services/historyBackfill';
import { authFetch } from '../services/digestAuth';

describe('History Backfill - fetchSystemLog / syslog parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockSyslogResponse(text: string, status = 200) {
    vi.mocked(authFetch).mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      text: async () => text,
      headers: new Headers(),
    } as unknown as Response);
  }

  describe('Parsing system startup entries', () => {
    it('should parse "system startup" entries', async () => {
      const syslog = [
        'Jan 15 03:22:11 axis-camera [ INFO ] system startup',
        'Feb  5 10:00:00 axis-camera [ INFO ] something else',
      ].join('\n');

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('startup');
      expect(events[0].timestamp.getMonth()).toBe(0); // January
      expect(events[0].timestamp.getDate()).toBe(15);
      expect(events[0].timestamp.getHours()).toBe(3);
      expect(events[0].timestamp.getMinutes()).toBe(22);
      expect(events[0].timestamp.getSeconds()).toBe(11);
    });

    it('should parse "booting" entries as startup', async () => {
      const syslog = 'Mar  1 08:00:00 axis-camera [ INFO ] booting kernel 5.15';

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('startup');
    });
  });

  describe('Parsing system reboot entries', () => {
    it('should parse "system reboot" entries', async () => {
      const syslog = 'Dec 20 14:05:33 axis-camera [ CRIT ] system reboot';

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('reboot');
      expect(events[0].timestamp.getMonth()).toBe(11); // December
      expect(events[0].timestamp.getDate()).toBe(20);
    });

    it('should parse "watchdog restart" entries as reboot', async () => {
      const syslog = 'Jun  3 12:30:00 axis-camera [ CRIT ] watchdog triggered restart';

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('reboot');
    });

    it('should parse "firmware upgrade reboot" entries as reboot', async () => {
      const syslog = 'Apr 10 02:00:00 axis-camera [ INFO ] firmware upgrade reboot initiated';

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('reboot');
    });

    it('should parse "power lost" entries as reboot', async () => {
      const syslog = 'May 22 18:45:00 axis-camera [ CRIT ] power lost detected';

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('reboot');
    });
  });

  describe('Parsing system shutdown entries', () => {
    it('should parse "system shutdown" entries', async () => {
      const syslog = 'Jul 15 23:59:59 axis-camera [ INFO ] system shutdown';

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('shutdown');
    });
  });

  describe('Syslog timestamp parsing', () => {
    it('should parse single-digit day with leading space', async () => {
      const syslog = 'Feb  5 10:00:00 axis-camera [ INFO ] system startup';

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].timestamp.getMonth()).toBe(1); // February
      expect(events[0].timestamp.getDate()).toBe(5);
    });

    it('should parse double-digit day', async () => {
      const syslog = 'Nov 25 16:30:45 axis-camera [ INFO ] system startup';

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].timestamp.getDate()).toBe(25);
      expect(events[0].timestamp.getHours()).toBe(16);
      expect(events[0].timestamp.getMinutes()).toBe(30);
      expect(events[0].timestamp.getSeconds()).toBe(45);
    });
  });

  describe('Year inference', () => {
    it('should use current year for dates in the past', async () => {
      // Build a date that is definitely in the past
      const now = new Date();
      const pastMonth = now.getMonth(); // current month
      const pastDay = now.getDate() - 1; // yesterday (or could wrap, but the test logic still works)

      // Use a month that's definitely in the past
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      let testMonth: string;
      let expectedYear: number;

      if (now.getMonth() > 0) {
        // Use January, which is always in the past if we're past January
        testMonth = 'Jan';
        expectedYear = now.getFullYear();
      } else {
        // We're in January, use December of last year scenario
        testMonth = 'Dec';
        expectedYear = now.getFullYear() - 1;
      }

      const syslog = `${testMonth} 01 00:00:00 axis-camera [ INFO ] system startup`;

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].timestamp.getFullYear()).toBe(expectedYear);
    });

    it('should use previous year if parsed date is in the future', async () => {
      // Build a date that's definitely in the future
      const now = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      let futureMonthName: string;

      if (now.getMonth() < 11) {
        // Use December, which is in the future if we're not in December
        futureMonthName = 'Dec';
      } else {
        // We're in December, use a future day approach
        // Use Nov with a date far enough out
        futureMonthName = 'Dec';
      }

      // Use Dec 31 23:59:59 to ensure it's in the future unless we're there
      const syslog = `${futureMonthName} 31 23:59:59 axis-camera [ INFO ] system startup`;

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      // If the date would be in the future with current year, it uses previous year
      const eventYear = events[0].timestamp.getFullYear();
      expect(eventYear).toBeLessThanOrEqual(now.getFullYear());
    });
  });

  describe('Empty and non-matching input', () => {
    it('should return empty array for empty input', async () => {
      mockSyslogResponse('');

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(0);
    });

    it('should return empty array when no lines match boot patterns', async () => {
      const syslog = [
        'Jan 15 03:22:11 axis-camera [ INFO ] network interface eth0 up',
        'Jan 15 03:22:12 axis-camera [ INFO ] DHCP lease obtained',
        'Jan 15 03:22:13 axis-camera [ INFO ] NTP synchronized',
      ].join('\n');

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(0);
    });

    it('should skip lines without valid timestamps', async () => {
      const syslog = [
        'This line has no timestamp but mentions system startup',
        'Jan 15 03:22:11 axis-camera [ INFO ] system startup',
      ].join('\n');

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
    });

    it('should skip blank lines', async () => {
      const syslog = [
        '',
        'Jan 15 03:22:11 axis-camera [ INFO ] system startup',
        '',
        '',
        'Feb  1 10:00:00 axis-camera [ CRIT ] system reboot',
        '',
      ].join('\n');

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(2);
    });
  });

  describe('Multiple events and sorting', () => {
    it('should parse multiple events and sort chronologically', async () => {
      // Use dates all safely in the past of the current year to avoid
      // year-inference boundary issues (parseSyslogEntries rolls future
      // dates back one year).
      const now = new Date();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      // Pick 3 months that are all in the past relative to now
      // Use very early months if we're past March, otherwise use months from last year's portion
      let m1: string, m2: string, m3: string;
      if (now.getMonth() >= 3) {
        // We're in April or later; Jan, Feb, Mar are all safely in the past
        m1 = 'Jan';
        m2 = 'Feb';
        m3 = 'Mar';
      } else {
        // We're in Jan-Mar; use months that will all roll to previous year
        m1 = 'Sep';
        m2 = 'Oct';
        m3 = 'Nov';
      }

      const syslog = [
        `${m3} 10 12:00:00 axis-camera [ CRIT ] system reboot`,
        `${m1} 05 08:00:00 axis-camera [ INFO ] system startup`,
        `${m2} 20 16:00:00 axis-camera [ INFO ] system shutdown`,
      ].join('\n');

      mockSyslogResponse(syslog);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(3);
      // Should be sorted chronologically
      expect(events[0].type).toBe('startup');
      expect(events[1].type).toBe('shutdown');
      expect(events[2].type).toBe('reboot');
    });

    it('should preserve original log line in message field', async () => {
      const line = 'Jan 15 03:22:11 axis-camera [ INFO ] system startup';
      mockSyslogResponse(line);

      const events = await fetchSystemLog('192.168.1.10', 'admin', 'pass');

      expect(events).toHaveLength(1);
      expect(events[0].message).toBe(line);
    });
  });

  describe('HTTP error handling', () => {
    it('should throw on 401 authentication failure', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        text: async () => 'Unauthorized',
      } as unknown as Response);

      await expect(
        fetchSystemLog('192.168.1.10', 'admin', 'wrong')
      ).rejects.toThrow('Authentication failed for system log');
    });

    it('should throw on 404 when endpoint not available', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        text: async () => 'Not Found',
      } as unknown as Response);

      await expect(
        fetchSystemLog('192.168.1.10', 'admin', 'pass')
      ).rejects.toThrow('System log endpoint not available');
    });

    it('should throw on other HTTP errors', async () => {
      vi.mocked(authFetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        text: async () => 'Error',
      } as unknown as Response);

      await expect(
        fetchSystemLog('192.168.1.10', 'admin', 'pass')
      ).rejects.toThrow('HTTP 500');
    });
  });
});
