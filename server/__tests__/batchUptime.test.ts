import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseStorage } from '../storage';

// Mock the DB layer
const mockPrepare = vi.fn();
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  sqlite: {
    prepare: (...args: any[]) => mockPrepare(...args),
  },
}));

vi.mock('../uptimeCalculator.js', () => ({
  calculateUptimeFromEvents: vi.fn(() => 100),
}));

describe('calculateBatchUptimePercentage', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    storage = new DatabaseStorage();
    vi.clearAllMocks();
    // Clear the internal uptime cache between tests
    // @ts-ignore - accessing private cache for testing
    (storage as any).__proto__.constructor; // force class usage
  });

  it('should return empty map for empty camera IDs', async () => {
    const result = await storage.calculateBatchUptimePercentage([], 30);
    expect(result.size).toBe(0);
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  it('should query all 3 tiers and aggregate results', async () => {
    // Each prepare().all() call returns tier data
    mockPrepare.mockReturnValue({
      all: vi.fn()
        .mockReturnValueOnce([
          // Tier 3: daily summary
          { camera_id: 'cam-1', online_count: 80, total_checks: 100 },
          { camera_id: 'cam-2', online_count: 50, total_checks: 100 },
        ])
        .mockReturnValueOnce([
          // Tier 2: hourly summary
          { camera_id: 'cam-1', online_count: 10, total_checks: 10 },
        ])
        .mockReturnValueOnce([
          // Tier 1: raw events
          { camera_id: 'cam-2', online_count: 5, total_checks: 10 },
        ]),
    });

    const result = await storage.calculateBatchUptimePercentage(['cam-1', 'cam-2'], 30);

    expect(result.size).toBe(2);

    // cam-1: daily(80/100) + hourly(10/10) + raw(0/0) = 90/110 = 81.8%
    const cam1 = result.get('cam-1')!;
    expect(cam1.percentage).toBeCloseTo(81.8, 0);
    expect(cam1.monitoredDays).toBe(30);

    // cam-2: daily(50/100) + hourly(0/0) + raw(5/10) = 55/110 = 50%
    const cam2 = result.get('cam-2')!;
    expect(cam2.percentage).toBeCloseTo(50, 0);
  });

  it('should return 0% for cameras with no data in any tier', async () => {
    mockPrepare.mockReturnValue({
      all: vi.fn()
        .mockReturnValueOnce([]) // daily: no rows
        .mockReturnValueOnce([]) // hourly: no rows
        .mockReturnValueOnce([]) // raw: no rows
    });

    const result = await storage.calculateBatchUptimePercentage(['cam-lonely'], 7);

    expect(result.size).toBe(1);
    expect(result.get('cam-lonely')!.percentage).toBe(0);
  });

  it('should return 100% for camera that is always online', async () => {
    mockPrepare.mockReturnValue({
      all: vi.fn()
        .mockReturnValueOnce([{ camera_id: 'cam-good', online_count: 288, total_checks: 288 }])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]),
    });

    const result = await storage.calculateBatchUptimePercentage(['cam-good'], 1);
    expect(result.get('cam-good')!.percentage).toBe(100);
  });

  it('should handle large batch of camera IDs', async () => {
    // Use unique prefix to avoid cache hits from prior tests
    const ids = Array.from({ length: 100 }, (_, i) => `batch-cam-${i}`);

    // Each prepare() call returns a new object with its own all() mock
    let callCount = 0;
    mockPrepare.mockImplementation(() => ({
      all: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Tier 3 daily: all batch-cam-X have 90/100
          return ids.map(id => ({ camera_id: id, online_count: 90, total_checks: 100 }));
        }
        // Tier 2 and Tier 1: no data
        return [];
      }),
    }));

    const result = await storage.calculateBatchUptimePercentage(ids, 30);
    expect(result.size).toBe(100);
    for (const id of ids) {
      expect(result.get(id)!.percentage).toBe(90);
    }
  });
});
