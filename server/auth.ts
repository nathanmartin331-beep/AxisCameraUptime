import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { storage, type SafeUser } from "./storage";
import type { User } from "@shared/schema";

// Bcrypt salt rounds for password hashing
const SALT_ROUNDS = 12;

// Configure Passport Local Strategy
passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        // Get user with password for verification
        const user: User | undefined = await storage.getUserByEmail(email);

        if (!user) {
          return done(null, false, { message: "Invalid email or password" });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
          return done(null, false, { message: "Invalid email or password" });
        }

        // Return user without password
        const { password: _, ...safeUser } = user;
        return done(null, safeUser);
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Serialize user ID into session
passport.serializeUser((user: Express.User, done) => {
  done(null, (user as SafeUser).id);
});

// Deserialize user from session using ID
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getSafeUser(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Hash password helper
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password helper
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Middleware to require authentication
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Authentication required" });
}

// Middleware to require admin role
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const user = req.user as SafeUser;
  if (user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}

// Middleware that accepts either API key (X-API-Key header) or session auth.
// Used on read endpoints that external consumers need to access.
export function requireApiKeyOrAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || typeof apiKey !== "string") {
    // No API key header — fall through to session auth
    return requireAuth(req, res, next);
  }

  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  storage.getApiKeyByHash(keyHash).then((record) => {
    if (!record) {
      return res.status(401).json({ message: "Invalid API key" });
    }
    // Check expiry
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
      return res.status(401).json({ message: "API key has expired" });
    }
    // Attach user identity to request (same shape as session auth)
    (req as any).user = { id: record.userId } as SafeUser;
    // Fire-and-forget: update lastUsedAt
    storage.updateApiKeyLastUsed(record.id).catch(() => {});
    return next();
  }).catch(() => {
    return res.status(500).json({ message: "Authentication error" });
  });
}

export default passport;
