// Network scanner for discovering Axis cameras on a subnet
export interface ScanResult {
  ipAddress: string;
  isAxis: boolean;
  model?: string;
  error?: string;
}

async function checkAxisCamera(ipAddress: string, timeout: number = 3000): Promise<ScanResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Try to access the Axis VAPIX API
    const url = `http://${ipAddress}/axis-cgi/systemready.cgi`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "AxisCameraMonitor/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const text = await response.text();
      // Check if response contains systemready data
      if (text.includes("systemready=")) {
        return {
          ipAddress,
          isAxis: true,
          model: "Axis Camera", // Could parse from response if available
        };
      }
    }

    return {
      ipAddress,
      isAxis: false,
      error: `HTTP ${response.status}`,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      ipAddress,
      isAxis: false,
      error: error.message,
    };
  }
}

export async function scanSubnet(
  subnet: string,
  startRange: number,
  endRange: number
): Promise<ScanResult[]> {
  // Parse subnet (e.g., "192.168.1")
  const baseIP = subnet.replace(/\.$/, "");

  console.log(
    `[Scanner] Scanning ${baseIP}.${startRange}-${endRange} for Axis cameras...`
  );

  const promises: Promise<ScanResult>[] = [];

  for (let i = startRange; i <= endRange; i++) {
    const ipAddress = `${baseIP}.${i}`;
    promises.push(checkAxisCamera(ipAddress));
  }

  // Check all IPs in parallel but limit concurrency
  const batchSize = 20; // Check 20 IPs at a time
  const results: ScanResult[] = [];

  for (let i = 0; i < promises.length; i += batchSize) {
    const batch = promises.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    console.log(
      `[Scanner] Checked ${Math.min(i + batchSize, promises.length)} / ${promises.length} IPs`
    );
  }

  const foundCameras = results.filter((r) => r.isAxis);
  console.log(`[Scanner] Found ${foundCameras.length} Axis cameras`);

  return results;
}

// New function to scan full IP ranges including multiple subnets
export async function scanIPRange(
  startIP: string,
  endIP: string
): Promise<ScanResult[]> {
  const startOctets = startIP.split('.').map(n => parseInt(n));
  const endOctets = endIP.split('.').map(n => parseInt(n));

  // Convert to 32-bit integers for easy iteration
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

  // Check all IPs in parallel with batching
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
