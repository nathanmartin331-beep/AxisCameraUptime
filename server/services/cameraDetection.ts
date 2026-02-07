/**
 * Camera Model Detection Service
 * Queries VAPIX API to detect camera model and capabilities
 */

import type { CameraCapabilities } from "@shared/schema";
import { authFetch } from "./digestAuth";

/**
 * VAPIX API response parser
 * Parses param.cgi responses in key=value format
 */
export class VAPIXResponseParser {
  /**
   * Parse param.cgi response
   * Format: root.Brand.ProdNbr=P3255-LVE
   */
  static parse(responseText: string): Record<string, string> {
    const result: Record<string, string> = {};

    const lines = responseText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Extract nested property with dot notation
   * e.g., get(data, 'Properties.PTZ.PTZ') => 'yes'
   */
  static get(data: Record<string, string>, path: string): string | undefined {
    // Try with root. prefix (VAPIX format)
    const withRoot = data[`root.${path}`];
    if (withRoot !== undefined) return withRoot;

    // Try without root. prefix
    return data[path];
  }

  /**
   * Check if value is truthy in VAPIX format
   * VAPIX uses: yes/no, true/false, 1/0
   */
  static isTrue(value: string | undefined): boolean {
    if (!value) return false;
    const lower = value.toLowerCase();
    return lower === 'yes' || lower === 'true' || lower === '1';
  }
}

/**
 * Camera model detection result
 */
export interface CameraModelDetection {
  // Basic Info
  brand: string;
  model: string;
  fullName: string;
  series: 'P' | 'Q' | 'M' | 'F' | 'Unknown';

  // Firmware
  firmwareVersion?: string;
  vapixVersion?: string;
  buildDate?: string;

  // Capability flags
  hasPTZ: boolean;
  hasAudio: boolean;
  audioChannels: number;
  numberOfViews: number;

  // Detailed capabilities
  capabilities: CameraCapabilities;

  // Detection metadata
  detectedAt: Date;
  detectionMethod: 'auto' | 'manual';
}

/**
 * Detection error types
 */
export class DetectionError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'AUTH_FAILED' | 'NETWORK_ERROR' | 'PARSE_ERROR',
    public readonly details?: any
  ) {
    super(message);
    this.name = 'DetectionError';
  }
}

/**
 * Camera model detector
 * Queries VAPIX param.cgi and extracts model information
 */
export class CameraModelDetector {
  private readonly timeout: number;

  constructor(timeout: number = 5000) {
    this.timeout = timeout;
  }

  /**
   * Detect camera model and capabilities
   */
  async detect(
    ipAddress: string,
    username: string,
    password: string
  ): Promise<CameraModelDetection> {
    try {
      // Phase 1: Get brand information
      const brandInfo = await this.queryVAPIX(
        ipAddress,
        username,
        password,
        'Brand'
      );

      // Phase 2: Get properties (capabilities)
      const properties = await this.queryVAPIX(
        ipAddress,
        username,
        password,
        'Properties'
      );

      // Phase 3: Get image source details
      const imageSource = await this.queryVAPIX(
        ipAddress,
        username,
        password,
        'ImageSource'
      );

      // Extract and combine data
      const model = this.extractModel(brandInfo);
      const series = this.detectSeries(model);
      const capabilities = this.extractCapabilities(properties, imageSource);

      return {
        brand: VAPIXResponseParser.get(brandInfo, 'Brand.Brand') || 'AXIS',
        model,
        fullName: VAPIXResponseParser.get(brandInfo, 'Brand.ProdFullName') || model,
        series,
        firmwareVersion: VAPIXResponseParser.get(properties, 'Properties.Firmware.Version'),
        vapixVersion: VAPIXResponseParser.get(properties, 'Properties.API.HTTP.Version'),
        buildDate: VAPIXResponseParser.get(properties, 'Properties.Firmware.BuildDate'),
        hasPTZ: VAPIXResponseParser.isTrue(VAPIXResponseParser.get(properties, 'Properties.PTZ.PTZ')),
        hasAudio: VAPIXResponseParser.isTrue(VAPIXResponseParser.get(properties, 'Properties.Audio.Audio')),
        audioChannels: parseInt(VAPIXResponseParser.get(properties, 'Properties.Audio.NbrOfChannels') || '0'),
        numberOfViews: parseInt(VAPIXResponseParser.get(properties, 'Properties.Image.NbrOfViews') || '1'),
        capabilities,
        detectedAt: new Date(),
        detectionMethod: 'auto',
      };
    } catch (error) {
      // If camera uses modern JSON API or rejects Basic auth, fall back to basicdeviceinfo.cgi
      if (error instanceof DetectionError && (error.details?.jsonResponse || error.code === 'AUTH_FAILED')) {
        try {
          return await this.detectModern(ipAddress, username, password);
        } catch (modernError) {
          // If modern API also fails (e.g. 404 on older firmware), throw original error
          throw error;
        }
      }
      if (error instanceof DetectionError) {
        throw error;
      }
      throw new DetectionError(
        error instanceof Error ? error.message : 'Unknown detection error',
        'NETWORK_ERROR',
        error
      );
    }
  }

