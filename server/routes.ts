import type { Express } from "express";
import { createServer, type Server } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";

// Route modules
import cameraRoutes from "./routes/cameraRoutes";
import networkRoutes from "./routes/networkRoutes";
import importExportRoutes from "./routes/importExportRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import groupRoutes from "./routes/groupRoutes";
import analyticsRoutes from "./routes/analyticsRoutes";
import settingsRoutes from "./routes/settingsRoutes";
import notificationRoutes from "./routes/notificationRoutes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Mount all route modules
  app.use(cameraRoutes);
  app.use(networkRoutes);
  app.use(importExportRoutes);
  app.use(dashboardRoutes);
  app.use(groupRoutes);
  app.use(analyticsRoutes);
  app.use(settingsRoutes);
  app.use(notificationRoutes);

  // Create HTTPS server if SSL certificate and key are provided via environment variables.
  const sslCertPath = process.env.SSL_CERT_PATH;
  const sslKeyPath = process.env.SSL_KEY_PATH;

  if (sslCertPath && sslKeyPath && existsSync(sslCertPath) && existsSync(sslKeyPath)) {
    const httpsOptions: { key: Buffer; cert: Buffer; ca?: Buffer } = {
      key: readFileSync(sslKeyPath),
      cert: readFileSync(sslCertPath),
    };
    const sslCaPath = process.env.SSL_CA_PATH;
    if (sslCaPath && existsSync(sslCaPath)) {
      httpsOptions.ca = readFileSync(sslCaPath);
    }
    console.log("[Server] HTTPS enabled — serving with TLS");
    return createHttpsServer(httpsOptions, app);
  }

  return createServer(app);
}
