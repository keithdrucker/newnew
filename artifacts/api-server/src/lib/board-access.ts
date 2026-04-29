import { and, eq, inArray } from "drizzle-orm";
import { db, boardMembersTable, type BoardRole } from "@workspace/db";
import type { SessionUser } from "./session";

const ROLE_RANK: Record<BoardRole, number> = {
  read_only: 1,
  modify: 2,
  manager: 3,
  owner: 4,
};

// Returns the highest role the user has on a department, treating
// the legacy `users.departmentId` link as an implicit "modify"
// membership (so existing seed data keeps working). Admins are
// always treated as "owner" everywhere.
export async function getBoardRole(
  user: SessionUser,
  departmentId: number,
): Promise<BoardRole | null> {
  if (user.role === "admin") return "owner";
  if (user.role !== "agent") return null;

  const explicit = await db
    .select({ role: boardMembersTable.role })
    .from(boardMembersTable)
    .where(
      and(
        eq(boardMembersTable.userId, user.id),
        eq(boardMembersTable.departmentId, departmentId),
      ),
    )
    .limit(1);

  const rolesFound: BoardRole[] = [];
  if (explicit[0]) rolesFound.push(explicit[0].role as BoardRole);
  if (user.departmentId === departmentId) rolesFound.push("modify");
  if (rolesFound.length === 0) return null;

  return rolesFound.reduce<BoardRole>(
    (best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best),
    rolesFound[0],
  );
}

export function roleAtLeast(role: BoardRole | null, min: BoardRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

// Returns the set of department ids the agent can access (any role).
// For admin → null (caller treats null as "all"). For end_user → empty.
export async function visibleDepartmentIds(
  user: SessionUser,
): Promise<number[] | null> {
  if (user.role === "admin") return null;
  if (user.role !== "agent") return [];

  const rows = await db
    .select({ deptId: boardMembersTable.departmentId })
    .from(boardMembersTable)
    .where(eq(boardMembersTable.userId, user.id));

  const set = new Set<number>(rows.map((r) => r.deptId));
  if (user.departmentId != null) set.add(user.departmentId);
  return Array.from(set);
}

// Returns the set of department ids where the agent has at least the given role.
export async function modifiableDepartmentIds(
  user: SessionUser,
  min: BoardRole = "modify",
): Promise<number[] | null> {
  if (user.role === "admin") return null;
  if (user.role !== "agent") return [];

  const rows = await db
    .select({
      deptId: boardMembersTable.departmentId,
      role: boardMembersTable.role,
    })
    .from(boardMembersTable)
    .where(eq(boardMembersTable.userId, user.id));

  const set = new Set<number>();
  for (const r of rows) {
    if (ROLE_RANK[r.role as BoardRole] >= ROLE_RANK[min]) {
      set.add(r.deptId);
    }
  }
  // Legacy implicit modify on user's home dept
  if (
    user.departmentId != null &&
    ROLE_RANK["modify"] >= ROLE_RANK[min]
  ) {
    set.add(user.departmentId);
  }
  return Array.from(set);
}

// Returns the set of department ids where the caller is at least
// `manager` (the timesheet-visibility tier). Admins → null = "all".
// End users → empty.
export async function timesheetVisibleDepartmentIds(
  user: SessionUser,
): Promise<number[] | null> {
  return modifiableDepartmentIds(user, "manager");
}

// True when the caller may view the target user's timesheet.
// Self-view is always allowed. Admins can view everyone. Otherwise the
// caller must hold `manager+` on at least one board where the target
// user is also a member (so a manager can audit their teammates'
// time, but cannot peek into agents on unrelated boards).
export async function canViewTimesheet(
  caller: SessionUser,
  targetUserId: number,
): Promise<boolean> {
  if (caller.id === targetUserId) return true;
  if (caller.role === "admin") return true;
  if (caller.role !== "agent") return false;

  const callerBoards = await timesheetVisibleDepartmentIds(caller);
  if (callerBoards === null) return true; // shouldn't happen for agent, but safe
  if (callerBoards.length === 0) return false;

  // Find any board where both the caller (manager+) AND the target are
  // members. We treat an end_user target as "no board membership" and
  // refuse — timesheets are an internal-only concept.
  const targetMembershipRows = await db
    .select({ deptId: boardMembersTable.departmentId })
    .from(boardMembersTable)
    .where(eq(boardMembersTable.userId, targetUserId));
  const targetDepts = new Set(targetMembershipRows.map((r) => r.deptId));
  return callerBoards.some((d) => targetDepts.has(d));
}

// Returns the user ids whose timesheets the caller may view (always
// includes the caller). Used to populate the timesheet user-picker.
// Admins receive every agent + admin id (end users excluded).
export async function timesheetVisibleUserIds(
  caller: SessionUser,
  // injected to avoid a circular import on usersTable in this small
  // helper module — caller passes the agents table reference.
  agentsLister: () => Promise<{ id: number }[]>,
): Promise<number[]> {
  if (caller.role === "admin") {
    const all = await agentsLister();
    return all.map((u) => u.id);
  }
  if (caller.role !== "agent") return [caller.id];

  const visibleBoards = await timesheetVisibleDepartmentIds(caller);
  if (visibleBoards === null || visibleBoards.length === 0) {
    return [caller.id];
  }

  const rows = await db
    .select({ userId: boardMembersTable.userId })
    .from(boardMembersTable)
    .where(inArray(boardMembersTable.departmentId, visibleBoards));
  const set = new Set<number>(rows.map((r) => r.userId));
  set.add(caller.id);
  return Array.from(set);
}

export function _testInArray() {
  // re-export so tree-shake doesn't drop helpers we use across files
  return inArray;
}
