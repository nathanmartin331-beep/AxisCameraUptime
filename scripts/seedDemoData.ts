/**
 * Seed Demo Data - Generates synthetic camera data for demonstration
 * Run with: npx tsx scripts/seedDemoData.ts
 */

import { db } from "../server/db";
import { cameras, uptimeEvents, users } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const DEMO_CAMERAS = [
  // Building A - Lobby and Entrances
  {
    name: "Main Entrance - North",
    ipAddress: "192.168.1.101",
    location: "Building A - Lobby",
    model: "P3255-LVE",
    series: "P",
    fullName: "AXIS P3255-LVE Network Camera",
    firmwareVersion: "11.6.94",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 60,
      supportedFormats: ["jpeg", "mjpeg", "h264", "h265"],
      analytics: { motionDetection: true, tampering: true, objectDetection: true, peopleCount: false },
    },
  },
  {
    name: "Main Entrance - South",
    ipAddress: "192.168.1.102",
    location: "Building A - Lobby",
    model: "P3245-LVE",
    series: "P",
    fullName: "AXIS P3245-LVE Network Camera",
    firmwareVersion: "11.5.64",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 30,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
    },
  },
  {
    name: "Reception Desk",
    ipAddress: "192.168.1.103",
    location: "Building A - Lobby",
    model: "M3068-P",
    series: "M",
    fullName: "AXIS M3068-P Network Camera",
    firmwareVersion: "10.12.208",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: false,
    audioChannels: 0,
    numberOfViews: 1,
    capabilities: {
      resolution: "3840x2160",
      maxFramerate: 30,
      supportedFormats: ["jpeg", "mjpeg", "h264", "h265"],
      analytics: { motionDetection: true, tampering: true, objectDetection: false, peopleCount: false },
    },
  },

  // Building A - Parking
  {
    name: "Parking Lot A - PTZ",
    ipAddress: "192.168.1.110",
    location: "Building A - Parking",
    model: "Q6155-E",
    series: "Q",
    fullName: "AXIS Q6155-E PTZ Network Camera",
    firmwareVersion: "11.4.52",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: true,
    hasAudio: true,
    audioChannels: 2,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 50,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
      ptz: { enabled: true, panRange: { min: -180, max: 180 }, tiltRange: { min: -20, max: 90 }, zoomRange: { min: 1, max: 32 }, presets: true, autoTracking: true },
    },
  },
  {
    name: "Parking Entrance Gate",
    ipAddress: "192.168.1.111",
    location: "Building A - Parking",
    model: "P1455-LE",
    series: "P",
    fullName: "AXIS P1455-LE Network Camera",
    firmwareVersion: "11.3.61",
    currentStatus: "warning",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: false,
    audioChannels: 0,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 30,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
    },
  },

  // Building B - Offices
  {
    name: "Office Floor 1 - Panoramic",
    ipAddress: "192.168.2.101",
    location: "Building B - Floor 1",
    model: "M3077-PLVE",
    series: "M",
    fullName: "AXIS M3077-PLVE Panoramic Camera",
    firmwareVersion: "11.5.64",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfViews: 4,
    capabilities: {
      resolution: "2560x1920",
      maxFramerate: 30,
      supportedFormats: ["jpeg", "mjpeg", "h264", "h265"],
      multiSensor: { enabled: true, sensorCount: 4, channelIds: [1, 2, 3, 4], panoramic: true },
    },
  },
  {
    name: "Office Floor 2 - East Wing",
    ipAddress: "192.168.2.102",
    location: "Building B - Floor 2",
    model: "P3265-LVE",
    series: "P",
    fullName: "AXIS P3265-LVE Network Camera",
    firmwareVersion: "11.6.94",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 60,
      supportedFormats: ["jpeg", "mjpeg", "h264", "h265"],
      analytics: { motionDetection: true, tampering: true, objectDetection: true, peopleCount: true },
    },
  },
  {
    name: "Office Floor 2 - West Wing",
    ipAddress: "192.168.2.103",
    location: "Building B - Floor 2",
    model: "P3265-LVE",
    series: "P",
    fullName: "AXIS P3265-LVE Network Camera",
    firmwareVersion: "11.6.94",
    currentStatus: "offline",
    videoStatus: "video_failed",
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 60,
      supportedFormats: ["jpeg", "mjpeg", "h264", "h265"],
    },
  },
  {
    name: "Server Room",
    ipAddress: "192.168.2.110",
    location: "Building B - Basement",
    model: "M3068-P",
    series: "M",
    fullName: "AXIS M3068-P Network Camera",
    firmwareVersion: "10.12.208",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: false,
    audioChannels: 0,
    numberOfViews: 1,
    capabilities: {
      resolution: "3840x2160",
      maxFramerate: 30,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
    },
  },

  // Warehouse
  {
    name: "Warehouse Entry",
    ipAddress: "192.168.3.101",
    location: "Warehouse",
    model: "Q6225-LE",
    series: "Q",
    fullName: "AXIS Q6225-LE PTZ Network Camera",
    firmwareVersion: "11.5.64",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: true,
    hasAudio: true,
    audioChannels: 1,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 50,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
      ptz: { enabled: true, panRange: { min: -180, max: 180 }, tiltRange: { min: -20, max: 90 }, zoomRange: { min: 1, max: 30 }, presets: true, autoTracking: false },
    },
  },
  {
    name: "Warehouse Floor - North",
    ipAddress: "192.168.3.102",
    location: "Warehouse",
    model: "P1375-E",
    series: "P",
    fullName: "AXIS P1375-E Network Camera",
    firmwareVersion: "10.12.208",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: false,
    audioChannels: 0,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 50,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
    },
  },
  {
    name: "Warehouse Floor - South",
    ipAddress: "192.168.3.103",
    location: "Warehouse",
    model: "P1375-E",
    series: "P",
    fullName: "AXIS P1375-E Network Camera",
    firmwareVersion: "10.12.208",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: false,
    audioChannels: 0,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 50,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
    },
  },
  {
    name: "Loading Dock",
    ipAddress: "192.168.3.110",
    location: "Warehouse",
    model: "Q3819-PVE",
    series: "Q",
    fullName: "AXIS Q3819-PVE Panoramic Camera",
    firmwareVersion: "11.4.52",
    currentStatus: "warning",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfViews: 4,
    capabilities: {
      resolution: "4320x1920",
      maxFramerate: 25,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
      multiSensor: { enabled: true, sensorCount: 4, channelIds: [1, 2, 3, 4], panoramic: true },
    },
  },

  // Perimeter
  {
    name: "Perimeter - North Fence",
    ipAddress: "192.168.4.101",
    location: "Perimeter",
    model: "P1455-LE",
    series: "P",
    fullName: "AXIS P1455-LE Network Camera",
    firmwareVersion: "11.3.61",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: false,
    audioChannels: 0,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 30,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
      analytics: { motionDetection: true, tampering: true, objectDetection: false, peopleCount: false },
    },
  },
  {
    name: "Perimeter - South Fence",
    ipAddress: "192.168.4.102",
    location: "Perimeter",
    model: "P1455-LE",
    series: "P",
    fullName: "AXIS P1455-LE Network Camera",
    firmwareVersion: "11.3.61",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: false,
    audioChannels: 0,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 30,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
    },
  },
  {
    name: "Perimeter - Main Gate PTZ",
    ipAddress: "192.168.4.110",
    location: "Perimeter",
    model: "Q6155-E",
    series: "Q",
    fullName: "AXIS Q6155-E PTZ Network Camera",
    firmwareVersion: "11.4.52",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: true,
    hasAudio: true,
    audioChannels: 2,
    numberOfViews: 1,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 50,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
      ptz: { enabled: true, panRange: { min: -180, max: 180 }, tiltRange: { min: -20, max: 90 }, zoomRange: { min: 1, max: 32 }, presets: true, autoTracking: true },
    },
  },

  // Modular System
  {
    name: "Secure Room - Multi-Sensor",
    ipAddress: "192.168.5.101",
    location: "Building A - Secure Area",
    model: "F44",
    series: "F",
    fullName: "AXIS F44 Main Unit",
    firmwareVersion: "11.2.50",
    currentStatus: "online",
    videoStatus: "video_ok",
    hasPTZ: false,
    hasAudio: false,
    audioChannels: 0,
    numberOfViews: 4,
    capabilities: {
      resolution: "1920x1080",
      maxFramerate: 30,
      supportedFormats: ["jpeg", "mjpeg", "h264"],
      multiSensor: { enabled: true, sensorCount: 4, channelIds: [1, 2, 3, 4], panoramic: false },
      system: { architecture: "armv7hf", soc: "Artpec-7", edgeStorage: true },
    },
  },
];