  /**
   * Query VAPIX param.cgi endpoint
   */
  private async queryVAPIX(
    ipAddress: string,
    username: string,
    password: string,
    group: string
  ): Promise<Record<string, string>> {
    const url = `http://${ipAddress}/axis-cgi/param.cgi?action=list&group=${group}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await authFetch(url, username, password, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new DetectionError(
          'Authentication failed',
          'AUTH_FAILED'
        );
      }

      if (!response.ok) {
        throw new DetectionError(
          `HTTP ${response.status}: ${response.statusText}`,
          'NETWORK_ERROR',
          { status: response.status, statusText: response.statusText }
        );
      }

      const text = await response.text();

      // Detect JSON error response (modern VAPIX API v1.4+)
      if (text.trim().startsWith('{')) {
        throw new DetectionError(
          'Camera uses modern JSON-based VAPIX API',
          'PARSE_ERROR',
          { jsonResponse: true }
        );
      }

      return VAPIXResponseParser.parse(text);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DetectionError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new DetectionError(
            `Detection timeout after ${this.timeout}ms`,
            'TIMEOUT'
          );
        }
        throw new DetectionError(
          error.message,
          'NETWORK_ERROR',
          error
        );
      }
      throw new DetectionError('Unknown error during VAPIX query', 'NETWORK_ERROR');
    }
  }

  /**
   * Detect camera model using modern JSON-based VAPIX API (v1.4+)
   * Falls back to basicdeviceinfo.cgi when legacy param.cgi is not supported
   */
  private async detectModern(
    ipAddress: string,
    username: string,
    password: string
  ): Promise<CameraModelDetection> {
    const url = `http://${ipAddress}/axis-cgi/basicdeviceinfo.cgi`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await authFetch(url, username, password, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiVersion: '1.0',
          method: 'getAllProperties',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new DetectionError('Authentication failed', 'AUTH_FAILED');
      }

      if (!response.ok) {
        throw new DetectionError(
          `HTTP ${response.status}: ${response.statusText}`,
          'NETWORK_ERROR',
          { status: response.status }
        );
      }

      const json = await response.json();

      if (json.error) {
        throw new DetectionError(
          `VAPIX API error: ${json.error.message}`,
          'PARSE_ERROR',
          json.error
        );
      }

      const props = json.data?.propertyList || {};
      const model = props.ProdNbr || props.ProdShortName?.replace(/^AXIS\s+/, '') || 'Unknown';
      const series = this.detectSeries(model);

      const capabilities: CameraCapabilities = {};

      if (props.Architecture || props.Soc || props.SerialNumber || props.HardwareID) {
        capabilities.system = {
          architecture: props.Architecture,
          soc: props.Soc,
          serialNumber: props.SerialNumber,
          hardwareId: props.HardwareID,
          buildDate: props.BuildDate,
        };
      }

