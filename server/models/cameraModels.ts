/**
 * Camera Model Registry
 * Defines specifications for 15+ Axis camera models across 4 series
 */

/**
 * Camera model specification
 */
export interface CameraModel {
  model: string;              // e.g., "P3255-LVE"
  series: 'P' | 'Q' | 'M' | 'F';
  fullName: string;           // e.g., "AXIS P3255-LVE Network Camera"

  // Specifications
  resolution: string;         // e.g., "1920x1080"
  maxFramerate: number;       // FPS
  hasPTZ: boolean;
  hasAudio: boolean;
  audioChannels: number;
  numberOfSensors: number;    // Multi-sensor count

  // Features
  features: string[];         // ["outdoor", "ir", "WDR", "zipstream"]

  // Common use cases
  useCase?: string;
}

/**
 * Model registry with 15+ Axis camera models
 */
export const MODEL_REGISTRY: Record<string, CameraModel> = {
  // P-Series (Fixed cameras - high performance)
  "P3255-LVE": {
    model: "P3255-LVE",
    series: "P",
    fullName: "AXIS P3255-LVE Network Camera",
    resolution: "1920x1080",
    maxFramerate: 60,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["outdoor", "ir", "WDR", "zipstream", "lightfinder"],
    useCase: "Outdoor surveillance with excellent low-light performance",
  },
  "P3245-LVE": {
    model: "P3245-LVE",
    series: "P",
    fullName: "AXIS P3245-LVE Network Camera",
    resolution: "1920x1080",
    maxFramerate: 60,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["outdoor", "ir", "WDR", "zipstream"],
    useCase: "Outdoor fixed dome with IR illumination",
  },
  "P3265-LVE": {
    model: "P3265-LVE",
    series: "P",
    fullName: "AXIS P3265-LVE Network Camera",
    resolution: "3840x2160",
    maxFramerate: 30,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["outdoor", "4K", "ir", "WDR", "zipstream"],
    useCase: "High-resolution 4K outdoor surveillance",
  },
  "P1455-LE": {
    model: "P1455-LE",
    series: "P",
    fullName: "AXIS P1455-LE Network Camera",
    resolution: "1920x1080",
    maxFramerate: 60,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["outdoor", "ir", "WDR", "zipstream", "bullet"],
    useCase: "Bullet camera for long-distance surveillance",
  },

  // Q-Series (PTZ cameras - pan/tilt/zoom)
  "Q6155-E": {
    model: "Q6155-E",
    series: "Q",
    fullName: "AXIS Q6155-E PTZ Network Camera",
    resolution: "1920x1080",
    maxFramerate: 60,
    hasPTZ: true,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["outdoor", "PTZ", "32x-zoom", "ir", "WDR", "autotracking"],
    useCase: "High-performance PTZ with 32x optical zoom",
  },
  "Q6225-LE": {
    model: "Q6225-LE",
    series: "Q",
    fullName: "AXIS Q6225-LE PTZ Network Camera",
    resolution: "1920x1080",
    maxFramerate: 60,
    hasPTZ: true,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["outdoor", "PTZ", "32x-zoom", "ir", "WDR"],
    useCase: "Outdoor PTZ with IR illumination",
  },
  "Q3819-PVE": {
    model: "Q3819-PVE",
    series: "Q",
    fullName: "AXIS Q3819-PVE Network Camera",
    resolution: "3840x2160",
    maxFramerate: 30,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["outdoor", "4K", "ir", "WDR", "panoramic"],
    useCase: "4K panoramic fixed camera",
  },

  // M-Series (Multi-sensor cameras - 360° coverage)
  "M3068-P": {
    model: "M3068-P",
    series: "M",
    fullName: "AXIS M3068-P Panoramic Camera",
    resolution: "12MP",
    maxFramerate: 20,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 4,
    features: ["indoor", "multisensor", "panoramic", "360-degree"],
    useCase: "Indoor 360° coverage with 4 sensors",
  },
  "M4308-PLE": {
    model: "M4308-PLE",
    series: "M",
    fullName: "AXIS M4308-PLE Panoramic Camera",
    resolution: "32MP",
    maxFramerate: 10,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 4,
    features: ["outdoor", "multisensor", "panoramic", "360-degree", "ir"],
    useCase: "Outdoor 360° coverage with 4 sensors",
  },
  "M3077-PLVE": {
    model: "M3077-PLVE",
    series: "M",
    fullName: "AXIS M3077-PLVE Panoramic Camera",
    resolution: "24MP",
    maxFramerate: 15,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 4,
    features: ["outdoor", "multisensor", "panoramic", "180-degree", "ir"],
    useCase: "Outdoor 180° coverage with 4 sensors",
  },

  // F-Series (Modular cameras - flexible configurations)
  "F41": {
    model: "F41",
    series: "F",
    fullName: "AXIS F41 Main Unit",
    resolution: "Variable",
    maxFramerate: 60,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["modular", "indoor", "flexible"],
    useCase: "Modular main unit with interchangeable sensor units",
  },
  "F44": {
    model: "F44",
    series: "F",
    fullName: "AXIS F44 Main Unit",
    resolution: "Variable",
    maxFramerate: 60,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 4,
    numberOfSensors: 4,
    features: ["modular", "indoor", "flexible", "multisensor"],
    useCase: "Modular main unit supporting up to 4 sensors",
  },

  // Additional popular models
  "P1375-E": {
    model: "P1375-E",
    series: "P",
    fullName: "AXIS P1375-E Network Camera",
    resolution: "1920x1080",
    maxFramerate: 60,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["outdoor", "bullet", "ir", "WDR", "zipstream"],
    useCase: "Outdoor bullet camera with IR",
  },
  "Q1656-LE": {
    model: "Q1656-LE",
    series: "Q",
    fullName: "AXIS Q1656-LE Box Camera",
    resolution: "3840x2160",
    maxFramerate: 30,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 1,
    features: ["outdoor", "4K", "box", "WDR"],
    useCase: "High-resolution 4K box camera",
  },
  "M2026-LE": {
    model: "M2026-LE",
    series: "M",
    fullName: "AXIS M2026-LE Network Camera",
    resolution: "1920x1080",
    maxFramerate: 30,
    hasPTZ: false,
    hasAudio: true,
    audioChannels: 1,
    numberOfSensors: 2,
    features: ["outdoor", "multisensor", "compact", "ir"],
    useCase: "Compact dual-sensor outdoor camera",
  },
};

/**
 * Get camera model by series
 */
export function getModelsBySeries(series: 'P' | 'Q' | 'M' | 'F'): CameraModel[] {
  return Object.values(MODEL_REGISTRY).filter(model => model.series === series);
}

/**
 * Get camera model by name
 */
export function getModelByName(modelName: string): CameraModel | undefined {
  return MODEL_REGISTRY[modelName];
}

/**
 * Get all available camera models
 */
export function getAllModels(): CameraModel[] {
  return Object.values(MODEL_REGISTRY);
}

/**
 * Check if model exists in registry
 */
export function isKnownModel(modelName: string): boolean {
  return modelName in MODEL_REGISTRY;
}

/**
 * Get models with specific capability
 */
export function getModelsWithPTZ(): CameraModel[] {
  return Object.values(MODEL_REGISTRY).filter(model => model.hasPTZ);
}

export function getModelsWithAudio(): CameraModel[] {
  return Object.values(MODEL_REGISTRY).filter(model => model.hasAudio);
}

export function getMultiSensorModels(): CameraModel[] {
  return Object.values(MODEL_REGISTRY).filter(model => model.numberOfSensors > 1);
}
