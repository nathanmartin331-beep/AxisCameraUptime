/**
 * Historical Uptime Backfill Service
 *
 * Uses camera-reported uptimeSeconds to synthesize historical "online" events,
 * extending uptime history backwards before our monitoring started.
 *
 * Also parses system logs from /axis-cgi/admin/systemlog.cgi for historical
 * reboot events.
 */

import { db } from "../db";
import { cameras, uptimeEvents } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import { storage } from "../storage";
import { authFetch } from "./digestAuth";

/**
 * Parsed system log entry representing a boot/reboot event
 */
interface BootEvent {
  timestamp: Date;
  type: "startup" | "shutdown" | "reboot";
  message: string;
}

/**
 * Backfill historical uptime for a camera using its reported uptimeSeconds.
 *
 * When a camera reports uptimeSeconds: 15179676 (~175 days), we know it booted
 * 175 days ago. We create a synthetic "online" event at that boot time.
 *
 * @param cameraId - Camera ID
 * @param pollTimestamp - When the poll occurred
 * @param uptimeSeconds - Camera-reported seconds since last boot
 * @param bootId - Current boot ID
 */
export async function backfillFromUptimeSeconds(
  cameraId: string,
  pollTimestamp: Date,
  uptimeSeconds: number,
  bootId: string
): Promise<boolean> {
  if (uptimeSeconds <= 0) return false;

  try {
    // Check if already backfilled
    const [camera] = await db.select().from(cameras).where(eq(cameras.id, cameraId));
    if (!camera || camera.historyBackfilled) return false;

    // Calculate boot timestamp
    const bootTimestamp = new Date(pollTimestamp.getTime() - (uptimeSeconds * 1000));

    // Check if we already have events at or before this boot time
    const existingEarly = await storage.getLatestEventBefore(cameraId, bootTimestamp);
    if (existingEarly) {
      // Already have historical data, mark as backfilled and skip
      await db.update(cameras)
        .set({ historyBackfilled: true, lastBootAt: bootTimestamp, updatedAt: new Date() })
        .where(eq(cameras.id, cameraId));
      return false;
    }

    // Create synthetic "online" event at boot time
    await db.insert(uptimeEvents).values({
      cameraId,
      timestamp: bootTimestamp,
      status: "online",
      uptimeSeconds: 0,
      bootId: bootId || "",
      isSynthetic: true,
    });

    // Update camera with boot timestamp and mark as backfilled
    await db.update(cameras)
      .set({
        historyBackfilled: true,
        lastBootAt: bootTimestamp,
        updatedAt: new Date(),
      })
      .where(eq(cameras.id, cameraId));

    const daysAgo = Math.floor(uptimeSeconds / 86400);
    console.log(`[Backfill] ✓ Created synthetic boot event for camera ${cameraId}: booted ${daysAgo} days ago (${bootTimestamp.toISOString()})`);
    return true;
  } catch (error: any) {
    console.warn(`[Backfill] ⚠ Failed for camera ${cameraId}: ${error.message}`);
    return false;
  }
}

/**
 * Fetch and parse system log from camera for historical reboot events.
 *
 * Queries /axis-cgi/admin/systemlog.cgi (requires admin auth) and parses
 * syslog-format entries for boot/reboot/shutdown events.
 *
 * @param ipAddress - Camera IP
 * @param username - Admin username
 * @param password - Admin password
 * @param timeout - Request timeout in ms
 * @returns Array of parsed boot events
 */
