/**
 * Camera Capability Interfaces and Flags
 * Provides type-safe capability checking for model-aware features
 */

import type { CameraCapabilities } from "@shared/schema";

/**
 * Capability flags enum for bitwise operations
 */
export enum CapabilityFlags {
  NONE = 0,
  PTZ = 1 << 0,           // 0b00000001
  AUDIO = 1 << 1,         // 0b00000010
  MULTI_SENSOR = 1 << 2,  // 0b00000100
  IR = 1 << 3,            // 0b00001000
  OUTDOOR = 1 << 4,       // 0b00010000
  ANALYTICS = 1 << 5,     // 0b00100000
  HIGH_RES = 1 << 6,      // 0b01000000
  EDGE_STORAGE = 1 << 7,  // 0b10000000
}

/**
 * Check if camera has PTZ capability
 */
export function hasPTZCapability(capabilities?: CameraCapabilities): boolean {
  return capabilities?.ptz?.enabled === true;
}

/**
 * Check if camera has audio capability
 */
export function hasAudioCapability(capabilities?: CameraCapabilities): boolean {
  return capabilities?.audio?.enabled === true;
}

/**
 * Check if camera is multi-sensor
 */
export function isMultiSensorCamera(capabilities?: CameraCapabilities): boolean {
  return capabilities?.multiSensor?.enabled === true &&
         (capabilities?.multiSensor?.sensorCount ?? 0) > 1;
}

/**
 * Get number of audio channels
 */
export function getAudioChannelCount(capabilities?: CameraCapabilities): number {
  return capabilities?.audio?.channels ?? 0;
}

/**
 * Get number of sensors
 */
export function getSensorCount(capabilities?: CameraCapabilities): number {
  return capabilities?.multiSensor?.sensorCount ?? 1;
}

/**
 * Check if camera supports panoramic view (multi-sensor stitching)
 */
export function supportsPanoramic(capabilities?: CameraCapabilities): boolean {
  return capabilities?.multiSensor?.panoramic === true;
}

/**
 * Check if camera has motion detection analytics
 */
export function hasMotionDetection(capabilities?: CameraCapabilities): boolean {
  return capabilities?.analytics?.motionDetection === true;
}

/**
 * Check if camera has tampering detection
 */
export function hasTamperingDetection(capabilities?: CameraCapabilities): boolean {
  return capabilities?.analytics?.tampering === true;
}

/**
 * Check if camera has object detection
 */
export function hasObjectDetection(capabilities?: CameraCapabilities): boolean {
  return capabilities?.analytics?.objectDetection === true;
}

/**
 * Get PTZ ranges if available
 */
export function getPTZRanges(capabilities?: CameraCapabilities): {
  panRange?: { min: number; max: number };
  tiltRange?: { min: number; max: number };
  zoomRange?: { min: number; max: number };
} | null {
  if (!capabilities?.ptz?.enabled) return null;

  return {
    panRange: capabilities.ptz.panRange,
    tiltRange: capabilities.ptz.tiltRange,
    zoomRange: capabilities.ptz.zoomRange,
  };
}

/**
 * Get supported video formats
 */
export function getSupportedFormats(capabilities?: CameraCapabilities): string[] {
  return capabilities?.supportedFormats ?? ["jpeg"];
}

/**
 * Get maximum framerate
 */
export function getMaxFramerate(capabilities?: CameraCapabilities): number {
  return capabilities?.maxFramerate ?? 30;
}

/**
 * Get resolution string
 */
export function getResolution(capabilities?: CameraCapabilities): string {
  return capabilities?.resolution ?? "1920x1080";
}

/**
 * Parse resolution string to dimensions
 */
export function parseResolution(resolution: string): { width: number; height: number } | null {
  const match = resolution.match(/(\d+)x(\d+)/);
  if (!match) return null;

  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10),
  };
}

/**
 * Check if camera is 4K or higher
 */
export function is4KOrHigher(capabilities?: CameraCapabilities): boolean {
  const resolution = capabilities?.resolution;
  if (!resolution) return false;

  const parsed = parseResolution(resolution);
  if (!parsed) return false;

  // 4K is 3840x2160 or higher
  return parsed.width >= 3840;
}

/**
 * Get multi-sensor channel IDs
 */
export function getMultiSensorChannelIds(capabilities?: CameraCapabilities): number[] {
  return capabilities?.multiSensor?.channelIds ?? [1];
}

/**
 * Check if camera has edge storage
 */
export function hasEdgeStorage(capabilities?: CameraCapabilities): boolean {
  return capabilities?.system?.edgeStorage === true;
}

/**
 * Get system architecture
 */
export function getArchitecture(capabilities?: CameraCapabilities): string | undefined {
  return capabilities?.system?.architecture;
}

/**
 * Get system-on-chip (SoC) information
 */
export function getSoC(capabilities?: CameraCapabilities): string | undefined {
  return capabilities?.system?.soc;
}

/**
 * Build capability flags bitfield
 */
export function buildCapabilityFlags(capabilities?: CameraCapabilities): number {
  let flags = CapabilityFlags.NONE;

  if (hasPTZCapability(capabilities)) {
    flags |= CapabilityFlags.PTZ;
  }

  if (hasAudioCapability(capabilities)) {
    flags |= CapabilityFlags.AUDIO;
  }

  if (isMultiSensorCamera(capabilities)) {
    flags |= CapabilityFlags.MULTI_SENSOR;
  }

  if (hasMotionDetection(capabilities) || hasObjectDetection(capabilities)) {
    flags |= CapabilityFlags.ANALYTICS;
  }

  if (is4KOrHigher(capabilities)) {
    flags |= CapabilityFlags.HIGH_RES;
  }

  if (hasEdgeStorage(capabilities)) {
    flags |= CapabilityFlags.EDGE_STORAGE;
  }

  return flags;
}

/**
 * Check if flags contain specific capability
 */
export function hasCapabilityFlag(flags: number, capability: CapabilityFlags): boolean {
  return (flags & capability) !== 0;
}

/**
 * Get human-readable capability list
 */
export function getCapabilityList(capabilities?: CameraCapabilities): string[] {
  const list: string[] = [];

  if (hasPTZCapability(capabilities)) list.push("PTZ");
  if (hasAudioCapability(capabilities)) list.push("Audio");
  if (isMultiSensorCamera(capabilities)) list.push("Multi-Sensor");
  if (hasMotionDetection(capabilities)) list.push("Motion Detection");
  if (hasObjectDetection(capabilities)) list.push("Object Detection");
  if (is4KOrHigher(capabilities)) list.push("4K");
  if (hasEdgeStorage(capabilities)) list.push("Edge Storage");

  return list;
}
