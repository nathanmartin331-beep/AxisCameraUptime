// Network scanner for discovering Axis cameras on a subnet
// Supports HTTP probing, Bonjour/mDNS, and SSDP discovery
import os from 'os';
import { Agent } from 'undici';
export interface ScanResult {
  ipAddress: string;
  isAxis: boolean;
  model?: string;
  serial?: string;
  firmware?: string;
  series?: string; // P, Q, M, F
  discoveryMethod?: 'http' | 'https' | 'bonjour' | 'ssdp';
  detectedProtocol?: 'http' | 'https';
  capabilities?: {
    hasPTZ?: boolean;
    hasAudio?: boolean;
    resolution?: string;
  };
  error?: string;
}

export interface NetworkInterface {
  name: string;
  address: string;
  netmask: string;
  cidr: string;
  family: string;
}

/**
 * Returns the local network interfaces with their subnets
 * for suggesting scan ranges to the user
 */
export function getLocalSubnets(): NetworkInterface[] {
  const interfaces = os.networkInterfaces();
  const results: NetworkInterface[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal) continue; // skip loopback
      if (addr.family !== 'IPv4') continue; // IPv4 only for camera scanning

      // Calculate CIDR prefix from netmask
      const prefix = netmaskToPrefix(addr.netmask);
      const networkAddr = calculateNetworkAddress(addr.address, addr.netmask);

      results.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        cidr: `${networkAddr}/${prefix}`,
        family: addr.family,
      });
    }
  }

  return results;
}

function netmaskToPrefix(netmask: string): number {
  return netmask
    .split('.')
    .map(octet => parseInt(octet).toString(2))
    .join('')
    .split('')
    .filter(bit => bit === '1').length;
}

function calculateNetworkAddress(ip: string, netmask: string): string {
  const ipOctets = ip.split('.').map(Number);
  const maskOctets = netmask.split('.').map(Number);
  return ipOctets.map((octet, i) => octet & maskOctets[i]).join('.');
}

/**
 * Probe camera using unauthenticated basicdeviceinfo.cgi
 * Returns model/serial/firmware without needing credentials
 */
// Reusable HTTPS agent for discovery (accept self-signed certs)
const discoveryHttpsAgent = new Agent({ connect: { rejectUnauthorized: false } });

async function probeBasicDeviceInfo(
  ipAddress: string,
  timeout: number = 3000,
  protocol: 'http' | 'https' = 'http'
): Promise<{ model?: string; serial?: string; firmware?: string } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `${protocol}://${ipAddress}/axis-cgi/basicdeviceinfo.cgi`;
    const fetchOpts: any = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AxisCameraMonitor/2.0',
      },
      body: JSON.stringify({
        apiVersion: '1.0',
        method: 'getAllUnrestrictedProperties',
      }),
      signal: controller.signal,
    };
    if (protocol === 'https') fetchOpts.dispatcher = discoveryHttpsAgent;
    const response = await fetch(url, fetchOpts);

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const json = await response.json();
    if (json.error) return null;

    const props = json.data?.propertyList || {};
    return {
      model: props.ProdFullName || props.ProdNbr || undefined,
      serial: props.SerialNumber || undefined,
      firmware: props.Version || undefined,
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function checkAxisCamera(ipAddress: string, timeout: number = 3000): Promise<ScanResult> {
  // Try HTTP first, then HTTPS fallback (AXIS OS 13+ may have HTTP disabled)
  for (const protocol of ['http', 'https'] as const) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const url = `${protocol}://${ipAddress}/axis-cgi/systemready.cgi`;
      const fetchOpts: any = {
        signal: controller.signal,
        headers: { "User-Agent": "AxisCameraMonitor/2.0" },
      };
      if (protocol === 'https') fetchOpts.dispatcher = discoveryHttpsAgent;
      const response = await fetch(url, fetchOpts);

      clearTimeout(timeoutId);

      if (response.ok) {
        const text = await response.text();
        if (text.includes("systemready=")) {
          // Confirmed Axis camera - get device info without auth
          const deviceInfo = await probeBasicDeviceInfo(ipAddress, 3000, protocol);

          let model = deviceInfo?.model;
          let series: string | undefined;

          if (!model) {
            model = "Axis Camera";
          } else {
            // Parse series from model string
            const seriesMatch = model.match(/AXIS\s+([PQMFAITDWC])\d/i);
            series = seriesMatch ? seriesMatch[1].toUpperCase() : undefined;
          }

          return {
            ipAddress,
            isAxis: true,
            model,
            serial: deviceInfo?.serial,
            firmware: deviceInfo?.firmware,
            series,
            discoveryMethod: protocol,
            detectedProtocol: protocol,
          };
        }
      }

      // If HTTP gave a non-200 response, try HTTPS next
      if (protocol === 'http') continue;
      return { ipAddress, isAxis: false, error: `HTTP ${response.status}` };
    } catch (error: any) {
      clearTimeout(timeoutId);
      // If HTTP failed (connection refused/timeout), try HTTPS
      if (protocol === 'http') continue;
      return { ipAddress, isAxis: false, error: error.message };
    }
  }

  return { ipAddress, isAxis: false, error: 'No response on HTTP or HTTPS' };
}

