import { Router, type IRouter } from "express";
import { db, departmentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetSessionResponse,
  SwitchSessionBody,
  UpdateMePreferencesBody,
} from "@workspace/api-zod";
import { getCurrentUser, setCurrentUser, type SessionUser } from "../lib/session";
import { visibleDepartmentIds } from "../lib/board-access";

const router: IRouter = Router();

// Returns the set of department ids the user can see boards for.
// `null` means "all departments" (admin). Mirrors the policy used by
// GET /api/departments so preference UI and server stay consistent.
async function accessibleDepartmentIds(
  user: SessionUser,
): Promise<Set<number> | null> {
  if (user.role === "admin") return null;
  if (user.role === "agent") {
    const ids = await visibleDepartmentIds(user);
    return new Set(ids ?? []);
  }
  // end_user — own department only (matches /departments behavior)
  return new Set(user.departmentId != null ? [user.departmentId] : []);
}

// Resolves a persisted default board slug against current access.
// If the slug is no longer accessible (or no longer exists), returns
// null so the UI doesn't redirect somewhere the user can't view. The
// same policy is shared across Tickets, Initiatives, Projects, and
// Operational Tasks so all four sections behave consistently.
async function resolveDefaultBoard(
  user: SessionUser,
  slug: string | null | undefined,
  allowedCache?: Set<number> | null,
): Promise<string | null> {
  if (!slug) return null;
  const [dept] = await db
    .select()
    .from(departmentsTable)
    .where(eq(departmentsTable.slug, slug))
    .limit(1);
  if (!dept) return null;
  const allowed =
    allowedCache !== undefined
      ? allowedCache
      : await accessibleDepartmentIds(user);
  if (allowed !== null && !allowed.has(dept.id)) return null;
  return slug;
}

async function buildSessionResponse(user: SessionUser) {
  let departmentName: string | null = null;
  if (user.departmentId != null) {
    const [dept] = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.id, user.departmentId))
      .limit(1);
    departmentName = dept?.name ?? null;
  }
  // Compute access set once and reuse for all four resolutions.
  const allowed = await accessibleDepartmentIds(user);
  const [
    defaultTicketBoard,
    defaultInitiativeBoard,
    defaultProjectBoard,
    defaultOperationalTaskBoard,
  ] = await Promise.all([
    resolveDefaultBoard(user, user.defaultTicketBoard, allowed),
    resolveDefaultBoard(user, user.defaultInitiativeBoard, allowed),
    resolveDefaultBoard(user, user.defaultProjectBoard, allowed),
    resolveDefaultBoard(user, user.defaultOperationalTaskBoard, allowed),
  ]);
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role as "admin" | "agent" | "end_user",
    departmentId: user.departmentId ?? null,
    departmentName,
    defaultTicketBoard,
    defaultInitiativeBoard,
    defaultProjectBoard,
    defaultOperationalTaskBoard,
  };
}

router.get("/session", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  res.json(GetSessionResponse.parse(await buildSessionResponse(user)));
});

router.post("/session", async (req, res): Promise<void> => {
  const parsed = SwitchSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const user = await setCurrentUser(parsed.data.userId);
    res.json(GetSessionResponse.parse(await buildSessionResponse(user)));
  } catch (e) {
    req.log.error({ err: e }, "Failed to switch session");
    res.status(404).json({ error: "User not found" });
  }
});

router.patch("/me/preferences", async (req, res): Promise<void> => {
  const parsed = UpdateMePreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = await getCurrentUser(req);

  // Build the partial update from whichever fields were provided.
  // Each is a department slug or `null` (reset to "all"). Validate any
  // non-null slug exists and is accessible before persisting.
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  const candidates: Array<{
    key:
      | "defaultTicketBoard"
      | "defaultInitiativeBoard"
      | "defaultProjectBoard"
      | "defaultOperationalTaskBoard";
    label: string;
  }> = [
    { key: "defaultTicketBoard", label: "ticket board" },
    { key: "defaultInitiativeBoard", label: "initiatives team" },
    { key: "defaultProjectBoard", label: "projects team" },
    { key: "defaultOperationalTaskBoard", label: "operational tasks team" },
  ];

  let allowed: Set<number> | null | undefined;
  for (const { key, label } of candidates) {
    if (!(key in (parsed.data as Record<string, unknown>))) continue;
    const next = (parsed.data as Record<string, string | null | undefined>)[
      key
    ] ?? null;
    if (next) {
      const [dept] = await db
        .select()
        .from(departmentsTable)
        .where(eq(departmentsTable.slug, next))
        .limit(1);
      if (!dept) {
        res.status(400).json({ error: "Unknown department slug" });
        return;
      }
      if (allowed === undefined) allowed = await accessibleDepartmentIds(user);
      if (allowed !== null && !allowed.has(dept.id)) {
        res.status(403).json({ error: `You do not have access to that ${label}` });
        return;
      }
    }
    updates[key] = next;
  }

  if (Object.keys(updates).length === 0) {
    // Nothing to update — just echo current session.
    res.json(GetSessionResponse.parse(await buildSessionResponse(user)));
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json(GetSessionResponse.parse(await buildSessionResponse(updated)));
});

export default router;
