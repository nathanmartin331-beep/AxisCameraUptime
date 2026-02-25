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
import { connect as tlsConnect } from "tls";
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";

export interface CameraConnectionInfo {
  protocol?: string;       // "http" | "https" (default: "http")
  port?: number;           // 80/443/custom (default: 80)
  verifySslCert?: boolean; // false = accept self-signed (default: false) — derived from certValidationMode
  certValidationMode?: "none" | "tofu" | "ca"; // TLS validation strategy
  caCert?: string | null;  // PEM from global settings, passed in by caller
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

// Optional custom CA certificate for enterprise deployments.
// Set CAMERA_CA_PATH to a PEM file to trust an internal CA for camera HTTPS connections.
let customCaCert: Buffer | undefined;
const caCertPath = process.env.CAMERA_CA_PATH;
if (caCertPath && existsSync(caCertPath)) {
  customCaCert = readFileSync(caCertPath);
  console.log(`[TLS] Loaded custom CA certificate from ${caCertPath}`);
}

// Cache HTTPS agents by config to avoid creating new ones per request.
// Key: "verify=true" or "verify=false"
const agentCache = new Map<string, Agent>();

/**
 * Get an undici Agent (dispatcher) for HTTPS connections.
 * Returns undefined for HTTP connections (no dispatcher needed).
 *
 * Dispatchers are keyed by validation mode:
 * - "none" / "tofu" → rejectUnauthorized: false (TOFU enforcement happens in monitor)
 * - "ca" → rejectUnauthorized: true + ca cert (from conn.caCert, env var, or system)
 */
export function getCameraDispatcher(
  conn?: CameraConnectionInfo
): Agent | undefined {
  const protocol = conn?.protocol || "http";
  if (protocol !== "https") return undefined;

  const mode = conn?.certValidationMode || "none";
  const verify = mode === "ca";

  // Build cache key: "none" or "ca:<prefix>" to bound cache size
  let key: string;
  if (mode === "ca" && conn?.caCert) {
    const prefix = createHash("sha256").update(conn.caCert.substring(0, 64)).digest("hex").substring(0, 12);
    key = `ca:${prefix}`;
  } else if (mode === "ca") {
    key = "ca:env";
  } else {
    key = "none";
  }

  let agent = agentCache.get(key);
  if (!agent) {
    const connectOpts: Record<string, any> = {
      rejectUnauthorized: verify,
    };
    // Inject CA cert: prefer conn.caCert (user-uploaded), then env var, then system default
    if (mode === "ca" && conn?.caCert) {
      connectOpts.ca = Buffer.from(conn.caCert);
    } else if (customCaCert) {
      connectOpts.ca = customCaCert;
    }
    agent = new Agent({ connect: connectOpts });
    agentCache.set(key, agent);
  }
  return agent;
}

/**
 * Clear the cached HTTPS agents. Call when global CA cert changes.
 */
export function clearAgentCache(): void {
  for (const agent of agentCache.values()) {
    agent.close();
  }
  agentCache.clear();
}

/**
 * Extract CameraConnectionInfo from a camera database record.
 * Provides safe defaults for cameras that predate the SSL fields.
 */
/**
 * Extract CameraConnectionInfo from a camera database record.
 * Provides safe defaults for cameras that predate the TLS cert validation fields.
 * Derives verifySslCert from certValidationMode for backward compat.
 */
export function getConnectionInfo(camera: {
  protocol?: string | null;
  port?: number | null;
  verifySslCert?: boolean | null;
  certValidationMode?: string | null;
}): CameraConnectionInfo {
  const mode = (camera.certValidationMode as "none" | "tofu" | "ca") || "none";
  return {
    protocol: camera.protocol || "http",
    port: camera.port || (camera.protocol === "https" ? 443 : 80),
    verifySslCert: mode === "ca",
    certValidationMode: mode,
  };
}

/**
 * Capture the SHA-256 fingerprint of a camera's TLS certificate.
 * Used for TOFU (Trust On First Use) certificate pinning.
 *
 * Connects to the camera's TLS port, grabs the peer certificate,
 * and returns the SHA-256 hash as a lowercase hex string.
 * Returns null if the connection fails or the camera uses HTTP.
 */
export async function captureSslFingerprint(
  ipAddress: string,
  port: number = 443,
  timeoutMs: number = 5000
): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = tlsConnect(
      {
        host: ipAddress,
        port,
        rejectUnauthorized: false, // Accept self-signed to read cert
        timeout: timeoutMs,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate(false);
          if (cert && cert.raw) {
            const fingerprint = createHash("sha256")
              .update(cert.raw)
              .digest("hex");
            socket.destroy();
            resolve(fingerprint);
          } else {
            socket.destroy();
            resolve(null);
          }
        } catch {
          socket.destroy();
          resolve(null);
        }
      }
    );

    socket.on("error", () => {
      socket.destroy();
      resolve(null);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}
