import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  ticketsTable,
  ticketCommentsTable,
  departmentsTable,
  usersTable,
  departmentSettingsTable,
} from "@workspace/db";
import {
  ListTicketsQueryParams,
  ListTicketsResponse,
  CreateTicketBody,
  GetTicketParams,
  GetTicketResponse,
  UpdateTicketParams,
  UpdateTicketBody,
  UpdateTicketResponse,
  DeleteTicketParams,
  AddTicketCommentParams,
  AddTicketCommentBody,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";
import {
  getBoardRole,
  modifiableDepartmentIds,
  roleAtLeast,
  visibleDepartmentIds,
} from "../lib/board-access";

const router: IRouter = Router();

type TicketRow = typeof ticketsTable.$inferSelect;

async function hydrate(rows: TicketRow[]) {
  if (rows.length === 0) return [];
  const deptIds = Array.from(new Set(rows.map((r) => r.departmentId)));
  const userIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        r.assigneeId != null ? [r.reporterId, r.assigneeId] : [r.reporterId],
      ),
    ),
  );
  const depts = deptIds.length
    ? await db
        .select()
        .from(departmentsTable)
        .where(inArray(departmentsTable.id, deptIds))
    : [];
  const users = userIds.length
    ? await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const deptMap = new Map(depts.map((d) => [d.id, d]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows.map((r) => ({
    id: r.id,
    ticketKey: r.ticketKey,
    title: r.title,
    description: r.description,
    type: r.type as "incident" | "request",
    priority: r.priority as "low" | "medium" | "high" | "urgent",
    status: r.status as "open" | "pending" | "resolved" | "closed",
    source: r.source as "portal" | "email" | "phone" | "chat" | "walk_in",
    supportLevel: (r.supportLevel ?? 1) as 1 | 2 | 3,
    departmentId: r.departmentId,
    departmentName: deptMap.get(r.departmentId)?.name ?? "—",
    reporterId: r.reporterId,
    reporterName: userMap.get(r.reporterId)?.name ?? "—",
    assigneeId: r.assigneeId ?? null,
    assigneeName:
      r.assigneeId != null ? userMap.get(r.assigneeId)?.name ?? null : null,
    location: r.location ?? null,
    team: r.team ?? null,
    category: r.category ?? null,
    slaBreached: r.slaBreached,
    responseDueAt: r.responseDueAt ? r.responseDueAt.toISOString() : null,
    resolutionDueAt: r.resolutionDueAt ? r.resolutionDueAt.toISOString() : null,
    firstResponseAt: r.firstResponseAt ? r.firstResponseAt.toISOString() : null,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

router.get("/tickets", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = ListTicketsQueryParams.safeParse(coerceQuery(req.query as Record<string, unknown>));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds: Array<any> = [];
  if (params.data.departmentId != null)
    conds.push(eq(ticketsTable.departmentId, params.data.departmentId));
  if (params.data.status)
    conds.push(eq(ticketsTable.status, params.data.status));
  if (params.data.priority)
    conds.push(eq(ticketsTable.priority, params.data.priority));
  if (params.data.supportLevel != null)
    conds.push(eq(ticketsTable.supportLevel, params.data.supportLevel));
  if (params.data.unassigned) {
    conds.push(isNull(ticketsTable.assigneeId));
  } else if (params.data.assigneeId != null) {
    conds.push(eq(ticketsTable.assigneeId, params.data.assigneeId));
  }

  // Per-board access filter (admin sees all; agent sees boards they're members of;
  // end_user only their own reported tickets).
  if (user.role === "end_user") {
    conds.push(eq(ticketsTable.reporterId, user.id));
  } else if (user.role === "agent") {
    const visible = await visibleDepartmentIds(user);
    if (!visible || visible.length === 0) {
      res.json([]);
      return;
    }
    conds.push(inArray(ticketsTable.departmentId, visible));
  }

  const where = conds.length ? and(...conds) : undefined;
  let query = db.select().from(ticketsTable);
  const rows = await (where ? query.where(where) : query)
    .orderBy(desc(ticketsTable.createdAt));

  let filtered = rows;
  if (params.data.q) {
    const needle = params.data.q.toLowerCase();
    filtered = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        r.ticketKey.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle),
    );
  }

  const data = await hydrate(filtered);
  res.json(ListTicketsResponse.parse(data));
});

async function nextTicketKey(type: "incident" | "request"): Promise<string> {
  const prefix = type === "incident" ? "INC" : "REQ";
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable)
    .where(eq(ticketsTable.type, type));
  const next = (count ?? 0) + 24; // start above seed range so demo-created keys don't clash visually
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

router.post("/tickets", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (user.role === "agent") {
    const role = await getBoardRole(user, parsed.data.departmentId);
    if (!roleAtLeast(role, "modify")) {
      res.status(403).json({ error: "Read-only on this board" });
      return;
    }
  }
  // Always bind reporter to the authenticated user. The schema accepts a
  // `reporterId` field for spec compatibility, but we never trust the client
  // value here — that would allow creating tickets on behalf of other users.
  const reporterId = user.id;
  const settings = await db
    .select()
    .from(departmentSettingsTable)
    .where(eq(departmentSettingsTable.departmentId, parsed.data.departmentId))
    .limit(1);
  const slaRespMin = settings[0]?.slaResponseMinutes ?? 60;
  const slaResMin = settings[0]?.slaResolutionMinutes ?? 24 * 60;
  const now = new Date();
  const responseDueAt = new Date(now.getTime() + slaRespMin * 60 * 1000);
  const resolutionDueAt = new Date(now.getTime() + slaResMin * 60 * 1000);
  const ticketKey = await nextTicketKey(parsed.data.type);

  const [row] = await db
    .insert(ticketsTable)
    .values({
      ticketKey,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      priority: parsed.data.priority,
      status: "open",
      source: parsed.data.source,
      departmentId: parsed.data.departmentId,
      reporterId,
      assigneeId: parsed.data.assigneeId ?? null,
      supportLevel: parsed.data.supportLevel ?? 1,
      location: parsed.data.location ?? null,
      team: parsed.data.team ?? null,
      category: parsed.data.category ?? null,
      responseDueAt,
      resolutionDueAt,
    })
    .returning();
  const [hydrated] = await hydrate([row]);
  res.status(201).json(GetTicketResponse.parse({ ...hydrated, comments: [] }));
});

router.get("/tickets/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = GetTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  if (user.role === "agent") {
    const role = await getBoardRole(user, row.departmentId);
    if (!role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  if (user.role === "end_user" && row.reporterId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [hydrated] = await hydrate([row]);

  const commentRows = await db
    .select()
    .from(ticketCommentsTable)
    .where(eq(ticketCommentsTable.ticketId, row.id))
    .orderBy(asc(ticketCommentsTable.createdAt));
  const authorIds = Array.from(new Set(commentRows.map((c) => c.authorId)));
  const authors = authorIds.length
    ? await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, authorIds))
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a]));
  const comments = commentRows.map((c) => ({
    id: c.id,
    ticketId: c.ticketId,
    authorName: authorMap.get(c.authorId)?.name ?? "Unknown",
    authorRole: (authorMap.get(c.authorId)?.role ?? "agent") as
      | "admin"
      | "agent"
      | "end_user",
    body: c.body,
    createdAt: c.createdAt.toISOString(),
  }));
  res.json(GetTicketResponse.parse({ ...hydrated, comments }));
});

