import { Router } from "express";
import passport from "./auth";
import { hashPassword, requireAuth } from "./auth";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { getDefaultCredentials } from "./defaultUser";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    message: "Too many authentication attempts, please try again after 15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successful requests
});

// Rate limiter for registration endpoint
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour
  message: {
    message: "Too many registration attempts, please try again after 1 hour"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Register schema with password confirmation
const registerSchema = insertUserSchema.extend({
  passwordConfirm: z.string(),
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Passwords don't match",
  path: ["passwordConfirm"],
});

// Register new user
router.post("/register", async (req, res) => {
  try {
    // Validate request body
    const validatedData = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await storage.getUserByEmail(validatedData.email);
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await hashPassword(validatedData.password);

    // Create user
    const user = await storage.createUser({
      email: validatedData.email,
      password: hashedPassword,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
    });

    // Auto-login after registration
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: "Registration successful but login failed" });
      }
      res.status(201).json(user);
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: error.errors,
      });
    }
    console.error("Registration error:", error);
    res.status(500).json({ message: "Failed to register user" });
  }
});

// Auto-login endpoint (DEVELOPMENT ONLY - for local network deployment)
router.post("/auto-login", async (req, res) => {
  // SECURITY: Only allow auto-login in development mode
  if (process.env.NODE_ENV !== 'development') {
    console.warn('[SECURITY] Auto-login attempt blocked in production mode');
    return res.status(403).json({
      message: "Auto-login is disabled in production for security reasons"
    });
  }

  console.warn('[SECURITY] Auto-login endpoint used - this should only be used in development');

  // Check if already logged in
  if (req.isAuthenticated()) {
    return res.json(req.user);
  }

  try {
    // Get default user from database (regardless of password)
    const credentials = getDefaultCredentials();
    const user = await storage.getUserByEmail(credentials.email);

    if (!user) {
      return res.status(500).json({ message: "Default user not found" });
    }

    // Directly create session without password authentication
    // This allows auto-login to work even after password change
    req.login(user, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({ message: "Auto-login session creation failed" });
      }
      // Return safe user without password
      const { password, ...safeUser } = user;
      res.json(safeUser);
    });
  } catch (error) {
    console.error("Auto-login error:", error);
    res.status(500).json({ message: "Auto-login failed" });
  }
});

// Login
router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err: any, user: any, info: any) => {
    if (err) {
      return res.status(500).json({ message: "Login failed" });
    }
    if (!user) {
      return res.status(401).json({ message: info?.message || "Invalid credentials" });
    }
    req.login(user, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({ message: "Login failed" });
      }
      res.json(user);
    });
  })(req, res, next);
});

// Logout
router.post("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ message: "Logout failed" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

// Get current user
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// Change password
router.post("/change-password", requireAuth, async (req, res) => {
  console.log("Password change request received");
  console.log("Request body:", req.body);
  console.log("User:", req.user);
  
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req.user as any).id;

    if (!currentPassword || !newPassword) {
      console.log("Missing required fields");
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (newPassword.length < 8) {
      console.log("Password too short");
      return res.status(400).json({ message: "New password must be at least 8 characters long" });
    }

    // Get user with password
    console.log("Getting user by ID:", userId);
    const user = await storage.getUserById(userId);
    if (!user) {
      console.log("User not found");
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    console.log("Verifying current password");
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      console.log("Current password incorrect");
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    console.log("Hashing new password");
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    console.log("Updating password in database");
    await storage.updateUser(userId, { password: hashedPassword });

    console.log("Password changed successfully");
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
});

export default router;
