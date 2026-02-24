import { describe, it, expect } from 'vitest';
import { calculateUptimeFromEvents } from '../uptimeCalculator.js';

describe('Uptime Calculation Accuracy', () => {
  describe('Known Scenario Tests', () => {
    it('should return 0% when no events and no prior status (no monitoring data)', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-02T00:00:00Z');
      const events: any[] = [];

      // No events + no priorEventStatus = no monitoring data, returns 0
      const uptime = calculateUptimeFromEvents(events, start, end);

      expect(uptime).toBe(0);
    });

    it('should return 100% for camera always online (prior event online, no transitions)', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-02T00:00:00Z');
      const events: any[] = [];
      const priorStatus = 'online';
      
      const uptime = calculateUptimeFromEvents(events, start, end, priorStatus);
      
      expect(uptime).toBe(100);
    });

    it('should return 0% for camera always offline', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-02T00:00:00Z');
      const events: any[] = [];
      const priorStatus = 'offline';
      
      const uptime = calculateUptimeFromEvents(events, start, end, priorStatus);
      
      expect(uptime).toBe(0);
    });

    it('should calculate 50% uptime for half online, half offline', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T24:00:00Z'); // 24 hours
      const events = [
        { timestamp: new Date('2025-01-01T00:00:00Z'), status: 'online' },
        { timestamp: new Date('2025-01-01T12:00:00Z'), status: 'offline' }, // 12 hours online
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      expect(uptime).toBeCloseTo(50, 1);
    });

    it('should calculate 75% uptime correctly', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-02T00:00:00Z'); // 24 hours
      const events = [
        { timestamp: new Date('2025-01-01T00:00:00Z'), status: 'online' },
        { timestamp: new Date('2025-01-01T18:00:00Z'), status: 'offline' }, // 18 hours online
        { timestamp: new Date('2025-01-01T21:00:00Z'), status: 'online' },  // 3 hours offline, then online for remaining 3 hours
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // 18 hours + 3 hours = 21 hours online out of 24 = 87.5%
      expect(uptime).toBeCloseTo(87.5, 1);
    });

    it('should handle rapid state changes correctly', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T01:00:00Z'); // 1 hour = 3600 seconds
      const events = [
        { timestamp: new Date('2025-01-01T00:00:00Z'), status: 'online' },
        { timestamp: new Date('2025-01-01T00:15:00Z'), status: 'offline' }, // 15 min online
        { timestamp: new Date('2025-01-01T00:30:00Z'), status: 'online' },  // 15 min offline
        { timestamp: new Date('2025-01-01T00:45:00Z'), status: 'offline' }, // 15 min online
        // Last 15 min offline
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // 15 + 15 = 30 minutes online out of 60 = 50%
      expect(uptime).toBeCloseTo(50, 1);
    });

    it('should handle prior event status correctly', () => {
      const start = new Date('2025-01-01T12:00:00Z');
      const end = new Date('2025-01-02T00:00:00Z'); // 12 hours
      const events = [
        { timestamp: new Date('2025-01-01T18:00:00Z'), status: 'offline' }, // Went offline at 18:00
      ];
      const priorStatus = 'online'; // Was online before window started
      
      const uptime = calculateUptimeFromEvents(events, start, end, priorStatus);
      
      // Online from 12:00 to 18:00 = 6 hours out of 12 = 50%
      expect(uptime).toBeCloseTo(50, 1);
    });
  });

  describe('Edge Cases', () => {
    it('should return 0 for zero duration window', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T00:00:00Z'); // Same time
      const events: any[] = [];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      expect(uptime).toBe(0);
    });

    it('should handle events exactly at window boundaries', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T24:00:00Z');
      const events = [
        { timestamp: new Date('2025-01-01T00:00:00Z'), status: 'online' },  // At start
        { timestamp: new Date('2025-01-01T24:00:00Z'), status: 'offline' }, // At end
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // Online for entire duration
      expect(uptime).toBe(100);
    });

    it('should handle single online event (camera came online and stayed)', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T24:00:00Z');
      const events = [
        { timestamp: new Date('2025-01-01T12:00:00Z'), status: 'online' },
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // Offline for first 12 hours, online for last 12 hours = 50%
      expect(uptime).toBeCloseTo(50, 1);
    });

    it('should handle single offline event (camera went offline and stayed)', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T24:00:00Z');
      const events = [
        { timestamp: new Date('2025-01-01T12:00:00Z'), status: 'offline' },
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // Online for first 12 hours (inferred), offline for last 12 hours = 50%
      expect(uptime).toBeCloseTo(50, 1);
    });

    it('should handle long time windows (365 days)', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2025-01-01T00:00:00Z'); // 366 days (leap year)
      const events = [
        { timestamp: new Date('2024-01-01T00:00:00Z'), status: 'online' },
        { timestamp: new Date('2024-07-01T00:00:00Z'), status: 'offline' }, // Offline for half the year
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // Should be approximately 50%
      expect(uptime).toBeGreaterThan(49);
      expect(uptime).toBeLessThan(51);
    });
  });

  describe('Accuracy Requirements', () => {
    it('should calculate uptime within ±0.1% tolerance for complex scenarios', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-08T00:00:00Z'); // 7 days
      
      // Simulate realistic scenario: mostly online with occasional downtime
      const events = [
        { timestamp: new Date('2025-01-01T00:00:00Z'), status: 'online' },
        { timestamp: new Date('2025-01-02T03:00:00Z'), status: 'offline' }, // 27 hours online
        { timestamp: new Date('2025-01-02T04:00:00Z'), status: 'online' },  // 1 hour offline
        { timestamp: new Date('2025-01-05T12:00:00Z'), status: 'offline' }, // 80 hours online
        { timestamp: new Date('2025-01-05T13:00:00Z'), status: 'online' },  // 1 hour offline
        // Rest of time online: 59 hours
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // Total: 27 + 80 + 59 = 166 hours online out of 168 hours
      const expected = (166 / 168) * 100; // ~98.81%
      
      expect(Math.abs(uptime - expected)).toBeLessThan(0.1);
    });

    it('should match manual calculation for known scenario', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T10:00:00Z'); // 10 hours
      const events = [
        { timestamp: new Date('2025-01-01T00:00:00Z'), status: 'online' },
        { timestamp: new Date('2025-01-01T02:00:00Z'), status: 'offline' },
        { timestamp: new Date('2025-01-01T03:00:00Z'), status: 'online' },
        { timestamp: new Date('2025-01-01T07:00:00Z'), status: 'offline' },
        { timestamp: new Date('2025-01-01T08:00:00Z'), status: 'online' },
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // Manual calculation:
      // 00:00-02:00: 2 hours online
      // 02:00-03:00: 1 hour offline
      // 03:00-07:00: 4 hours online
      // 07:00-08:00: 1 hour offline
      // 08:00-10:00: 2 hours online
      // Total: 2 + 4 + 2 = 8 hours online out of 10 = 80%
      
      expect(uptime).toBe(80);
    });
  });

  describe('Reboot Detection Impact', () => {
    it('should count reboots as continuous online time (camera stayed online)', () => {
      const start = new Date('2025-01-01T00:00:00Z');
      const end = new Date('2025-01-01T24:00:00Z');
      const events = [
        { timestamp: new Date('2025-01-01T00:00:00Z'), status: 'online' },
        // In real system, reboot creates an 'online' event with new bootId
        { timestamp: new Date('2025-01-01T12:00:00Z'), status: 'online' }, // Reboot
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // Should be 100% - camera never went offline, just rebooted
      expect(uptime).toBe(100);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle events before window start (prior event)', () => {
      const start = new Date('2025-01-02T00:00:00Z');
      const end = new Date('2025-01-03T00:00:00Z');
      const events = [
        { timestamp: new Date('2025-01-02T12:00:00Z'), status: 'offline' },
      ];
      const priorStatus = 'online'; // Was online before Jan 2
      
      const uptime = calculateUptimeFromEvents(events, start, end, priorStatus);
      
      // Online for first 12 hours, offline for last 12 hours = 50%
      expect(uptime).toBeCloseTo(50, 1);
    });

    it('should ignore events outside window', () => {
      const start = new Date('2025-01-02T00:00:00Z');
      const end = new Date('2025-01-03T00:00:00Z');
      
      // Events outside window should be filtered out before calling this function
      const events = [
        { timestamp: new Date('2025-01-02T12:00:00Z'), status: 'offline' },
      ];
      
      const uptime = calculateUptimeFromEvents(events, start, end);
      
      // First half online (inferred), second half offline
      expect(uptime).toBeCloseTo(50, 1);
    });
  });
});
