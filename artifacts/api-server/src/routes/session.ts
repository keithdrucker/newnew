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

// Resolves the user's persisted defaultTicketBoard against current
// access. If the stored slug is no longer accessible (or no longer
// exists), returns null so the UI doesn't redirect to a board the
// user can't view.
async function resolveDefaultTicketBoard(
  user: SessionUser,
): Promise<string | null> {
  const slug = user.defaultTicketBoard ?? null;
  if (!slug) return null;
  const [dept] = await db
    .select()
    .from(departmentsTable)
    .where(eq(departmentsTable.slug, slug))
    .limit(1);
  if (!dept) return null;
  const allowed = await accessibleDepartmentIds(user);
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
  const defaultTicketBoard = await resolveDefaultTicketBoard(user);
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role as "admin" | "agent" | "end_user",
    departmentId: user.departmentId ?? null,
    departmentName,
    defaultTicketBoard,
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
  const nextBoard: string | null = parsed.data.defaultTicketBoard ?? null;

  if (nextBoard) {
    const [dept] = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.slug, nextBoard))
      .limit(1);
    if (!dept) {
      res.status(400).json({ error: "Unknown department slug" });
      return;
    }
    const allowed = await accessibleDepartmentIds(user);
    if (allowed !== null && !allowed.has(dept.id)) {
      res
        .status(403)
        .json({ error: "You do not have access to that ticket board" });
      return;
    }
  }

  const [updated] = await db
    .update(usersTable)
    .set({ defaultTicketBoard: nextBoard })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json(GetSessionResponse.parse(await buildSessionResponse(updated)));
});

export default router;
