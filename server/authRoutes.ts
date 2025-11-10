import { Router } from "express";
import passport from "./auth";
import { hashPassword, requireAuth } from "./auth";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { getDefaultCredentials } from "./defaultUser";
import bcrypt from "bcryptjs";

const router = Router();

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

// Auto-login endpoint (for local network deployment)
router.post("/auto-login", async (req, res) => {
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
      console.log("User before destructuring:", user);
      const { password, ...safeUser } = user;
      console.log("Safe user after destructuring:", safeUser);
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

export default router;