router.patch("/tickets/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = UpdateTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (user.role === "agent") {
    const role = await getBoardRole(user, existing.departmentId);
    if (!roleAtLeast(role, "modify")) {
      res.status(403).json({ error: "Read-only on this board" });
      return;
    }
  }

  const updates: Partial<typeof ticketsTable.$inferInsert> = { ...parsed.data };
  if (parsed.data.status === "resolved" || parsed.data.status === "closed") {
    if (!existing.resolvedAt) updates.resolvedAt = new Date();
  }

  const [row] = await db
    .update(ticketsTable)
    .set(updates)
    .where(eq(ticketsTable.id, params.data.id))
    .returning();
  const [hydrated] = await hydrate([row]);
  res.json(UpdateTicketResponse.parse(hydrated));
});

router.delete("/tickets/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = DeleteTicketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ id: ticketsTable.id, departmentId: ticketsTable.departmentId })
    .from(ticketsTable)
    .where(eq(ticketsTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  const role = await getBoardRole(user, existing.departmentId);
  if (role !== "owner") {
    res.status(403).json({ error: "Full Control required" });
    return;
  }
  await db
    .delete(ticketCommentsTable)
    .where(eq(ticketCommentsTable.ticketId, params.data.id));
  await db.delete(ticketsTable).where(eq(ticketsTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/tickets/:id/comments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = AddTicketCommentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddTicketCommentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, params.data.id));
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  if (user.role === "agent") {
    const role = await getBoardRole(user, ticket.departmentId);
    if (!roleAtLeast(role, "modify")) {
      res.status(403).json({ error: "Read-only on this board" });
      return;
    }
  }
  if (user.role === "end_user" && ticket.reporterId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [row] = await db
    .insert(ticketCommentsTable)
    .values({
      ticketId: ticket.id,
      authorId: user.id,
      body: parsed.data.body,
    })
    .returning();

  if (!ticket.firstResponseAt && (user.role === "admin" || user.role === "agent")) {
    await db
      .update(ticketsTable)
      .set({ firstResponseAt: new Date() })
      .where(eq(ticketsTable.id, ticket.id));
  }

  res.status(201).json({
    id: row.id,
    ticketId: row.ticketId,
    authorName: user.name,
    authorRole: user.role as "admin" | "agent" | "end_user",
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  });
});

// silence unused-import warnings used elsewhere
void ilike;
void or;
void modifiableDepartmentIds;

export default router;
