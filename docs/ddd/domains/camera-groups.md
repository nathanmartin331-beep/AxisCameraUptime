# Domain: Camera Groups

## Bounded Context

The Camera Groups domain allows administrators to organise cameras into named logical collections. Groups support aggregate occupancy queries and analytics trend data, enabling operators to reason about a location (e.g. a building floor or retail zone) as a unit rather than camera by camera.

This domain owns group creation, membership management (add/remove cameras), and the occupancy and analytics aggregation endpoints that operate at the group level.

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **CameraGroup** | A named collection of cameras, owned by a user. The primary aggregate of this domain. |
| **CameraGroupMember** | A join record linking a Camera to a CameraGroup. Represents membership. |
| **Membership** | The set of cameras belonging to a group. Managed via add/remove operations on the join table. |
| **Group Occupancy** | The real-time sum of occupancy values across all cameras in a group. Derived from the latest analytics events for each member. |
| **Aggregate Trend** | A time-bucketed (hourly) aggregation of an analytics event type across all cameras in a group. |
| **Member Count** | The number of cameras currently belonging to a group, included in list responses for display. |
| **Color** | An optional hex string used to visually distinguish groups in the UI. |

---

## Aggregate Roots

### CameraGroup
The root aggregate of this domain.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| userId | string | Owner reference |
| name | string | Required, max 200 characters |
| description | string \| null | Max 1000 characters |
| color | string \| null | Optional display colour (hex or named colour) |
| createdAt | Date | |

Invariants:
- A group belongs to exactly one user; a user cannot access groups owned by others.
- A group may contain zero or more cameras; empty groups are permitted.
- A camera may belong to multiple groups simultaneously.

### CameraGroupMember
A join entity linking Camera to CameraGroup.

| Field | Type | Notes |
|-------|------|-------|
| groupId | string | FK to CameraGroup |
| cameraId | string | FK to Camera |

---

## Value Objects

- **GroupOccupancy** — Computed at query time: `{ total: number, byCameraId: Record<string, number> }`. Not persisted.
- **GroupAnalyticsSummary** — Computed response: `{ totalIn, totalOut, currentOccupancy, memberCount, cameras: [...] }`. Not persisted.

---

## Domain Events

| Event | Trigger | Effect |
|-------|---------|--------|
| `GroupCreated` | `POST /api/groups` | New CameraGroup record persisted |
| `GroupUpdated` | `PATCH /api/groups/:id` | Name, description, or colour updated |
| `GroupDeleted` | `DELETE /api/groups/:id` | Group and all membership records deleted |
| `CameraAddedToGroup` | `POST /api/groups/:id/members` | CameraGroupMember join row inserted (up to 100 cameras per request) |
| `CameraRemovedFromGroup` | `DELETE /api/groups/:id/members/:cameraId` | CameraGroupMember row deleted |

---

## Anti-Corruption Layer

- **Ownership enforcement**: Every route that accesses a group by ID verifies `group.userId === getUserId(req)` and returns 403 otherwise. Camera ownership is similarly checked when adding cameras to a group.
- **Member camera ownership validation**: Before adding cameras to a group, each camera ID is verified to exist and be owned by the requesting user — cross-user contamination is prevented.
- **Batch limit on member add**: Adding members is capped at 100 cameras per request to prevent accidental large payloads.
- **Encrypted password stripping**: Member camera lists returned from group queries strip `encryptedPassword` before serialisation.
- **Admin-only writes**: Group creation, update, deletion, and membership changes require `requireAdmin`. Reading groups and occupancy is available to all authenticated users.
- **Zod validation on all inputs**: Group name/description/color and member camera ID arrays are validated through Zod schemas before persistence.

---

## Server Files

| File | Responsibility |
|------|---------------|
| `server/routes/groupRoutes.ts` | All group REST endpoints: CRUD for groups, member add/remove, group detail (with member list), occupancy query |

---

## Client Files

| File | Responsibility |
|------|---------------|
| `client/src/pages/Groups.tsx` | Group list page: displays all groups with member count, total occupancy, and navigation links |
| `client/src/pages/GroupDetail.tsx` | Group detail page: member list management, occupancy display, analytics trend chart |

---

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/groups` | any | List all groups for the current user with `memberCount` and `totalOccupancy` |
| POST | `/api/groups` | admin | Create a new group |
| GET | `/api/groups/:id` | any | Get group detail including full member camera list (passwords stripped) |
| PATCH | `/api/groups/:id` | admin | Update group name, description, or colour |
| DELETE | `/api/groups/:id` | admin | Delete group and all membership records |
| POST | `/api/groups/:id/members` | admin | Add one or more cameras to the group (up to 100 per request) |
| DELETE | `/api/groups/:id/members/:cameraId` | admin | Remove a single camera from the group |
| GET | `/api/groups/:id/occupancy` | any | Return current total occupancy for all cameras in the group |
| GET | `/api/groups/:id/analytics` | any | Aggregated analytics summary for the group (see Analytics domain) |
| GET | `/api/groups/:id/analytics/trend` | any | Hourly trend data for the group (see Analytics domain) |

---

## Dependencies

### What this domain depends on
- **Camera Registry** — `storage.getCameraById()` and `storage.getCamerasByUserId()` to validate camera ownership when adding members; member lists include camera data
- **Analytics** — `storage.getGroupCurrentOccupancy()` queries the latest occupancy events for member cameras; analytics routes (`/api/groups/:id/analytics`) delegate to the Analytics domain's storage queries
- **IAM** — `requireAuth`/`requireAdmin` on all routes
- `server/storage.ts` — Group and member CRUD: `createGroup`, `getGroupsByUserId`, `getGroupById`, `updateGroup`, `deleteGroup`, `addCameraToGroup`, `removeCameraFromGroup`, `getGroupMembers`, `getGroupCurrentOccupancy`

### What depends on this domain
- **Analytics** — analytics trend endpoint reads group members to aggregate event data
- **Dashboard & Observability** — Group Overview and Group Occupancy widgets read group list and per-group occupancy via these endpoints
