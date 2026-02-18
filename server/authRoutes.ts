import { Router } from "express";
import passport from "./auth";
import { hashPassword, requireAuth, requireAdmin } from "./auth";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { getDefaultCredentials } from "./defaultUser";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import type { SafeUser } from "./storage";

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
router.post("/register", registerLimiter, async (req, res) => {
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
  // SECURITY: Only allow auto-login when NODE_ENV is explicitly 'development'
  if (!(process.env.NODE_ENV === 'development')) {
    console.warn('[SECURITY] Auto-login attempt blocked - NODE_ENV is not "development"');
    return res.status(403).json({
      message: "Auto-login is disabled outside of development mode for security reasons"
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
router.post("/login", authLimiter, (req, res, next) => {
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
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req.user as any).id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters long" });
    }

    // Get user with password
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await storage.updateUser(userId, { password: hashedPassword });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
});

// ===== Profile editing =====

// PATCH /api/auth/me - Update own profile (name only)
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
    });
    const data = schema.parse(req.body);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const userId = (req.user as SafeUser).id;
    const updated = await storage.updateUser(userId, data);
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// ===== Admin user management =====

// GET /api/auth/users - List all users (admin only)
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// POST /api/auth/users - Create user (admin only)
router.post("/users", requireAdmin, async (req, res) => {
  try {
    const createUserSchema = z.object({
      email: z.string().email("Invalid email address"),
      password: z.string().min(8, "Password must be at least 8 characters"),
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      role: z.enum(["admin", "viewer"]).optional().default("viewer"),
    });

    const data = createUserSchema.parse(req.body);

    // Check for duplicate email
    const existing = await storage.getUserByEmail(data.email);
    if (existing) {
      return res.status(409).json({ message: "User with this email already exists" });
    }

    const hashedPassword = await hashPassword(data.password);
    const user = await storage.createUser({
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      role: data.role,
    });

    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    console.error("Create user error:", error);
    res.status(500).json({ message: "Failed to create user" });
  }
});

// PATCH /api/auth/users/:id - Update user (admin only)
router.patch("/users/:id", requireAdmin, async (req, res) => {
  try {
    const updateUserSchema = z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      email: z.string().email().optional(),
      role: z.enum(["admin", "viewer"]).optional(),
      password: z.string().min(8).optional(),
    });

    const data = updateUserSchema.parse(req.body);
    const targetId = req.params.id;
    const currentUser = req.user as SafeUser;

    // Prevent admin from changing their own role
    if (data.role && targetId === currentUser.id) {
      return res.status(400).json({ message: "Cannot change your own role" });
    }

    // Check target user exists
    const target = await storage.getSafeUser(targetId);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    // If demoting an admin, check they're not the last admin
    if (data.role === "viewer" && target.role === "admin") {
      const allUsers = await storage.getAllUsers();
      const adminCount = allUsers.filter(u => u.role === "admin").length;
      if (adminCount <= 1) {
        return res.status(400).json({ message: "Cannot remove the last admin user" });
      }
    }

    // Check for duplicate email
    if (data.email && data.email !== target.email) {
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(409).json({ message: "User with this email already exists" });
      }
    }

    // Hash password if provided
    const updateData: Record<string, any> = { ...data };
    if (data.password) {
      updateData.password = await hashPassword(data.password);
    }

    const updated = await storage.updateUser(targetId, updateData);
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    console.error("Update user error:", error);
    res.status(500).json({ message: "Failed to update user" });
  }
});

// DELETE /api/auth/users/:id - Delete user (admin only)
router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;
    const currentUser = req.user as SafeUser;

    // Prevent admin from deleting themselves
    if (targetId === currentUser.id) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }

    // Check target user exists
    const target = await storage.getSafeUser(targetId);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    // If deleting an admin, check they're not the last admin
    if (target.role === "admin") {
      const allUsers = await storage.getAllUsers();
      const adminCount = allUsers.filter(u => u.role === "admin").length;
      if (adminCount <= 1) {
        return res.status(400).json({ message: "Cannot remove the last admin user" });
      }
    }

    await storage.deleteUser(targetId);
    res.status(204).send();
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

export default router;
