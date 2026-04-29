import { Router, type IRouter } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  ticketsTable,
  ticketCommentsTable,
  departmentsTable,
  usersTable,
  departmentSettingsTable,
  riskRulesTable,
  boardMembersTable,
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
// Shared SLA primitives (also used by dashboard.ts) — keeping the math in
// one place prevents drift between the list/detail rendering and the
// dashboard counts.
import {
  PAUSED_STATUSES,
  HOUR_MS,
  DAY_MS,
  slaState,
  deriveSlaStatus,
} from "../lib/sla";

const router: IRouter = Router();

type TicketRow = typeof ticketsTable.$inferSelect;

/** Find a user we can use as the author of a system-generated comment.
 *  Prefers the ticket's assignee; falls back to any admin so reminder
 *  comments still get attributed to a real account. Returns null if
 *  neither exists (in which case we'll skip writing the comment). */
async function pickSystemAuthorId(ticket: TicketRow): Promise<number | null> {
  if (ticket.assigneeId != null) return ticket.assigneeId;
  const [admin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);
  return admin?.id ?? null;
}

/** Lazy SLA + lifecycle automations that run before every list/single
 *  read. Keeps the system cron-free: any time someone looks at a ticket
 *  we push it through the necessary state changes. Returns the rows in
 *  their post-automation form (re-reads from DB if anything changed). */