/**
 * Discover Axis cameras via Bonjour/mDNS multicast
 * Axis cameras advertise as _axis-video._tcp
 */
export async function discoverBonjour(timeoutMs: number = 5000): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  const seen = new Set<string>();

  try {
    const { Bonjour } = await import('bonjour-service');
    const bonjour = new Bonjour();

    return new Promise((resolve) => {
      const browser = bonjour.find({ type: 'axis-video' });

      browser.on('up', (service: any) => {
        const addresses = service.addresses || [];
        for (const addr of addresses) {
          // Only IPv4
          if (addr.includes(':')) continue;
          if (seen.has(addr)) continue;
          seen.add(addr);

          const model = service.txt?.model || service.txt?.productFullName || service.name;
          const serial = service.txt?.macaddress || service.txt?.serialNumber;

          results.push({
            ipAddress: addr,
            isAxis: true,
            model: model || 'Axis Camera',
            serial,
            discoveryMethod: 'bonjour',
          });
        }
      });

      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        console.log(`[Scanner] Bonjour discovered ${results.length} camera(s)`);
        resolve(results);
      }, timeoutMs);
    });
  } catch (error: any) {
    console.log(`[Scanner] Bonjour discovery failed: ${error.message}`);
    return results;
  }
}

/**
 * Discover Axis cameras via SSDP/UPnP multicast
 * Axis cameras respond to urn:axis-com:service:BasicService:1
 */
export async function discoverSSDP(timeoutMs: number = 5000): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  const seen = new Set<string>();

  try {
    const { Client: SSDPClient } = await import('node-ssdp');
    const client = new SSDPClient();

    return new Promise((resolve) => {
      client.on('response', (headers: any, statusCode: number, rinfo: any) => {
        const ip = rinfo.address;
        if (seen.has(ip)) return;
        seen.add(ip);

        results.push({
          ipAddress: ip,
          isAxis: true,
          model: 'Axis Camera', // SSDP doesn't give model directly
          discoveryMethod: 'ssdp',
        });
      });

      // Search for Axis cameras specifically
      client.search('urn:axis-com:service:BasicService:1');

      // Also try generic UPnP search that Axis cameras respond to
      setTimeout(() => {
        client.search('ssdp:all');
      }, 1000);

      setTimeout(() => {
        client.stop();
        console.log(`[Scanner] SSDP discovered ${results.length} camera(s)`);
        resolve(results);
      }, timeoutMs);
    });
  } catch (error: any) {
    console.log(`[Scanner] SSDP discovery failed: ${error.message}`);
    return results;
  }
}

/**
 * Scan a subnet range for Axis cameras via HTTP probing
 */
export async function scanSubnet(
  subnet: string,
  startRange: number,
  endRange: number
): Promise<ScanResult[]> {
  const baseIP = subnet.replace(/\.$/, "");

  console.log(`[Scanner] Scanning ${baseIP}.${startRange}-${endRange} for Axis cameras...`);

  const promises: Promise<ScanResult>[] = [];

  for (let i = startRange; i <= endRange; i++) {
    const ipAddress = `${baseIP}.${i}`;
    promises.push(checkAxisCamera(ipAddress));
  }

  const batchSize = 20;
  const results: ScanResult[] = [];

  for (let i = 0; i < promises.length; i += batchSize) {
    const batch = promises.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    console.log(`[Scanner] Checked ${Math.min(i + batchSize, promises.length)} / ${promises.length} IPs`);
  }

  const foundCameras = results.filter((r) => r.isAxis);
  console.log(`[Scanner] Found ${foundCameras.length} Axis cameras`);

  return results;
}

/**
 * Scan full IP ranges including multiple subnets
 */
