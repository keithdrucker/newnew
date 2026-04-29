import { Router, type IRouter } from "express";
import { and, eq, sql, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  departmentsTable,
  ticketsTable,
  boardMembersTable,
} from "@workspace/db";
import {
  ListAgentsQueryParams,
  ListAgentsResponse,
  CreateAgentBody,
  UpdateAgentParams,
  UpdateAgentBody,
  UpdateAgentResponse,
  DeleteAgentParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";

const router: IRouter = Router();

async function hydrateAgents(rows: (typeof usersTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const deptIds = Array.from(
    new Set(
      rows.map((r) => r.departmentId).filter((d): d is number => d != null),
    ),
  );
  const depts = deptIds.length
    ? await db
        .select()
        .from(departmentsTable)
        .where(inArray(departmentsTable.id, deptIds))
    : [];
  const deptMap = new Map(depts.map((d) => [d.id, d]));

  const counts = await db
    .select({
      assigneeId: ticketsTable.assigneeId,
      count: sql<number>`count(*)::int`,
    })
    .from(ticketsTable)
    .where(sql`${ticketsTable.assigneeId} IS NOT NULL AND ${ticketsTable.status} IN ('open','pending')`)
    .groupBy(ticketsTable.assigneeId);
  const countMap = new Map(
    counts.map((c) => [c.assigneeId as number, c.count]),
  );

  // Resolve which boards each agent can actually work on so the UI
  // can hide assignees that lack access to a given ticket's board.
  // Sources of access (mirrors `getBoardRole` / `visibleDepartmentIds`):
  //   1. Admins: every department.
  //   2. Agents: their `users.departmentId` (legacy implicit "modify")
  //      plus any explicit `board_members` rows.
  const userIds = rows.map((r) => r.id);
  const memberRows = userIds.length
    ? await db
        .select({
          userId: boardMembersTable.userId,
          departmentId: boardMembersTable.departmentId,
        })
        .from(boardMembersTable)
        .where(inArray(boardMembersTable.userId, userIds))
    : [];
  const membershipMap = new Map<number, Set<number>>();
  for (const m of memberRows) {
    if (!membershipMap.has(m.userId)) membershipMap.set(m.userId, new Set());
    membershipMap.get(m.userId)!.add(m.departmentId);
  }

  // Admins get the full department list so the client can treat the
  // membership check uniformly. We only run this query when at least
  // one row in the result set is an admin to avoid the extra round-trip
  // for the common agents-only listings.
  const hasAdmin = rows.some((r) => r.role === "admin");
  const allDeptIds = hasAdmin
    ? (await db.select({ id: departmentsTable.id }).from(departmentsTable)).map(
        (d) => d.id,
      )
    : [];

  return rows.map((r) => {
    let boardDepartmentIds: number[];
    if (r.role === "admin") {
      boardDepartmentIds = allDeptIds;
    } else {
      const set = new Set<number>(membershipMap.get(r.id) ?? []);
      if (r.departmentId != null) set.add(r.departmentId);
      boardDepartmentIds = Array.from(set);
    }
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as "admin" | "agent" | "end_user",
      title: r.title ?? null,
      departmentId: r.departmentId ?? null,
      departmentName: r.departmentId
        ? deptMap.get(r.departmentId)?.name ?? null
        : null,
      ticketsAssigned: countMap.get(r.id) ?? 0,
      boardDepartmentIds,
    };
  });
}

router.get("/agents", async (req, res): Promise<void> => {
  const params = ListAgentsQueryParams.safeParse(coerceQuery(req.query as Record<string, unknown>));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds: Array<ReturnType<typeof eq>> = [
    sql`${usersTable.role} IN ('admin','agent')` as unknown as ReturnType<
      typeof eq
    >,
  ];
  if (params.data.departmentId != null)
    conds.push(eq(usersTable.departmentId, params.data.departmentId));
  const rows = await db
    .select()
    .from(usersTable)
    .where(and(...conds))
    .orderBy(usersTable.name);
  res.json(ListAgentsResponse.parse(await hydrateAgents(rows)));
});

router.post("/agents", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const parsed = CreateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.role === "end_user") {
    res.status(400).json({ error: "Use /people for end_user role" });
    return;
  }
  const [row] = await db
    .insert(usersTable)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      title: parsed.data.title ?? null,
      departmentId: parsed.data.departmentId ?? null,
    })
    .returning();
  const [dto] = await hydrateAgents([row]);
  res.status(201).json(dto);
});

router.patch("/agents/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = UpdateAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const [dto] = await hydrateAgents([row]);
  res.json(UpdateAgentResponse.parse(dto));
});

router.delete("/agents/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = DeleteAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
