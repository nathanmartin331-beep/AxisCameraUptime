/**
 * Camera Model Detection Service
 *
 * Detects Axis camera models via VAPIX API (param.cgi)
 * and parses model information including series and features
 */

export interface CameraModelInfo {
  fullName?: string;
  model?: string;
  series?: string; // P, Q, M, F
  variant?: string; // E, V, L, etc.
  type?: string; // fixed-dome, box, ptz, modular
  features?: string[];
  capabilities?: {
    hasPTZ?: boolean;
    hasAudio?: boolean;
    resolution?: string;
  };
}

export interface ParsedModel {
  series?: string;
  model?: string;
  variant?: string;
  type?: string;
  features?: string[];
}

/**
 * Parse camera model string (e.g., "AXIS M3027-PVE")
 */
export function parseCameraModel(modelString: string | null | undefined): ParsedModel {
  if (!modelString) {
    return {};
  }

  // Normalize: uppercase and trim
  const normalized = modelString.toUpperCase().trim();

  // Extract series (P, Q, M, F) and model number
  const match = normalized.match(/AXIS\s+([PQMF])(\d+)(?:-([A-Z]+))?/i);

  if (!match) {
    return {};
  }

  const [, series, model, variant] = match;

  const result: ParsedModel = {
    series,
    model,
    variant,
  };

  // Determine camera type based on series
  if (series === 'M') {
    result.type = 'fixed-dome';
  } else if (series === 'P') {
    result.type = 'box';
  } else if (series === 'Q') {
    result.type = 'ptz';
  } else if (series === 'F') {
    result.type = 'modular';
  }

  // Extract features from variant
  result.features = extractFeatures(series, variant);

  return result;
}

/**
 * Extract features from model series and variant
 */
export function extractFeatures(series?: string, variant?: string): string[] {
  const features: string[] = [];

  if (!variant) {
    return features;
  }

  // Outdoor
  if (variant.includes('E')) {
    features.push('outdoor');
  }

  // Vandal-resistant
  if (variant.includes('V')) {
    features.push('vandal-resistant');
  }

  // Low-light
  if (variant.includes('L')) {
    features.push('low-light');
  }

  // PTZ (based on Q-series)
  if (series === 'Q') {
    features.push('pan-tilt-zoom');
  }

  return features;
}

/**
 * Detect camera model via VAPIX API
 *
 * @param ipAddress - Camera IP address
 * @param timeout - Request timeout in milliseconds (default: 5000)
 * @param credentials - Optional authentication credentials
 */
export async function detectCameraModel(
  ipAddress: string,
  timeout: number = 5000,
  credentials?: { username: string; password: string }
): Promise<CameraModelInfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Try to access VAPIX param.cgi API
    const url = `http://${ipAddress}/axis-cgi/param.cgi?action=list&group=root.Brand,root.Properties`;

    const headers: Record<string, string> = {
      'User-Agent': 'AxisCameraMonitor/1.0',
    };

    // Add basic auth if credentials provided
    if (credentials) {
      const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 401 = needs authentication, 404 = endpoint not found
      return {
        fullName: 'Unknown Axis Camera',
      };
    }

    const text = await response.text();

    // Parse VAPIX response format (key=value pairs)
    const result = parseVapixResponse(text);

    return result;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Timeout or network error - return minimal info
    return {
      fullName: 'Unknown Axis Camera',
    };
  }
}

/**
 * Parse VAPIX param.cgi response
 *
 * Format: root.Brand.Brand=AXIS
 *         root.Properties.ProdFullName=AXIS M3027-PVE Network Camera
 */
function parseVapixResponse(text: string): CameraModelInfo {
  const lines = text.split('\n');
  const properties: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();

    if (key && value) {
      properties[key] = value;
    }
  }

  // Extract product information
  const fullName = properties['root.Properties.ProdFullName']
    || properties['root.Properties.ProdNbr']
    || 'Unknown Axis Camera';

  // Parse the full product name
  const parsed = parseCameraModel(fullName);

  // Extract capabilities from properties
  const capabilities: CameraModelInfo['capabilities'] = {};

  // Check for PTZ
  if (parsed.series === 'Q' || properties['root.Properties.ProdType']?.includes('PTZ')) {
    capabilities.hasPTZ = true;
  }

  return {
    fullName,
    model: parsed.model,
    series: parsed.series,
    variant: parsed.variant,
    type: parsed.type,
    features: parsed.features,
    capabilities,
  };
}
