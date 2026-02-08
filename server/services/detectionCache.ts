/**
 * Detection Cache Service
 * In-memory cache for camera model detection results with TTL
 */

import type { CameraModelDetection } from "./cameraDetection";

/**
 * Cache entry with expiration
 */
interface CacheEntry {
  data: CameraModelDetection;
  expiresAt: number;
}

/**
 * In-memory cache for camera model detection results
 * TTL: 24 hours (configurable)
 *
 * Future: Can be swapped with Redis for multi-instance deployments
 */
export class DetectionCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlHours: number = 24) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  /**
   * Generate cache key from IP and username
   * (username matters because different users may have different permissions)
   */
  private getCacheKey(ipAddress: string, username: string): string {
    return `${ipAddress}:${username}`;
  }

  /**
   * Get cached detection result
   * Returns null if not found or expired
   */
  get(ipAddress: string, username: string): CameraModelDetection | null {
    const key = this.getCacheKey(ipAddress, username);
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Check expiration
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Store detection result in cache
   */
  set(ipAddress: string, username: string, data: CameraModelDetection): void {
    const key = this.getCacheKey(ipAddress, username);
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Check if cache has valid entry
   */
  has(ipAddress: string, username: string): boolean {
    return this.get(ipAddress, username) !== null;
  }

  /**
   * Invalidate cache for specific camera
   */
  invalidate(ipAddress: string, username: string): boolean {
    const key = this.getCacheKey(ipAddress, username);
    return this.cache.delete(key);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries (garbage collection)
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    const entries: Array<{
      key: string;
      expiresIn: number;
      model: string;
      series: 'P' | 'Q' | 'M' | 'F' | 'Unknown';
    }> = [];

    this.cache.forEach((value, key) => {
      entries.push({
        key,
        expiresIn: Math.max(0, value.expiresAt - now),
        model: value.data.model,
        series: value.data.series,
      });
    });

    return {
      size: this.cache.size,
      ttlMs: this.ttlMs,
      entries,
    };
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

// Singleton instance with 24-hour TTL
export const detectionCache = new DetectionCache(24);

// Run garbage collection every hour
setInterval(() => {
  const cleaned = detectionCache.cleanExpired();
  if (cleaned > 0) {
    console.log(`[DetectionCache] Cleaned ${cleaned} expired entries`);
  }
}, 60 * 60 * 1000); // 1 hour
