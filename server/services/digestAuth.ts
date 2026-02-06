/**
 * HTTP Digest Authentication for Axis cameras
 *
 * Newer Axis firmware (AXIS OS 7+) defaults to Digest auth only.
 * This module handles the challenge-response flow:
 *   1. Send request without auth → get 401 with WWW-Authenticate header
 *   2. Parse the Digest challenge (realm, nonce, qop, etc.)
 *   3. Compute the response hash and resend with Authorization header
 */

import crypto from "crypto";

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

/**
 * Parse WWW-Authenticate: Digest header into components
 */
function parseDigestChallenge(header: string): DigestChallenge | null {
  if (!header.toLowerCase().startsWith("digest ")) {
    return null;
  }

  const params: Record<string, string> = {};
  // Match key="value" or key=value pairs
  const regex = /(\w+)=(?:"([^"]*)"|([\w]+))/g;
  let match;

  while ((match = regex.exec(header)) !== null) {
    params[match[1].toLowerCase()] = match[2] ?? match[3];
  }

  if (!params.realm || !params.nonce) {
    return null;
  }

  return {
    realm: params.realm,
    nonce: params.nonce,
    qop: params.qop,
    opaque: params.opaque,
    algorithm: params.algorithm,
  };
}

/**
 * Compute MD5 hash (standard for HTTP Digest)
 */
function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

/**
 * Build the Digest Authorization header value
 */
function buildDigestHeader(
  username: string,
  password: string,
  method: string,
  uri: string,
  challenge: DigestChallenge,
  nc: number = 1
): string {
  const algorithm = challenge.algorithm || "MD5";
  const ncHex = nc.toString(16).padStart(8, "0");
  const cnonce = crypto.randomBytes(8).toString("hex");

  // HA1 = MD5(username:realm:password)
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);

  // HA2 = MD5(method:uri)
  const ha2 = md5(`${method}:${uri}`);

  let response: string;

  if (challenge.qop === "auth" || challenge.qop?.includes("auth")) {
    // response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
    response = md5(`${ha1}:${challenge.nonce}:${ncHex}:${cnonce}:auth:${ha2}`);
  } else {
    // response = MD5(HA1:nonce:HA2)
    response = md5(`${ha1}:${challenge.nonce}:${ha2}`);
  }

  let header = `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${response}"`;

  if (challenge.qop) {
    header += `, qop=auth, nc=${ncHex}, cnonce="${cnonce}"`;
  }

  if (challenge.opaque) {
    header += `, opaque="${challenge.opaque}"`;
  }

  if (algorithm !== "MD5") {
    header += `, algorithm=${algorithm}`;
  }

  return header;
}

export interface AuthFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/**
 * Fetch with automatic Digest/Basic auth handling.
 *
 * Tries Basic auth first (fast path). On 401 with a Digest challenge,
 * retries using Digest authentication.
 */
export async function authFetch(
  url: string,
  username: string,
  password: string,
  options: AuthFetchOptions = {}
): Promise<Response> {
  const method = options.method || "GET";
  const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");

  // First attempt with Basic auth
  const firstResponse = await fetch(url, {
    method,
    signal: options.signal,
    headers: {
      "User-Agent": "AxisCameraMonitor/2.0",
      "Authorization": `Basic ${basicAuth}`,
      ...options.headers,
    },
    body: options.body,
  });

  // If Basic auth worked, return the response
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  // Check for Digest challenge
  const wwwAuth = firstResponse.headers.get("www-authenticate");
  if (!wwwAuth) {
    return firstResponse; // No challenge header, return the 401
  }

  const challenge = parseDigestChallenge(wwwAuth);
  if (!challenge) {
    return firstResponse; // Not a Digest challenge, return as-is
  }

  // Extract URI path from full URL
  const uri = new URL(url).pathname + new URL(url).search;

  const digestHeader = buildDigestHeader(
    username,
    password,
    method,
    uri,
    challenge
  );

  // Retry with Digest auth
  const digestResponse = await fetch(url, {
    method,
    signal: options.signal,
    headers: {
      "User-Agent": "AxisCameraMonitor/2.0",
      "Authorization": digestHeader,
      ...options.headers,
    },
    body: options.body,
  });

  return digestResponse;
}
