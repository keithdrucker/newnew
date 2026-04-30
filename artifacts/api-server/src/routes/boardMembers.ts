import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  boardMembersTable,
  usersTable,
  departmentsTable,
  type BoardRole,
  type BoardSectionRoles,
} from "@workspace/db";
import {
  ListBoardMembersParams,
  AddBoardMemberParams,
  AddBoardMemberBody,
  UpdateBoardMemberParams,
  UpdateBoardMemberBody,
  RemoveBoardMemberParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { visibleDepartmentIds } from "../lib/board-access";

const router: IRouter = Router();

// Normalize the parsed sectionRoles into the DB jsonb shape. The
// generated zod schema validates allowed section keys + enum values
// (incl. "none") strictly, so we only need to:
//   - distinguish "field omitted" (don't touch column on PATCH) from
//     "field set to null" (clear column) from "field set to {}"
//   - drop empty objects to NULL so the column round-trips cleanly
function normalizeSectionRolesField(
  parsed: { sectionRoles?: BoardSectionRoles | null | undefined },
): BoardSectionRoles | null | undefined {
  if (!("sectionRoles" in parsed)) return undefined;
  const v = parsed.sectionRoles;
  if (v == null) return null;
  if (Object.keys(v).length === 0) return null;
  return v;
}

async function loadMembers(departmentId: number) {
  const rows = await db
    .select({
      id: boardMembersTable.id,
      departmentId: boardMembersTable.departmentId,
      userId: boardMembersTable.userId,
      role: boardMembersTable.role,
      sectionRoles: boardMembersTable.sectionRoles,
      createdAt: boardMembersTable.createdAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userTitle: usersTable.title,
      userGlobalRole: usersTable.role,
    })
    .from(boardMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, boardMembersTable.userId))
    .where(eq(boardMembersTable.departmentId, departmentId))
    .orderBy(usersTable.name);
  return rows.map((r) => ({
    id: r.id,
    departmentId: r.departmentId,
    userId: r.userId,
    role: r.role as BoardRole,
    sectionRoles: r.sectionRoles ?? null,
    userName: r.userName,
    userEmail: r.userEmail,
    userTitle: r.userTitle,
    userGlobalRole: r.userGlobalRole as "admin" | "agent" | "end_user",
    createdAt: r.createdAt.toISOString(),
  }));
}

router.get(
  "/departments/:id/members",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    // End users never see internal team rosters; agents must have at
    // least visibility on the requested board (any non-revoked role on
    // any of the 4 sections counts, since membership is shared across
    // sections); admins see everything.
    if (user.role === "end_user") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const params = ListBoardMembersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (user.role === "agent") {
      const visible = await visibleDepartmentIds(user);
      if (visible !== null && !visible.includes(params.data.id)) {
        res.status(403).json({ error: "No access to this board" });
        return;
      }
    }
    const data = await loadMembers(params.data.id);
    res.json(data);
  },
);

router.post(
  "/departments/:id/members",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const params = AddBoardMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = AddBoardMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const sectionRolesField = normalizeSectionRolesField(parsed.data);
    // POST always sets the column; missing on POST means "no overrides" (null).
    const sectionRoles: BoardSectionRoles | null =
      sectionRolesField === undefined ? null : sectionRolesField;

    const [dept] = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.id, params.data.id));
    if (!dept) {
      res.status(404).json({ error: "Board not found" });
      return;
    }

    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.userId));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (target.role === "end_user") {
      res
        .status(400)
        .json({ error: "End users cannot be added as board members" });
      return;
    }

    const [existing] = await db
      .select()
      .from(boardMembersTable)
      .where(
        and(
          eq(boardMembersTable.departmentId, params.data.id),
          eq(boardMembersTable.userId, parsed.data.userId),
        ),
      );
    if (existing) {
      const [updated] = await db
        .update(boardMembersTable)
        .set({ role: parsed.data.role, sectionRoles })
        .where(eq(boardMembersTable.id, existing.id))
        .returning();
      res.status(200).json({
        id: updated.id,
        departmentId: updated.departmentId,
        userId: updated.userId,
        role: updated.role as BoardRole,
        sectionRoles: updated.sectionRoles ?? null,
        userName: target.name,
        userEmail: target.email,
        userTitle: target.title,
        userGlobalRole: target.role as "admin" | "agent" | "end_user",
        createdAt: updated.createdAt.toISOString(),
      });
      return;
    }

    const [row] = await db
      .insert(boardMembersTable)
      .values({
        departmentId: params.data.id,
        userId: parsed.data.userId,
        role: parsed.data.role,
        sectionRoles,
      })
      .returning();
    res.status(201).json({
      id: row.id,
      departmentId: row.departmentId,
      userId: row.userId,
      role: row.role as BoardRole,
      sectionRoles: row.sectionRoles ?? null,
      userName: target.name,
      userEmail: target.email,
      userTitle: target.title,
      userGlobalRole: target.role as "admin" | "agent" | "end_user",
      createdAt: row.createdAt.toISOString(),
    });
  },
);

router.patch(
  "/departments/:id/members/:userId",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const params = UpdateBoardMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateBoardMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const sectionRolesField = normalizeSectionRolesField(parsed.data);

    const updates: { role?: BoardRole; sectionRoles?: BoardSectionRoles | null } =
      {};
    if (parsed.data.role) updates.role = parsed.data.role;
    if (sectionRolesField !== undefined) {
      updates.sectionRoles = sectionRolesField;
    }

    if (!updates.role && !("sectionRoles" in updates)) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const [row] = await db
      .update(boardMembersTable)
      .set(updates)
      .where(
        and(
          eq(boardMembersTable.departmentId, params.data.id),
          eq(boardMembersTable.userId, params.data.userId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }
    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, row.userId));
    res.json({
      id: row.id,
      departmentId: row.departmentId,
      userId: row.userId,
      role: row.role as BoardRole,
      sectionRoles: row.sectionRoles ?? null,
      userName: target?.name ?? "Unknown",
      userEmail: target?.email ?? "",
      userTitle: target?.title ?? null,
      userGlobalRole: (target?.role ?? "agent") as
        | "admin"
        | "agent"
        | "end_user",
      createdAt: row.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/departments/:id/members/:userId",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const params = RemoveBoardMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await db
      .delete(boardMembersTable)
      .where(
        and(
          eq(boardMembersTable.departmentId, params.data.id),
          eq(boardMembersTable.userId, params.data.userId),
        ),
      );
    res.sendStatus(204);
  },
);

export default router;
