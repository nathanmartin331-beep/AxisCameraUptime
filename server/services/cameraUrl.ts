/**
 * Camera URL Builder & TLS Dispatcher
 *
 * Provides protocol-aware URL construction and HTTPS dispatcher management
 * for Axis camera connections. Supports HTTP, HTTPS, custom ports, and
 * self-signed certificate handling.
 *
 * AXIS OS 13+ defaults to HTTPS-only (port 80 disabled).
 * See docs/axis-vapix-edge-cases.md for protocol details.
 */

import { Agent } from "undici";

export interface CameraConnectionInfo {
  protocol?: string;       // "http" | "https" (default: "http")
  port?: number;           // 80/443/custom (default: 80)
  verifySslCert?: boolean; // false = accept self-signed (default: false)
}

/**
 * Build a full URL for a camera endpoint.
 * Omits port from URL when it's the default for the protocol.
 */
export function buildCameraUrl(
  ipAddress: string,
  endpoint: string,
  conn?: CameraConnectionInfo
): string {
  const protocol = conn?.protocol || "http";
  const port = conn?.port || (protocol === "https" ? 443 : 80);

  const isDefaultPort =
    (protocol === "http" && port === 80) ||
    (protocol === "https" && port === 443);
  const portSuffix = isDefaultPort ? "" : `:${port}`;

  return `${protocol}://${ipAddress}${portSuffix}${endpoint}`;
}

// Cache HTTPS agents by config to avoid creating new ones per request.
// Key: "verify=true" or "verify=false"
const agentCache = new Map<string, Agent>();

/**
 * Get an undici Agent (dispatcher) for HTTPS connections.
 * Returns undefined for HTTP connections (no dispatcher needed).
 *
 * For HTTPS, creates and caches an Agent with the appropriate
 * rejectUnauthorized setting. Self-signed certs are accepted
 * by default (verifySslCert=false) since most Axis cameras
 * ship with self-signed certificates.
 */
export function getCameraDispatcher(
  conn?: CameraConnectionInfo
): Agent | undefined {
  const protocol = conn?.protocol || "http";
  if (protocol !== "https") return undefined;

  const verify = conn?.verifySslCert ?? false;
  const key = `verify=${verify}`;

  let agent = agentCache.get(key);
  if (!agent) {
    agent = new Agent({
      connect: {
        rejectUnauthorized: verify,
      },
    });
    agentCache.set(key, agent);
  }
  return agent;
}

/**
 * Extract CameraConnectionInfo from a camera database record.
 * Provides safe defaults for cameras that predate the SSL fields.
 */
export function getConnectionInfo(camera: {
  protocol?: string | null;
  port?: number | null;
  verifySslCert?: boolean | null;
}): CameraConnectionInfo {
  return {
    protocol: camera.protocol || "http",
    port: camera.port || (camera.protocol === "https" ? 443 : 80),
    verifySslCert: camera.verifySslCert ?? false,
  };
}