export async function scanIPRange(
  startIP: string,
  endIP: string
): Promise<ScanResult[]> {
  const startOctets = startIP.split('.').map(n => parseInt(n));
  const endOctets = endIP.split('.').map(n => parseInt(n));

  const ipToNumber = (octets: number[]) =>
    (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3];

  const numberToIP = (num: number) =>
    `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;

  const startNum = ipToNumber(startOctets);
  const endNum = ipToNumber(endOctets);
  const totalIPs = endNum - startNum + 1;

  console.log(`[Scanner] Scanning IP range ${startIP} to ${endIP} (${totalIPs} addresses)`);

  const promises: Promise<ScanResult>[] = [];

  for (let ipNum = startNum; ipNum <= endNum; ipNum++) {
    const ipAddress = numberToIP(ipNum);
    promises.push(checkAxisCamera(ipAddress));
  }

  const batchSize = 20;
  const results: ScanResult[] = [];

  for (let i = 0; i < promises.length; i += batchSize) {
    const batch = promises.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);

    const progress = Math.min(i + batchSize, promises.length);
    console.log(`[Scanner] Progress: ${progress} / ${totalIPs} IPs checked`);
  }

  const foundCameras = results.filter((r) => r.isAxis);
  console.log(`[Scanner] Found ${foundCameras.length} Axis cameras out of ${totalIPs} scanned`);

  return results;
}

/**
 * Unified discovery: runs multicast discovery + subnet scan in parallel
 * Merges results from Bonjour, SSDP, and HTTP probing
 */
export async function discoverCameras(
  subnet?: string,
  options?: { bonjour?: boolean; ssdp?: boolean; httpScan?: boolean; timeoutMs?: number }
): Promise<ScanResult[]> {
  const opts = {
    bonjour: true,
    ssdp: true,
    httpScan: true,
    timeoutMs: 5000,
    ...options,
  };

  const allResults: ScanResult[] = [];
  const seen = new Map<string, ScanResult>(); // IP -> best result

  const tasks: Promise<ScanResult[]>[] = [];

  // Multicast discovery (works across any subnet the server can reach)
  if (opts.bonjour) {
    tasks.push(discoverBonjour(opts.timeoutMs));
  }
  if (opts.ssdp) {
    tasks.push(discoverSSDP(opts.timeoutMs));
  }

  // HTTP subnet scan (if subnet provided)
  if (opts.httpScan && subnet) {
    const [networkAddress, prefixLengthStr] = subnet.split('/');
    if (networkAddress && prefixLengthStr) {
      const prefixLength = parseInt(prefixLengthStr);
      if (!isNaN(prefixLength) && prefixLength >= 8 && prefixLength <= 30) {
        const octets = networkAddress.split('.').map(Number);
        const ipToNumber = (o: number[]) => (o[0] << 24) + (o[1] << 16) + (o[2] << 8) + o[3];
        const numberToIP = (n: number) => `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;

        const ipNum = ipToNumber(octets);
        const hostBits = 32 - prefixLength;
        const subnetMask = ~((1 << hostBits) - 1);
        const networkNum = (ipNum & subnetMask) >>> 0;
        const broadcastNum = (networkNum | ((1 << hostBits) - 1)) >>> 0;
        const startIP = numberToIP(networkNum + 1);
        const endIP = numberToIP(broadcastNum - 1);

        tasks.push(scanIPRange(startIP, endIP));
      }
    }
  }

  const allDiscoveryResults = await Promise.all(tasks);

  for (const results of allDiscoveryResults) {
    for (const result of results) {
      if (!result.isAxis) continue;

      const existing = seen.get(result.ipAddress);
      if (!existing) {
        seen.set(result.ipAddress, result);
      } else {
        // Merge: prefer HTTP results (richer info) but keep any data we have
        seen.set(result.ipAddress, {
          ...existing,
          model: result.model && result.model !== 'Axis Camera' ? result.model : existing.model,
          serial: result.serial || existing.serial,
          firmware: result.firmware || existing.firmware,
          series: result.series || existing.series,
          capabilities: result.capabilities || existing.capabilities,
          discoveryMethod: result.discoveryMethod === 'http' ? 'http' : existing.discoveryMethod,
        });
      }
    }
  }

  allResults.push(...Array.from(seen.values()));

  // For any camera found via multicast without full info, enrich via HTTP
  for (const result of allResults) {
    if (!result.firmware && !result.serial) {
      const deviceInfo = await probeBasicDeviceInfo(result.ipAddress, 3000);
      if (deviceInfo) {
        result.model = deviceInfo.model || result.model;
        result.serial = deviceInfo.serial || result.serial;
        result.firmware = deviceInfo.firmware || result.firmware;
        if (result.model) {
          const seriesMatch = result.model.match(/AXIS\s+([PQMFAITDWC])\d/i);
          result.series = seriesMatch ? seriesMatch[1].toUpperCase() : result.series;
        }
      }
    }
  }

  console.log(`[Scanner] Unified discovery found ${allResults.length} camera(s)`);
  return allResults;
}
