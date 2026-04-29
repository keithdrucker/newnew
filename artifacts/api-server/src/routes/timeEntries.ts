import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  db,
  timeEntriesTable,
  ticketsTable,
  usersTable,
  departmentsTable,
} from "@workspace/db";
import {
  ListTicketTimeEntriesParams,
  CreateTicketTimeEntryParams,
  CreateTicketTimeEntryBody,
  ListTimeEntriesQueryParams,
  DeleteTimeEntryParams,
  UpdateTimeEntryParams,
  UpdateTimeEntryBody,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";
import {
  getBoardRole,
  roleAtLeast,
  canViewTimesheet,
  timesheetVisibleUserIds,
} from "../lib/board-access";

const router: IRouter = Router();

type TimeEntryRow = typeof timeEntriesTable.$inferSelect;

// Hydrates a row set into the API `TimeEntry` shape. We resolve ticket
// + user + department names in batch (one round-trip each) so the
// timesheet page renders with no follow-up requests.
async function hydrate(rows: TimeEntryRow[]) {
  if (rows.length === 0) return [];
  const ticketIds = [...new Set(rows.map((r) => r.ticketId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const deptIds = [...new Set(rows.map((r) => r.departmentId))];

  const [tickets, users, depts] = await Promise.all([
    db
      .select({
        id: ticketsTable.id,
        ticketKey: ticketsTable.ticketKey,
        title: ticketsTable.title,
      })
      .from(ticketsTable)
      .where(inArray(ticketsTable.id, ticketIds)),
    db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds)),
    db
      .select({ id: departmentsTable.id, name: departmentsTable.name })
      .from(departmentsTable)
      .where(inArray(departmentsTable.id, deptIds)),
  ]);
  const tMap = new Map(tickets.map((t) => [t.id, t] as const));
  const uMap = new Map(users.map((u) => [u.id, u.name] as const));
  const dMap = new Map(depts.map((d) => [d.id, d.name] as const));

  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticketId,
    ticketKey: tMap.get(r.ticketId)?.ticketKey ?? `#${r.ticketId}`,
    ticketTitle: tMap.get(r.ticketId)?.title ?? "(deleted ticket)",
    departmentId: r.departmentId,
    departmentName: dMap.get(r.departmentId) ?? "—",
    userId: r.userId,
    userName: uMap.get(r.userId) ?? "—",
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    durationMinutes: r.durationMinutes,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));
}

// Round to the nearest 15-minute boundary so reports add cleanly. The
// dialog already snaps inputs but we re-snap server-side so direct API
// callers can't slip a 7-minute entry into the books.
function round15(d: Date): Date {
  const ms = d.getTime();
  const fifteenMin = 15 * 60 * 1000;
  return new Date(Math.round(ms / fifteenMin) * fifteenMin);
}

// ────────────────────────────────────────────────────────────────────
// GET /tickets/:id/time-entries — list for a specific ticket
// ────────────────────────────────────────────────────────────────────
router.get("/tickets/:id/time-entries", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  // End users must never see internal time tracking. This is the
  // primary access boundary for this endpoint.
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = ListTicketTimeEntriesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
  // Agents must have at least read access to the ticket's board.
  if (user.role === "agent") {
    const role = await getBoardRole(user, ticket.departmentId);
    if (!roleAtLeast(role, "read_only")) {
      res.status(403).json({ error: "No access to this board" });
      return;
    }
  }
  const rows = await db
    .select()
    .from(timeEntriesTable)
    .where(eq(timeEntriesTable.ticketId, ticket.id))
    .orderBy(desc(timeEntriesTable.startAt));
  res.json(await hydrate(rows));
});

// ────────────────────────────────────────────────────────────────────
// POST /tickets/:id/time-entries — log work
// ────────────────────────────────────────────────────────────────────
router.post("/tickets/:id/time-entries", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = CreateTicketTimeEntryParams.safeParse(req.params);
  const body = CreateTicketTimeEntryBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
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
  // Logging time is a write — require modify access.
  if (user.role === "agent") {
    const role = await getBoardRole(user, ticket.departmentId);
    if (!roleAtLeast(role, "modify")) {
      res.status(403).json({ error: "Read-only on this board" });
      return;
    }
  }
  const startAt = round15(new Date(body.data.startAt));
  const endAt = round15(new Date(body.data.endAt));
  if (!(endAt.getTime() > startAt.getTime())) {
    res.status(400).json({ error: "End time must be after start time" });
    return;
  }
  const note = body.data.note.trim();
  if (!note) {
    res.status(400).json({ error: "Note is required" });
    return;
  }
  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  const [row] = await db
    .insert(timeEntriesTable)
    .values({
      ticketId: ticket.id,
      userId: user.id,
      departmentId: ticket.departmentId,
      startAt,
      endAt,
      durationMinutes,
      note,
    })
    .returning();
  const [hydrated] = await hydrate([row]);
  res.status(201).json(hydrated);
});