// Generate events for the past 30 days
function generateUptimeEvents(cameraId: string, currentStatus: string): Array<{
  cameraId: string;
  timestamp: Date;
  status: string;
  videoStatus: string | null;
  uptimeSeconds: number | null;
  bootId: string | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
}> {
  const events = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Generate boot ID
  const bootId = `boot-${Math.random().toString(36).substring(2, 10)}`;

  // Start with online status 30 days ago
  let currentTime = new Date(thirtyDaysAgo);
  let isOnline = true;
  let uptimeSeconds = 0;

  // Generate events every 1-4 hours with some variation
  while (currentTime < now) {
    const interval = (1 + Math.random() * 3) * 60 * 60 * 1000; // 1-4 hours in ms

    // Determine if there should be an incident (5% chance for online cameras, higher for current offline)
    const incidentChance = currentStatus === "offline" ? 0.15 : 0.05;

    if (isOnline && Math.random() < incidentChance) {
      // Create outage
      isOnline = false;
      events.push({
        cameraId,
        timestamp: new Date(currentTime),
        status: "offline",
        videoStatus: "video_failed",
        uptimeSeconds: null,
        bootId: null,
        responseTimeMs: null,
        errorMessage: Math.random() > 0.5 ? "Connection timeout" : "Network unreachable",
      });

      // Outage duration 5 min to 2 hours
      const outageDuration = (5 + Math.random() * 115) * 60 * 1000;
      currentTime = new Date(currentTime.getTime() + outageDuration);

      if (currentTime < now && !(currentStatus === "offline" && currentTime > new Date(now.getTime() - 2 * 60 * 60 * 1000))) {
        // Recovery
        isOnline = true;
        uptimeSeconds = 0;
        events.push({
          cameraId,
          timestamp: new Date(currentTime),
          status: "online",
          videoStatus: "video_ok",
          uptimeSeconds: uptimeSeconds,
          bootId,
          responseTimeMs: 50 + Math.floor(Math.random() * 150),
          errorMessage: null,
        });
      }
    } else if (isOnline) {
      // Normal polling event
      uptimeSeconds += Math.floor(interval / 1000);
      events.push({
        cameraId,
        timestamp: new Date(currentTime),
        status: "online",
        videoStatus: Math.random() > 0.02 ? "video_ok" : "video_failed",
        uptimeSeconds,
        bootId,
        responseTimeMs: 30 + Math.floor(Math.random() * 100),
        errorMessage: null,
      });
    }

    currentTime = new Date(currentTime.getTime() + interval);
  }

  // Add final current state
  const finalStatus = currentStatus === "offline" ? "offline" : currentStatus === "warning" ? "online" : "online";
  const finalVideoStatus = currentStatus === "offline" ? "video_failed" : "video_ok";

  events.push({
    cameraId,
    timestamp: now,
    status: finalStatus,
    videoStatus: finalVideoStatus,
    uptimeSeconds: finalStatus === "online" ? uptimeSeconds + 3600 : null,
    bootId: finalStatus === "online" ? bootId : null,
    responseTimeMs: finalStatus === "online" ? 45 + Math.floor(Math.random() * 80) : null,
    errorMessage: finalStatus === "offline" ? "Connection timeout" : null,
  });

  return events;
}

