import type { Response } from "express";
import { insertCameraSchema } from "@shared/schema";
import type { SafeUser } from "../storage";
import { z } from "zod";

/** Validate that a route param ID is a non-empty trimmed string */
export function validateId(id: unknown): string | null {
  if (typeof id !== "string" || id.trim().length === 0) return null;
  const trimmed = id.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  if (trimmed.length > 128) return null;
  return trimmed;
}

/** Parse and validate a 'days' query parameter. Returns validated number or default. */
export function validateDays(raw: unknown, defaultVal = 30): number | { error: string } {
  if (raw === undefined || raw === null || raw === "") return defaultVal;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return { error: "days must be an integer between 1 and 365" };
  }
  return parsed;
}

/** Sanitize a string input: trim and reject dangerous patterns */
export function sanitizeString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 10000) return null;
  return trimmed;
}

/** Send a consistent error response */
export function sendError(res: Response, status: number, message: string) {
  return res.status(status).json({ message, error: message });
}

/** Get user ID from request */
export function getUserId(req: any): string {
  return (req.user as SafeUser).id;
}

// Dashboard response cache
export const dashboardCache = new Map<string, { data: any; expiresAt: number }>();
export const DASHBOARD_CACHE_TTL_MS = 30_000;
const DASHBOARD_CACHE_MAX_SIZE = 1000;

export function dashboardCacheSet(key: string, value: { data: any; expiresAt: number }) {
  if (dashboardCache.size >= DASHBOARD_CACHE_MAX_SIZE) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    dashboardCache.forEach((v, k) => {
      if (v.expiresAt <= now) keysToDelete.push(k);
    });
    keysToDelete.forEach((k) => dashboardCache.delete(k));
    if (dashboardCache.size >= DASHBOARD_CACHE_MAX_SIZE) dashboardCache.clear();
  }
  dashboardCache.set(key, value);
}

// Schema for accepting plain password from frontend
export const createCameraSchema = insertCameraSchema
  .omit({ encryptedPassword: true, userId: true })
  .extend({
    password: z.string().min(1, "Password is required"),
  });

// Allowed fields for camera PATCH updates
export const ALLOWED_CAMERA_UPDATE_FIELDS = new Set([
  "name", "ipAddress", "username", "password", "location", "notes",
  "currentStatus", "videoStatus", "model", "series", "capabilities",
  "protocol", "port", "verifySslCert",
]);