// ────────────────────────────────────────────────────────────────────
// GET /time-entries?from&to[&userId] — entries in a window for the
// caller, or for `userId` if the caller is a manager+ on a board the
// target shares (or admin).
// ────────────────────────────────────────────────────────────────────
router.get("/time-entries", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = ListTimeEntriesQueryParams.safeParse(coerceQuery(req.query));
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);

  // Default to self if no `userId` is provided. When provided, the
  // caller must have permission to view that user (admin, self, or
  // manager+ on a shared board).
  const targetUserId = parsed.data.userId ?? user.id;
  if (targetUserId !== user.id) {
    const allowed = await canViewTimesheet(user, targetUserId);
    if (!allowed) {
      res.status(403).json({ error: "Cannot view this user's timesheet" });
      return;
    }
  }

  const rows = await db
    .select()
    .from(timeEntriesTable)
    .where(
      and(
        eq(timeEntriesTable.userId, targetUserId),
        gte(timeEntriesTable.startAt, from),
        lt(timeEntriesTable.startAt, to),
      ),
    )
    .orderBy(desc(timeEntriesTable.startAt));
  res.json(await hydrate(rows));
});

// ────────────────────────────────────────────────────────────────────
// GET /time-entries/visible-users — users whose timesheets the
// caller can view (always includes the caller).
// ────────────────────────────────────────────────────────────────────
router.get("/time-entries/visible-users", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const ids = await timesheetVisibleUserIds(user, async () => {
    // Admin path → list every non-end_user once. End users are
    // intentionally excluded since they don't log time.
    return db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.role, ["agent", "admin"]));
  });

  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, ids));

  // Sort so the caller is always first (UI defaults to "My Timesheet"),
  // then by display name for predictable ordering in the dropdown.
  users.sort((a, b) => {
    if (a.id === user.id) return -1;
    if (b.id === user.id) return 1;
    return a.name.localeCompare(b.name);
  });

  res.json(users.map((u) => ({ ...u, isSelf: u.id === user.id })));
});

// ────────────────────────────────────────────────────────────────────
// PATCH /time-entries/:id — owner or admin can edit start/end/note
// ────────────────────────────────────────────────────────────────────
router.patch("/time-entries/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateTimeEntryParams.safeParse(req.params);
  const body = UpdateTimeEntryBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(timeEntriesTable)
    .where(eq(timeEntriesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Time entry not found" });
    return;
  }
  // Same authorization rule as DELETE: owner or admin only. Prevents
  // an agent on the same board from rewriting somebody else's history.
  if (existing.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Cannot edit another user's entry" });
    return;
  }

  const nextStart = body.data.startAt
    ? round15(new Date(body.data.startAt))
    : existing.startAt;
  const nextEnd = body.data.endAt
    ? round15(new Date(body.data.endAt))
    : existing.endAt;
  if (!(nextEnd.getTime() > nextStart.getTime())) {
    res.status(400).json({ error: "End time must be after start time" });
    return;
  }
  const nextNote =
    body.data.note !== undefined ? body.data.note.trim() : existing.note;
  if (!nextNote) {
    res.status(400).json({ error: "Note is required" });
    return;
  }
  const durationMinutes = Math.round(
    (nextEnd.getTime() - nextStart.getTime()) / 60000,
  );

  const [row] = await db
    .update(timeEntriesTable)
    .set({
      startAt: nextStart,
      endAt: nextEnd,
      note: nextNote,
      durationMinutes,
    })
    .where(eq(timeEntriesTable.id, existing.id))
    .returning();
  const [hydrated] = await hydrate([row]);
  res.json(hydrated);
});

// ────────────────────────────────────────────────────────────────────
// DELETE /time-entries/:id — owner or admin
// ────────────────────────────────────────────────────────────────────
router.delete("/time-entries/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = DeleteTimeEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(timeEntriesTable)
    .where(eq(timeEntriesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Time entry not found" });
    return;
  }
  if (row.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Cannot delete another user's entry" });
    return;
  }
  await db.delete(timeEntriesTable).where(eq(timeEntriesTable.id, row.id));
  res.status(204).end();
});

export default router;
