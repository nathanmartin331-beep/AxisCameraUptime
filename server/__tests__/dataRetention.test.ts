import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted — cannot reference local variables.
// Use vi.fn() directly and retrieve via vi.mocked() after import.

vi.mock('../storage', () => ({
  storage: {
    getAllCameras: vi.fn(),
    deleteOldUptimeEventsForCameras: vi.fn(),
    deleteOldAnalyticsEventsForCameras: vi.fn(),
    deleteOldUptimeHourlyForCameras: vi.fn(),
    deleteOldAnalyticsHourlyForCameras: vi.fn(),
  },
}));

vi.mock('../db', () => {
  const rows: any[] = [];
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation(() => Promise.resolve(rows)),
      }),
    },
    // Expose the rows array so tests can push to it
    __mockUserSettingsRows: rows,
  };
});

// Import after mocks
import { runRetentionCleanup } from '../services/dataRetention';
import { storage } from '../storage';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { __mockUserSettingsRows } from '../db';

describe('Data Retention Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock rows
    (__mockUserSettingsRows as any[]).length = 0;
  });

  it('should do nothing when no cameras exist', async () => {
    vi.mocked(storage.getAllCameras).mockResolvedValue([]);

    await runRetentionCleanup();

    expect(storage.deleteOldUptimeEventsForCameras).not.toHaveBeenCalled();
    expect(storage.deleteOldAnalyticsEventsForCameras).not.toHaveBeenCalled();
  });

  it('should use default 90-day retention when user has no settings', async () => {
    vi.mocked(storage.getAllCameras).mockResolvedValue([
      { id: 'cam-1', userId: 'user-1' } as any,
      { id: 'cam-2', userId: 'user-1' } as any,
    ]);
    vi.mocked(storage.deleteOldUptimeEventsForCameras).mockResolvedValue(5);
    vi.mocked(storage.deleteOldAnalyticsEventsForCameras).mockResolvedValue(3);
    vi.mocked(storage.deleteOldUptimeHourlyForCameras).mockResolvedValue(0);
    vi.mocked(storage.deleteOldAnalyticsHourlyForCameras).mockResolvedValue(0);

    await runRetentionCleanup();

    expect(storage.deleteOldUptimeEventsForCameras).toHaveBeenCalledWith(
      ['cam-1', 'cam-2'],
      expect.any(Date)
    );
    const callDate = vi.mocked(storage.deleteOldUptimeEventsForCameras).mock.calls[0][1] as Date;
    const daysAgo = (Date.now() - callDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgo).toBeCloseTo(90, 0);

    // Hourly retention defaults to 30 days
    expect(storage.deleteOldAnalyticsHourlyForCameras).toHaveBeenCalledWith(
      ['cam-1', 'cam-2'],
      expect.any(Date)
    );
    const hourlyDate = vi.mocked(storage.deleteOldAnalyticsHourlyForCameras).mock.calls[0][1] as Date;
    const hourlyDaysAgo = (Date.now() - hourlyDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(hourlyDaysAgo).toBeCloseTo(30, 0);
  });

  it('should respect per-user retention settings', async () => {
    (__mockUserSettingsRows as any[]).push(
      { userId: 'user-a', dataRetentionDays: 30, hourlyRetentionDays: 7 },
      { userId: 'user-b', dataRetentionDays: 180, hourlyRetentionDays: 60 },
    );
    vi.mocked(storage.getAllCameras).mockResolvedValue([
      { id: 'cam-a1', userId: 'user-a' } as any,
      { id: 'cam-b1', userId: 'user-b' } as any,
      { id: 'cam-b2', userId: 'user-b' } as any,
    ]);
    vi.mocked(storage.deleteOldUptimeEventsForCameras).mockResolvedValue(0);
    vi.mocked(storage.deleteOldAnalyticsEventsForCameras).mockResolvedValue(0);
    vi.mocked(storage.deleteOldUptimeHourlyForCameras).mockResolvedValue(0);
    vi.mocked(storage.deleteOldAnalyticsHourlyForCameras).mockResolvedValue(0);

    await runRetentionCleanup();

    // Should be called twice — once per user
    expect(storage.deleteOldUptimeEventsForCameras).toHaveBeenCalledTimes(2);

    // User A: 30 days, 1 camera
    expect(storage.deleteOldUptimeEventsForCameras).toHaveBeenCalledWith(
      ['cam-a1'],
      expect.any(Date)
    );
    const userADate = vi.mocked(storage.deleteOldUptimeEventsForCameras).mock.calls[0][1] as Date;
    const daysAgoA = (Date.now() - userADate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgoA).toBeCloseTo(30, 0);

    // User B: 180 days, 2 cameras
    expect(storage.deleteOldUptimeEventsForCameras).toHaveBeenCalledWith(
      ['cam-b1', 'cam-b2'],
      expect.any(Date)
    );
    const userBDate = vi.mocked(storage.deleteOldUptimeEventsForCameras).mock.calls[1][1] as Date;
    const daysAgoB = (Date.now() - userBDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgoB).toBeCloseTo(180, 0);

    // Per-user hourly retention: user-a = 7d, user-b = 60d
    const userAHourly = vi.mocked(storage.deleteOldAnalyticsHourlyForCameras).mock.calls[0][1] as Date;
    const userBHourly = vi.mocked(storage.deleteOldAnalyticsHourlyForCameras).mock.calls[1][1] as Date;
    expect((Date.now() - userAHourly.getTime()) / (1000 * 60 * 60 * 24)).toBeCloseTo(7, 0);
    expect((Date.now() - userBHourly.getTime()) / (1000 * 60 * 60 * 24)).toBeCloseTo(60, 0);
  });

  it('should handle errors gracefully without crashing', async () => {
    vi.mocked(storage.getAllCameras).mockRejectedValue(new Error('DB is down'));

    // Should not throw
    await expect(runRetentionCleanup()).resolves.toBeUndefined();
  });

  it('should process cameras from users without explicit settings using default 90d', async () => {
    (__mockUserSettingsRows as any[]).push({ userId: 'user-c', dataRetentionDays: 60, hourlyRetentionDays: 14 });
    vi.mocked(storage.getAllCameras).mockResolvedValue([
      { id: 'cam-c1', userId: 'user-c' } as any,
      { id: 'cam-d1', userId: 'user-d' } as any, // no settings row
    ]);
    vi.mocked(storage.deleteOldUptimeEventsForCameras).mockResolvedValue(0);
    vi.mocked(storage.deleteOldAnalyticsEventsForCameras).mockResolvedValue(0);
    vi.mocked(storage.deleteOldUptimeHourlyForCameras).mockResolvedValue(0);
    vi.mocked(storage.deleteOldAnalyticsHourlyForCameras).mockResolvedValue(0);

    await runRetentionCleanup();

    expect(storage.deleteOldUptimeEventsForCameras).toHaveBeenCalledTimes(2);

    // Find the call for user-d
    const userDCall = vi.mocked(storage.deleteOldUptimeEventsForCameras).mock.calls.find(
      (call) => (call[0] as string[]).includes('cam-d1')
    );
    expect(userDCall).toBeDefined();
    const userDDate = userDCall![1] as Date;
    const daysAgoD = (Date.now() - userDDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgoD).toBeCloseTo(90, 0);
  });
});
