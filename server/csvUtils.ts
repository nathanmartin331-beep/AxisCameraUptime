// CSV import/export utilities for camera management
import type { Camera } from "@shared/schema";

export interface CameraCSVRow {
  name: string;
  ipAddress: string;
  username: string;
  password: string;
  location?: string;
  notes?: string;
  protocol?: string;
  port?: number;
  verifySslCert?: boolean;
}

export function parseCSV(csvContent: string): CameraCSVRow[] {
  const lines = csvContent.split("\n").map((line) => line.trim());
  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  // Parse header
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const requiredFields = ["name", "ipaddress", "username", "password"];

  for (const field of requiredFields) {
    if (!header.includes(field)) {
      throw new Error(`Missing required column: ${field}`);
    }
  }

  const cameras: CameraCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);
    if (values.length < 4) continue; // Skip invalid rows

    const protocolIdx = header.indexOf("protocol");
    const portIdx = header.indexOf("port");
    const sslIdx = header.indexOf("verifysslcert");

    const camera: CameraCSVRow = {
      name: values[header.indexOf("name")] || "",
      ipAddress: values[header.indexOf("ipaddress")] || "",
      username: values[header.indexOf("username")] || "",
      password: values[header.indexOf("password")] || "",
      location: values[header.indexOf("location")] || "",
      notes: values[header.indexOf("notes")] || "",
      ...(protocolIdx >= 0 && values[protocolIdx] && { protocol: values[protocolIdx].toLowerCase() }),
      ...(portIdx >= 0 && values[portIdx] && { port: parseInt(values[portIdx], 10) || undefined }),
      ...(sslIdx >= 0 && values[sslIdx] && { verifySslCert: values[sslIdx].toLowerCase() === "true" }),
    };

    // Validate required fields
    if (!camera.name || !camera.ipAddress || !camera.username || !camera.password) {
      console.warn(`Skipping invalid row ${i + 1}: missing required fields`);
      continue;
    }

    cameras.push(camera);
  }

  return cameras;
}

// Simple CSV line parser (handles quoted values)
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

export function generateCameraCSV(cameras: Array<Partial<Camera>>): string {
  const header = "Name,IPAddress,Location,Status,LastSeen,Notes,Protocol,Port,VerifySSLCert";
  const rows = cameras.map((camera) => {
    const name = (camera.name || "").replace(/,/g, ";");
    const ipAddress = camera.ipAddress || "";
    const location = (camera.location || "").replace(/,/g, ";");
    const status = camera.currentStatus || "unknown";
    const lastSeen = camera.lastSeenAt
      ? new Date(camera.lastSeenAt).toLocaleString()
      : "Never";
    const notes = (camera.notes || "").replace(/,/g, ";");
    const protocol = camera.protocol || "http";
    const port = camera.port || (protocol === "https" ? 443 : 80);
    const verifySslCert = camera.verifySslCert ? "true" : "false";

    return `${name},${ipAddress},${location},${status},${lastSeen},${notes},${protocol},${port},${verifySslCert}`;
  });

  return [header, ...rows].join("\n");
}

export function generateUptimeReportCSV(
  cameras: Array<{ name: string; ipAddress: string; uptime: number }>
): string {
  const header = "Camera Name,IP Address,Uptime (%),Status";
  const rows = cameras.map((camera) => {
    const name = (camera.name || "").replace(/,/g, ";");
    const ipAddress = camera.ipAddress || "";
    const uptime = camera.uptime.toFixed(2);
    const status = camera.uptime >= 99 ? "Excellent" : camera.uptime >= 95 ? "Good" : "Poor";

    return `${name},${ipAddress},${uptime},${status}`;
  });

  return [header, ...rows].join("\n");
}
