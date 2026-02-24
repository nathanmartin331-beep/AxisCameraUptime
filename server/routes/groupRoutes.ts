import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { z } from "zod";
import { validateId, sendError, getUserId } from "./shared";

const router = Router();

// List groups
router.get("/api/groups", requireAuth, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const groups = await storage.getGroupsByUserId(userId);

    const groupsWithCounts = await Promise.all(
      groups.map(async (group) => {
        const [members, occupancy] = await Promise.all([
          storage.getGroupMembers(group.id),
          storage.getGroupCurrentOccupancy(group.id),
        ]);
        return { ...group, memberCount: members.length, totalOccupancy: occupancy.total };
      })
    );

    res.json(groupsWithCounts);
  } catch (error) {
    console.error("Error fetching groups:", error);
    sendError(res, 500, "Failed to fetch groups");
  }
});

// Create group
router.post("/api/groups", requireAdmin, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const createGroupSchema = z.object({
      name: z.string().min(1, "Group name is required"),
      description: z.string().optional(),
      color: z.string().optional(),
    });

    const validatedData = createGroupSchema.parse(req.body);
    const group = await storage.createGroup({ ...validatedData, userId });
    res.status(201).json(group);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    console.error("Error creating group:", error);
    sendError(res, 500, "Failed to create group");
  }
});

// Get group detail
router.get("/api/groups/:id", requireAuth, async (req: any, res) => {
  try {
    const groupId = validateId(req.params.id);
    if (!groupId) return sendError(res, 400, "Invalid group ID");

    const group = await storage.getGroupById(groupId);
    if (!group) return sendError(res, 404, "Group not found");
    if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const members = await storage.getGroupMembers(group.id);
    const safeMembersList = members.map(({ encryptedPassword, ...c }) => c);
    res.json({ ...group, members: safeMembersList });
  } catch (error) {
    console.error("Error fetching group:", error);
    sendError(res, 500, "Failed to fetch group");
  }
});

// Update group
router.patch("/api/groups/:id", requireAdmin, async (req: any, res) => {
  try {
    const groupId = validateId(req.params.id);
    if (!groupId) return sendError(res, 400, "Invalid group ID");
    if (!req.body || typeof req.body !== "object") return sendError(res, 400, "Request body is required");

    const updateGroupSchema = z.object({
      name: z.string().min(1, "Group name cannot be empty").max(200).optional(),
      description: z.string().max(1000).optional(),
      color: z.string().max(50).optional(),
    });

    const validatedData = updateGroupSchema.parse(req.body);
    if (Object.keys(validatedData).length === 0) return sendError(res, 400, "No valid fields to update");

    const group = await storage.getGroupById(groupId);
    if (!group) return sendError(res, 404, "Group not found");
    if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const updated = await storage.updateGroup(groupId, validatedData);
    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    console.error("Error updating group:", error);
    sendError(res, 500, "Failed to update group");
  }
});

// Delete group
router.delete("/api/groups/:id", requireAdmin, async (req: any, res) => {
  try {
    const groupId = validateId(req.params.id);
    if (!groupId) return sendError(res, 400, "Invalid group ID");

    const group = await storage.getGroupById(groupId);
    if (!group) return sendError(res, 404, "Group not found");
    if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    await storage.deleteGroup(groupId);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting group:", error);
    sendError(res, 500, "Failed to delete group");
  }
});

// Add cameras to group
router.post("/api/groups/:id/members", requireAdmin, async (req: any, res) => {
  try {
    const groupId = validateId(req.params.id);
    if (!groupId) return sendError(res, 400, "Invalid group ID");

    const group = await storage.getGroupById(groupId);
    if (!group) return sendError(res, 404, "Group not found");
    if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const memberSchema = z.object({
      cameraIds: z.array(z.string().min(1)).min(1, "At least one camera ID required").max(100, "Maximum 100 cameras per request"),
    });
    const { cameraIds } = memberSchema.parse(req.body);

    for (const camId of cameraIds) {
      if (!validateId(camId)) return sendError(res, 400, `Invalid camera ID format: ${camId.substring(0, 20)}`);
    }

    const userId = getUserId(req);
    for (const camId of cameraIds) {
      const camera = await storage.getCameraById(camId);
      if (!camera || camera.userId !== userId) return sendError(res, 400, `Camera ${camId} not found or not owned by you`);
    }

    for (const camId of cameraIds) {
      await storage.addCameraToGroup(groupId, camId);
    }

    const members = await storage.getGroupMembers(groupId);
    const safeMembers = members.map(({ encryptedPassword, ...c }) => c);
    res.json({ members: safeMembers });
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, error.errors[0].message);
    console.error("Error adding members:", error);
    sendError(res, 500, "Failed to add members");
  }
});

// Remove camera from group
router.delete("/api/groups/:id/members/:cameraId", requireAdmin, async (req: any, res) => {
  try {
    const groupId = validateId(req.params.id);
    if (!groupId) return sendError(res, 400, "Invalid group ID");

    const cameraId = validateId(req.params.cameraId);
    if (!cameraId) return sendError(res, 400, "Invalid camera ID");

    const group = await storage.getGroupById(groupId);
    if (!group) return sendError(res, 404, "Group not found");
    if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    await storage.removeCameraFromGroup(groupId, cameraId);
    res.status(204).send();
  } catch (error) {
    console.error("Error removing member:", error);
    sendError(res, 500, "Failed to remove member");
  }
});

// Group occupancy
router.get("/api/groups/:id/occupancy", requireAuth, async (req: any, res) => {
  try {
    const groupId = validateId(req.params.id);
    if (!groupId) return sendError(res, 400, "Invalid group ID");

    const group = await storage.getGroupById(groupId);
    if (!group) return sendError(res, 404, "Group not found");
    if (group.userId !== getUserId(req)) return sendError(res, 403, "Forbidden");

    const occupancy = await storage.getGroupCurrentOccupancy(groupId);
    res.json(occupancy);
  } catch (error) {
    console.error("Error fetching group occupancy:", error);
    sendError(res, 500, "Failed to fetch group occupancy");
  }
});

export default router;