      return {
        brand: props.Brand || 'AXIS',
        model,
        fullName: props.ProdFullName || `AXIS ${model}`,
        series,
        firmwareVersion: props.Version,
        buildDate: props.BuildDate,
        hasPTZ: false,
        hasAudio: false,
        audioChannels: 0,
        numberOfViews: 1,
        capabilities,
        detectedAt: new Date(),
        detectionMethod: 'auto',
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof DetectionError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DetectionError(`Detection timeout after ${this.timeout}ms`, 'TIMEOUT');
      }
      throw new DetectionError(
        error instanceof Error ? error.message : 'Unknown error',
        'NETWORK_ERROR',
        error
      );
    }
  }

  /**
   * Extract model string from brand info
   */
  private extractModel(brandInfo: Record<string, string>): string {
    const prodNbr = VAPIXResponseParser.get(brandInfo, 'Brand.ProdNbr');
    const prodShortName = VAPIXResponseParser.get(brandInfo, 'Brand.ProdShortName');

    // ProdNbr is most reliable (e.g., "P3255-LVE")
    if (prodNbr) return prodNbr;

    // Fall back to ProdShortName and extract model
    if (prodShortName) {
      // "AXIS P3255-LVE" => "P3255-LVE"
      const match = prodShortName.match(/AXIS\s+(.+)/);
      if (match) return match[1];
      return prodShortName;
    }

    return 'Unknown';
  }

  /**
   * Detect camera series from model string
   */
  private detectSeries(model: string): 'P' | 'Q' | 'M' | 'F' | 'Unknown' {
    const upper = model.toUpperCase();

    if (upper.startsWith('P')) return 'P';
    if (upper.startsWith('Q')) return 'Q';
    if (upper.startsWith('M')) return 'M';
    if (upper.startsWith('F')) return 'F';

    return 'Unknown';
  }

  /**
   * Extract capabilities from properties and image source
   */
  private extractCapabilities(
    properties: Record<string, string>,
    imageSource: Record<string, string>
  ): CameraCapabilities {
    const capabilities: CameraCapabilities = {};

    // Video capabilities
    const resolution = VAPIXResponseParser.get(imageSource, 'ImageSource.I0.Sensor.Resolution');
    const maxFramerate = VAPIXResponseParser.get(imageSource, 'ImageSource.I0.Sensor.MaxFramerate');
    const formats = VAPIXResponseParser.get(properties, 'Properties.Image.Format');

    if (resolution) capabilities.resolution = resolution;
    if (maxFramerate) capabilities.maxFramerate = parseInt(maxFramerate);
    if (formats) capabilities.supportedFormats = formats.split(',').map(f => f.trim());

    // PTZ capabilities
    const hasPTZ = VAPIXResponseParser.isTrue(VAPIXResponseParser.get(properties, 'Properties.PTZ.PTZ'));
    if (hasPTZ) {
      capabilities.ptz = {
        enabled: true,
        presets: true, // Assume presets for all PTZ cameras
      };
    }

    // Audio capabilities
    const hasAudio = VAPIXResponseParser.isTrue(VAPIXResponseParser.get(properties, 'Properties.Audio.Audio'));
    const audioChannels = parseInt(VAPIXResponseParser.get(properties, 'Properties.Audio.NbrOfChannels') || '0');
    if (hasAudio) {
      capabilities.audio = {
        enabled: true,
        channels: audioChannels,
      };
    }

    // Multi-sensor capabilities
    const numberOfViews = parseInt(VAPIXResponseParser.get(properties, 'Properties.Image.NbrOfViews') || '1');
    if (numberOfViews > 1) {
      capabilities.multiSensor = {
        enabled: true,
        sensorCount: numberOfViews,
        channelIds: Array.from({ length: numberOfViews }, (_, i) => i + 1),
        panoramic: numberOfViews >= 4, // Assume 4+ sensors support panoramic
      };
    }

    // Analytics capabilities
    const motionDetection = VAPIXResponseParser.isTrue(
      VAPIXResponseParser.get(properties, 'Properties.MotionDetection.MotionDetection')
    );
    const tampering = VAPIXResponseParser.isTrue(
      VAPIXResponseParser.get(properties, 'Properties.Tampering.Tampering')
    );

    if (motionDetection || tampering) {
      capabilities.analytics = {
        motionDetection: motionDetection,
        tampering: tampering,
        objectDetection: false,
        peopleCount: false,
      };
    }

    // System info
    const architecture = VAPIXResponseParser.get(properties, 'Properties.System.Architecture');
    const soc = VAPIXResponseParser.get(properties, 'Properties.System.Soc');
    const serialNumber = VAPIXResponseParser.get(properties, 'Properties.System.SerialNumber');
    const hardwareId = VAPIXResponseParser.get(properties, 'Properties.System.HardwareID');
    const buildDate = VAPIXResponseParser.get(properties, 'Properties.Firmware.BuildDate');
    if (architecture || soc || serialNumber || hardwareId) {
      capabilities.system = {
        architecture,
        soc,
        serialNumber,
        hardwareId,
        buildDate,
      };
    }

    return capabilities;
  }
}

/**
 * Detect camera model with error handling wrapper
 */
export async function detectCameraModel(
  ipAddress: string,
  username: string,
  password: string,
  timeout?: number
): Promise<CameraModelDetection> {
  const detector = new CameraModelDetector(timeout);
  return detector.detect(ipAddress, username, password);
}
