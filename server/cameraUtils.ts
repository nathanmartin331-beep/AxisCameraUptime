import https from 'https';
import type { Camera } from '@shared/schema';

export interface CameraURLOptions {
  ipAddress: string;
  protocol?: string;
  port?: number;
  useSSL?: boolean;
}

export function buildCameraURL(camera: CameraURLOptions, endpoint: string): string {
  const protocol = camera.protocol || (camera.useSSL ? 'https' : 'http');
  const port = camera.port || (protocol === 'https' ? 443 : 80);
  
  const isDefaultPort = 
    (protocol === 'http' && port === 80) || 
    (protocol === 'https' && port === 443);
  
  const portSuffix = isDefaultPort ? '' : `:${port}`;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  return `${protocol}://${camera.ipAddress}${portSuffix}${cleanEndpoint}`;
}

export function createHTTPSAgent(verifyCert: boolean = false): https.Agent {
  return new https.Agent({
    rejectUnauthorized: verifyCert,
    timeout: 10000,
    keepAlive: false,
  });
}

export function createFetchOptions(
  camera: Camera,
  signal?: AbortSignal
): RequestInit {
  const options: RequestInit = {
    signal,
    headers: {
      "User-Agent": "AxisCameraMonitor/1.0",
    },
  };

  if (camera.useSSL || camera.protocol === 'https') {
    const agent = createHTTPSAgent(camera.verifySslCert);
    (options as any).agent = agent;
    
    if (!camera.verifySslCert && process.env.NODE_ENV === 'production') {
      console.warn(
        `[Security] Camera ${camera.name} (${camera.ipAddress}) uses HTTPS with unverified certificates. ` +
        `This is vulnerable to man-in-the-middle attacks.`
      );
    }
  }

  return options;
}

export function createBasicAuthHeader(username: string, password: string): string {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

export function addBasicAuth(
  headers: Record<string, string>,
  username: string,
  password: string
): Record<string, string> {
  return {
    ...headers,
    'Authorization': createBasicAuthHeader(username, password),
  };
}