async function applyAutomations(rows: TicketRow[]): Promise<TicketRow[]> {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const changedIds: number[] = [];

  for (const r of rows) {
    // Resolved → Close after 24h grace period.
    if (
      r.status === "resolved" &&
      r.resolvedAt &&
      nowMs - r.resolvedAt.getTime() >= 24 * HOUR_MS
    ) {
      await db
        .update(ticketsTable)
        .set({ status: "closed", closureReason: "auto_resolved_timeout" })
        .where(eq(ticketsTable.id, r.id));
      changedIds.push(r.id);
      continue;
    }

    // With User → 4-day auto-close (no_user_response).
    if (
      r.status === "with_user" &&
      r.withUserSince &&
      nowMs - r.withUserSince.getTime() >= 4 * DAY_MS
    ) {
      // Accumulate the pause time spent in with_user, then close.
      const running = r.slaPausedAt ? nowMs - r.slaPausedAt.getTime() : 0;
      await db
        .update(ticketsTable)
        .set({
          status: "closed",
          closureReason: "no_user_response",
          resolvedAt: r.resolvedAt ?? now,
          withUserSince: null,
          slaPausedAt: null,
          slaAccumulatedPauseMs:
            (r.slaAccumulatedPauseMs ?? 0) + (running > 0 ? running : 0),
        })
        .where(eq(ticketsTable.id, r.id));
      changedIds.push(r.id);
      continue;
    }

    // With User → 3-day reminder (only once per with_user spell).
    // Atomicity: do a conditional UPDATE that only writes when no
    // reminder has been sent yet, then check the returning rows. Only
    // the writer that won the race inserts the comment, so concurrent
    // readers can't emit duplicate reminders.
    if (
      r.status === "with_user" &&
      r.withUserSince &&
      nowMs - r.withUserSince.getTime() >= 3 * DAY_MS &&
      !r.withUserReminderSentAt
    ) {
      const claimed = await db
        .update(ticketsTable)
        .set({ withUserReminderSentAt: now })
        .where(
          and(
            eq(ticketsTable.id, r.id),
            isNull(ticketsTable.withUserReminderSentAt),
            eq(ticketsTable.status, "with_user"),
          ),
        )
        .returning({ id: ticketsTable.id });
      if (claimed.length > 0) {
        const authorId = await pickSystemAuthorId(r);
        if (authorId != null) {
          await db.insert(ticketCommentsTable).values({
            ticketId: r.id,
            authorId,
            body: "[Automated reminder] This ticket has been waiting on your reply for 3 days. It will close automatically in 24 hours if we don't hear back.",
          });
        }
        changedIds.push(r.id);
      }
    }
  }

  if (changedIds.length === 0) return rows;
  // Re-read just the rows we touched and merge them back into the
  // original order so callers don't see stale data.
  const refreshed = await db
    .select()
    .from(ticketsTable)
    .where(inArray(ticketsTable.id, changedIds));
  const refreshedMap = new Map(refreshed.map((r) => [r.id, r]));
  return rows.map((r) => refreshedMap.get(r.id) ?? r);
}

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

  return rows.map((r) => {
    const state = slaState(r);
    return {
      id: r.id,
      ticketKey: r.ticketKey,
      title: r.title,
      description: r.description,
      type: r.type as "incident" | "request",
      priority: r.priority as "low" | "medium" | "high" | "urgent",
      status: r.status as
        | "new"
        | "in_progress"
        | "with_user"
        | "with_vendor"
        | "on_hold"
        | "scheduled"
        | "resolved"
        | "closed",
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
      riskLevel: (r.riskLevel ?? "low") as
        | "low"
        | "medium"
        | "high"
        | "critical",
      rootCause: r.rootCause ?? null,
      resolution: r.resolution ?? null,
      slaBreached: r.slaBreached,
      responseSlaBreached: r.responseSlaBreached,
      // Derived: paused | breached | on_track. Paused wins over on_track
      // so the UI can render the pause badge.
      slaStatus: deriveSlaStatus(r, state),
      slaPhase: state.phase,
      slaPaused: state.paused,
      slaActiveDueAt: state.dueAt ? state.dueAt.toISOString() : null,
      responseDueAt: r.responseDueAt ? r.responseDueAt.toISOString() : null,
      resolutionDueAt: r.resolutionDueAt ? r.resolutionDueAt.toISOString() : null,
      firstResponseAt: r.firstResponseAt ? r.firstResponseAt.toISOString() : null,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      withUserSince: r.withUserSince ? r.withUserSince.toISOString() : null,
      lastUserReplyAt: r.lastUserReplyAt
        ? r.lastUserReplyAt.toISOString()
        : null,
      closureReason: r.closureReason ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
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
  if (params.data.status && params.data.status.length > 0)
    conds.push(inArray(ticketsTable.status, params.data.status));
  if (params.data.priority)
    conds.push(eq(ticketsTable.priority, params.data.priority));
  if (params.data.supportLevel != null)
    conds.push(eq(ticketsTable.supportLevel, params.data.supportLevel));
  if (params.data.unassigned) {
    conds.push(isNull(ticketsTable.assigneeId));
  } else if (params.data.assigneeId != null) {
    conds.push(eq(ticketsTable.assigneeId, params.data.assigneeId));
  }
  if (params.data.riskLevel)
    conds.push(eq(ticketsTable.riskLevel, params.data.riskLevel));
  if (params.data.category)
    conds.push(eq(ticketsTable.category, params.data.category));
  if (params.data.hasRootCause === true)
    conds.push(isNotNull(ticketsTable.rootCause));
  if (params.data.hasRootCause === false)
    conds.push(isNull(ticketsTable.rootCause));
  if (params.data.hasResolution === true)
    conds.push(isNotNull(ticketsTable.resolution));
  if (params.data.hasResolution === false)
    conds.push(isNull(ticketsTable.resolution));
  if (params.data.createdAfter)
    conds.push(gte(ticketsTable.createdAt, new Date(params.data.createdAfter)));
  if (params.data.createdBefore)
    conds.push(lte(ticketsTable.createdAt, new Date(params.data.createdBefore)));
  if (params.data.updatedAfter)
    conds.push(gte(ticketsTable.updatedAt, new Date(params.data.updatedAfter)));
  if (params.data.updatedBefore)
    conds.push(lte(ticketsTable.updatedAt, new Date(params.data.updatedBefore)));

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

  // Run lazy automations *before* hydration / SLA derivation so the
  // results are already up-to-date.
  const automated = await applyAutomations(rows);

  let filtered = automated;
  if (params.data.q) {
    const needle = params.data.q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        r.ticketKey.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle),
    );
  }
  // SLA filter is applied post-hydrate because slaStatus is a derived field
  // (combines sla_breached flag + due-date math).
  if (params.data.slaStatus) {
    filtered = filtered.filter(
      (r) => deriveSlaStatus(r) === params.data.slaStatus,
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

// Validates that an assignee actually has access to the given board.
// Admins are accepted everywhere; agents must either be the board's
// home-department member or have a board_members row for it. Returns
// `null` if the assignee is allowed (or no assignee was provided);
// otherwise returns an HTTP-400-shaped error message that the caller
// should surface verbatim. Mirrors the access logic in
// `lib/board-access.ts` and `hydrateAgents` so the assignee dropdown
// the client renders and the rule the server enforces stay in sync.
async function validateAssigneeBoardAccess(
  assigneeId: number | null | undefined,
  departmentId: number,
): Promise<string | null> {
  if (assigneeId == null) return null;
  const [assignee] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, assigneeId));
  if (!assignee) return "Assignee not found";
  if (assignee.role === "end_user") {
    return "Assignee must be an agent or admin";
  }
  if (assignee.role === "admin") return null;
  if (assignee.departmentId === departmentId) return null;
  const [member] = await db
    .select({ role: boardMembersTable.role })
    .from(boardMembersTable)
    .where(
      and(
        eq(boardMembersTable.userId, assigneeId),
        eq(boardMembersTable.departmentId, departmentId),
      ),
    )
    .limit(1);
  if (member) return null;
  return "Assignee does not have access to this board";
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
  const assigneeError = await validateAssigneeBoardAccess(
    parsed.data.assigneeId ?? null,
    parsed.data.departmentId,
  );
  if (assigneeError) {
    res.status(400).json({ error: assigneeError });
    return;
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

  // If the caller didn't pick a risk level explicitly, fall back to the
  // category's default rule (e.g. "Security Incident" → high). Falls through
  // to "low" when there's no rule.
  let riskLevel: "low" | "medium" | "high" | "critical" | null =
    (parsed.data.riskLevel as
      | "low"
      | "medium"
      | "high"
      | "critical"
      | undefined) ?? null;
  if (!riskLevel && parsed.data.category) {
    const [rule] = await db
      .select()
      .from(riskRulesTable)
      .where(eq(riskRulesTable.category, parsed.data.category))
      .limit(1);
    if (rule) {
      riskLevel = rule.riskLevel as
        | "low"
        | "medium"
        | "high"
        | "critical";
    }
  }

  const [row] = await db
    .insert(ticketsTable)
    .values({
      ticketKey,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      priority: parsed.data.priority,
      // 8-state workflow starts at "new"; agents move it forward.
      status: "new",
      source: parsed.data.source,
      departmentId: parsed.data.departmentId,
      reporterId,
      assigneeId: parsed.data.assigneeId ?? null,
      supportLevel: parsed.data.supportLevel ?? 1,
      location: parsed.data.location ?? null,
      team: parsed.data.team ?? null,
      category: parsed.data.category ?? null,
      riskLevel: riskLevel ?? "low",
      rootCause: parsed.data.rootCause ?? null,
      resolution: parsed.data.resolution ?? null,
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

  // Run lazy automations on the single row before hydration.
  const [automated] = await applyAutomations([row]);
  const [hydrated] = await hydrate([automated]);

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

  // If the caller is changing the assignee, make sure the target user
  // can actually work this board. We use `"assigneeId" in parsed.data`
  // (rather than a truthy check) so an explicit `null` clears the
  // assignment without tripping the validator.
  if ("assigneeId" in parsed.data) {
    const assigneeError = await validateAssigneeBoardAccess(
      parsed.data.assigneeId ?? null,
      existing.departmentId,
    );
    if (assigneeError) {
      res.status(400).json({ error: assigneeError });
      return;
    }
  }

  // parsed.data already includes riskLevel/rootCause/resolution from the
  // generated zod schema, so spreading is safe.
  const updates: Partial<typeof ticketsTable.$inferInsert> = { ...parsed.data };

  // ---- Status transition side effects --------------------------------
  if (parsed.data.status && parsed.data.status !== existing.status) {
    const now = new Date();
    const wasPaused = PAUSED_STATUSES.has(existing.status);
    const willBePaused = PAUSED_STATUSES.has(parsed.data.status);

    // Pause bookkeeping only applies during the resolution phase. While
    // we're still pre-firstResponseAt, the response clock is what's
    // active and it doesn't pause for waiting-on-user/vendor states.
    // Tracking pause time here would inflate slaAccumulatedPauseMs and
    // later push the resolution due date forward incorrectly.
    const inResolutionPhase = !!existing.firstResponseAt;

    if (inResolutionPhase) {
      // Entering a paused state — stamp the pause start. (Skip if
      // somehow already stamped, e.g. a manual override.)
      if (!wasPaused && willBePaused) {
        updates.slaPausedAt = now;
      }
      // Leaving a paused state — fold the elapsed pause into the
      // accumulator and clear the start stamp.
      if (wasPaused && !willBePaused) {
        const running = existing.slaPausedAt
          ? now.getTime() - existing.slaPausedAt.getTime()
          : 0;
        updates.slaAccumulatedPauseMs =
          (existing.slaAccumulatedPauseMs ?? 0) + (running > 0 ? running : 0);
        updates.slaPausedAt = null;
      }
    }

    // With User bookkeeping (separate from generic pause to drive the
    // 3d/4d automations).
    if (existing.status !== "with_user" && parsed.data.status === "with_user") {
      updates.withUserSince = now;
      updates.withUserReminderSentAt = null;
    }
    if (existing.status === "with_user" && parsed.data.status !== "with_user") {
      updates.withUserSince = null;
    }

    // Resolved bookkeeping — set resolvedAt on entry, clear on exit so a
    // re-resolve restarts the 24h auto-close grace period.
    if (
      (parsed.data.status === "resolved" || parsed.data.status === "closed") &&
      !existing.resolvedAt
    ) {
      updates.resolvedAt = now;
    }
    if (existing.status === "resolved" && parsed.data.status !== "resolved" &&
        parsed.data.status !== "closed") {
      updates.resolvedAt = null;
    }

    // Manual closure clears any prior automated closure-reason unless the
    // caller explicitly set one.
    if (parsed.data.status !== "closed" && existing.closureReason) {
      updates.closureReason = null;
    }
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

  // ---- Side effects driven by who replied ----------------------------
  const now = new Date();
  const ticketUpdates: Partial<typeof ticketsTable.$inferInsert> = {};

  // First agent response stamps firstResponseAt (kicks the resolution
  // clock off).
  if (
    !ticket.firstResponseAt &&
    (user.role === "admin" || user.role === "agent")
  ) {
    ticketUpdates.firstResponseAt = now;
  }

  // End-user reply on a resolved ticket → reopen to in_progress.
  // End-user reply while waiting on the user → resume to in_progress.
  // Closed is terminal — end-user comments do not reopen closed tickets.
  if (user.role === "end_user") {
    ticketUpdates.lastUserReplyAt = now;

    const reopens = ticket.status === "resolved";
    const resumes = ticket.status === "with_user";

    if (reopens || resumes) {
      ticketUpdates.status = "in_progress";

      if (reopens) {
        ticketUpdates.resolvedAt = null;
        ticketUpdates.closureReason = null;
      }

      // Accumulate any in-flight pause (with_user case) and clear the
      // pause stamp so the resolution clock resumes immediately. Only
      // applies post-firstResponseAt; pre-response there's no pause to
      // accumulate.
      if (ticket.firstResponseAt && PAUSED_STATUSES.has(ticket.status)) {
        const running = ticket.slaPausedAt
          ? now.getTime() - ticket.slaPausedAt.getTime()
          : 0;
        ticketUpdates.slaAccumulatedPauseMs =
          (ticket.slaAccumulatedPauseMs ?? 0) + (running > 0 ? running : 0);
        ticketUpdates.slaPausedAt = null;
      }

      if (ticket.status === "with_user") {
        ticketUpdates.withUserSince = null;
      }
    }
  }

  if (Object.keys(ticketUpdates).length > 0) {
    await db
      .update(ticketsTable)
      .set(ticketUpdates)
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
