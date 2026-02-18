import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import SqliteStore from "better-sqlite3-session-store";
import passport from "./auth";
import authRoutes from "./authRoutes";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startCameraMonitoring } from "./cameraMonitor";
import { startAnalyticsPolling } from "./services/analyticsPoller";
import { startDataRetentionService } from "./services/dataRetention";
import { startDataAggregationService } from "./services/dataAggregation";
import { ensureDefaultUser } from "./defaultUser";
import { sqlite } from "./db";

const app = express();
const BetterSqlite3Store = SqliteStore(session);

// Session configuration with SQLite-based storage (replaces file-store to fix
// Windows EPERM errors caused by file-locking during atomic renames)
app.use(
  session({
    store: new BetterSqlite3Store({
      client: sqlite,
      expired: {
        clear: true,
        intervalMs: 15 * 60 * 1000, // Clean expired sessions every 15 min
      },
    }),
    secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

// Body parser middleware - MUST come before routes
declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Mount auth routes
app.use("/api/auth", authRoutes);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    if (status >= 500) {
      console.error("Unhandled error:", err);
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, async () => {
    log(`serving on port ${port}`);

    // Ensure default user exists for auto-login
    await ensureDefaultUser();

    // Start camera monitoring service
    startCameraMonitoring();

    // Start analytics polling service (people counting, occupancy)
    startAnalyticsPolling();

    // Start data retention service (daily cleanup of old events)
    startDataRetentionService();

    // Start data aggregation service (hourly/daily rollups for scale)
    startDataAggregationService();
  });

  // Graceful shutdown handlers
  const shutdown = (signal: string) => {
    console.log(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