export async function fetchSystemLog(
  ipAddress: string,
  username: string,
  password: string,
  timeout: number = 10000
): Promise<BootEvent[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `http://${ipAddress}/axis-cgi/admin/systemlog.cgi`;

    const response = await authFetch(url, username, password, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Authentication failed for system log");
      }
      if (response.status === 404) {
        throw new Error("System log endpoint not available on this camera");
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    return parseSyslogEntries(text);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`System log fetch timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Parse syslog-format text into boot event entries.
 *
 * Typical syslog format:
 *   Jan 15 03:22:11 axis-camera [ INFO ] system startup
 *   Dec 20 14:05:33 axis-camera [ CRIT ] system reboot
 *
 * Note: Syslog timestamps lack year - we infer from context.
 */
function parseSyslogEntries(logText: string): BootEvent[] {
  const events: BootEvent[] = [];
  const lines = logText.split("\n");

  // Patterns indicating boot/reboot events
  const bootPatterns = [
    { regex: /system\s+startup/i, type: "startup" as const },
    { regex: /system\s+reboot/i, type: "reboot" as const },
    { regex: /system\s+shutdown/i, type: "shutdown" as const },
    { regex: /booting/i, type: "startup" as const },
    { regex: /watchdog.*restart/i, type: "reboot" as const },
    { regex: /firmware.*upgrade.*reboot/i, type: "reboot" as const },
    { regex: /power.*(lost|restored|cycle)/i, type: "reboot" as const },
  ];

  // Syslog timestamp regex: "Jan 15 03:22:11"
  const timestampRegex = /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/;

  const monthMap: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const now = new Date();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line matches any boot pattern
    const matchedPattern = bootPatterns.find((p) => p.regex.test(trimmed));
    if (!matchedPattern) continue;

    // Parse timestamp
    const tsMatch = trimmed.match(timestampRegex);
    if (!tsMatch) continue;

    const month = monthMap[tsMatch[1]];
    if (month === undefined) continue;

    const day = parseInt(tsMatch[2]);
    const hours = parseInt(tsMatch[3]);
    const minutes = parseInt(tsMatch[4]);
    const seconds = parseInt(tsMatch[5]);

    // Infer year: syslog lacks year. Use current year, but if the resulting
    // date is in the future, use previous year.
    let year = now.getFullYear();
    const eventDate = new Date(year, month, day, hours, minutes, seconds);

    if (eventDate.getTime() > now.getTime()) {
      year--;
      eventDate.setFullYear(year);
    }

    events.push({
      timestamp: eventDate,
      type: matchedPattern.type,
      message: trimmed,
    });
  }

  // Sort chronologically
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return events;
}

/**
 * Backfill historical reboot events from camera system log.
 *
 * Creates synthetic uptime events for each historical boot/reboot found in
 * the system log. This extends the reboot detection history backward.
 *
 * @param cameraId - Camera ID
 * @param ipAddress - Camera IP
 * @param username - Admin username
 * @param password - Admin password
 */
export async function backfillFromSystemLog(
  cameraId: string,
  ipAddress: string,
  username: string,
  password: string
): Promise<number> {
  try {
    const bootEvents = await fetchSystemLog(ipAddress, username, password);

    if (bootEvents.length === 0) {
      console.log(`[Backfill] No historical boot events found in system log for ${ipAddress}`);
      return 0;
    }

    let created = 0;

    for (const event of bootEvents) {
      // Check if we already have an event near this timestamp (within 5 min)
      const windowStart = new Date(event.timestamp.getTime() - 5 * 60 * 1000);
      const windowEnd = new Date(event.timestamp.getTime() + 5 * 60 * 1000);

      const existing = await db
        .select()
        .from(uptimeEvents)
        .where(
          and(
            eq(uptimeEvents.cameraId, cameraId),
            lte(uptimeEvents.timestamp, windowEnd)
          )
        )
        .limit(1);

      // Simple duplicate check - if we have any event in this window, skip
      if (existing.length > 0 && existing[0].timestamp >= windowStart) {
        continue;
      }

      // Create synthetic events based on event type
      if (event.type === "shutdown" || event.type === "reboot") {
        // Camera went offline
        await db.insert(uptimeEvents).values({
          cameraId,
          timestamp: event.timestamp,
          status: "offline",
          isSynthetic: true,
        });
        created++;
      }

      if (event.type === "startup" || event.type === "reboot") {
        // Camera came back online (add 30s delay for startup after reboot)
        const startupTime = event.type === "reboot"
          ? new Date(event.timestamp.getTime() + 30000)
          : event.timestamp;

        await db.insert(uptimeEvents).values({
          cameraId,
          timestamp: startupTime,
          status: "online",
          uptimeSeconds: 0,
          isSynthetic: true,
        });
        created++;
      }
    }

    if (created > 0) {
      console.log(`[Backfill] ✓ Created ${created} synthetic events from system log for ${ipAddress}`);
    }
    return created;
  } catch (error: any) {
    // System log access may fail on many cameras (404, auth issues) - that's OK
    console.log(`[Backfill] System log not available for ${ipAddress}: ${error.message}`);
    return 0;
  }
}