async function seed() {
  console.log("🌱 Seeding demo data...\n");

  // Ensure default user exists
  const defaultEmail = "admin@local";
  let user = await db.select().from(users).where(eq(users.email, defaultEmail)).then(r => r[0]);

  if (!user) {
    console.log("Creating default user...");
    const hashedPassword = await bcrypt.hash("demo1234", 12);
    [user] = await db.insert(users).values({
      email: defaultEmail,
      password: hashedPassword,
      firstName: "Demo",
      lastName: "Admin",
    }).returning();
    console.log(`✅ Created user: ${user.email}\n`);
  } else {
    console.log(`✅ Using existing user: ${user.email}\n`);
  }

  // Delete existing cameras for clean demo
  const existingCameras = await db.select().from(cameras).where(eq(cameras.userId, user.id));
  if (existingCameras.length > 0) {
    console.log(`Removing ${existingCameras.length} existing cameras...`);
    for (const cam of existingCameras) {
      await db.delete(uptimeEvents).where(eq(uptimeEvents.cameraId, cam.id));
      await db.delete(cameras).where(eq(cameras.id, cam.id));
    }
  }

  console.log(`📷 Creating ${DEMO_CAMERAS.length} demo cameras...\n`);

  for (const camData of DEMO_CAMERAS) {
    // Create camera
    const [camera] = await db.insert(cameras).values({
      userId: user.id,
      name: camData.name,
      ipAddress: camData.ipAddress,
      username: "root",
      encryptedPassword: await bcrypt.hash("demo_password", 10),
      location: camData.location,
      model: camData.model,
      series: camData.series as "P" | "Q" | "M" | "F" | null,
      fullName: camData.fullName,
      firmwareVersion: camData.firmwareVersion,
      currentStatus: camData.currentStatus,
      videoStatus: camData.videoStatus,
      hasPTZ: camData.hasPTZ,
      hasAudio: camData.hasAudio,
      audioChannels: camData.audioChannels,
      numberOfViews: camData.numberOfViews,
      capabilities: camData.capabilities as any,
      detectedAt: new Date(),
      detectionMethod: "import",
      lastSeenAt: camData.currentStatus === "online" ? new Date() : new Date(Date.now() - 2 * 60 * 60 * 1000),
    }).returning();

    console.log(`  ✓ ${camData.name} (${camData.model}) - ${camData.currentStatus}`);

    // Generate uptime events
    const events = generateUptimeEvents(camera.id, camData.currentStatus);

    // Insert events in batches
    const batchSize = 100;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      await db.insert(uptimeEvents).values(batch);
    }

    console.log(`    └─ Generated ${events.length} uptime events`);
  }

  console.log("\n✅ Demo data seeding complete!");
  console.log("\n📊 Summary:");
  console.log(`   • ${DEMO_CAMERAS.length} cameras created`);
  console.log(`   • Locations: Building A, Building B, Warehouse, Perimeter`);
  console.log(`   • Models: P-series, Q-series (PTZ), M-series (Panoramic), F-series (Modular)`);
  console.log(`   • Status mix: Online, Offline, Warning`);
  console.log("\n🔑 Login credentials:");
  console.log(`   • Email: ${defaultEmail}`);
  console.log(`   • Password: demo1234`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
