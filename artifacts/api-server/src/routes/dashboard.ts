import { Router, type IRouter } from "express";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  ticketsTable,
  usersTable,
  departmentsTable,
} from "@workspace/db";
import {
  GetDashboardOverviewQueryParams,
  GetDashboardOverviewResponse,
  GetDashboardTimeseriesQueryParams,
  GetDashboardTimeseriesResponse,
  GetBreachedTicketsQueryParams,
  GetBreachedTicketsResponse,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";
import { visibleDepartmentIds } from "../lib/board-access";
import { slaState, deriveSlaStatus, TERMINAL_STATUSES } from "../lib/sla";

const router: IRouter = Router();

function rangeStart(rangeDays: number): Date {
  return new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
}

/**
 * Resolve the department filter for the dashboard endpoints.
 * - admin: honors paramDeptId; null means all departments
 * - agent: scoped to visibleDepartmentIds (board memberships + primary dept).
 *   If paramDeptId is supplied, it must be inside the agent's allowed set,
 *   otherwise it is dropped and the full allowed set is used.
 * - end_user: dashboards are scoped via reporterId at the call site, so
 *   department filtering here just honors paramDeptId if present.
 */
async function applyAccess(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  paramDeptId: number | undefined,
): Promise<{ deptIds: number[] | null }> {
  if (user.role === "agent") {
    const allowed = (await visibleDepartmentIds(user)) ?? [];
    if (paramDeptId != null && allowed.includes(paramDeptId)) {
      return { deptIds: [paramDeptId] };
    }
    return { deptIds: allowed };
  }
  if (user.role === "end_user") {
    return { deptIds: paramDeptId != null ? [paramDeptId] : null };
  }
  return { deptIds: paramDeptId != null ? [paramDeptId] : null };
}

router.get("/dashboard/overview", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = GetDashboardOverviewQueryParams.safeParse(coerceQuery(req.query as Record<string, unknown>));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rangeDays = params.data.rangeDays ?? 30;
  const since = rangeStart(rangeDays);
  const { deptIds } = await applyAccess(user, params.data.departmentId);

  const conds: Array<ReturnType<typeof eq>> = [
    gte(ticketsTable.createdAt, since),
  ];
  if (deptIds != null) {
    if (deptIds.length === 0) {
      conds.push(sql`false` as unknown as ReturnType<typeof eq>);
    } else {
      conds.push(inArray(ticketsTable.departmentId, deptIds));
    }
  }
  if (params.data.assigneeId != null)
    conds.push(eq(ticketsTable.assigneeId, params.data.assigneeId));
  if (user.role === "end_user") conds.push(eq(ticketsTable.reporterId, user.id));

  const where = and(...conds);
  const tickets = await db.select().from(ticketsTable).where(where);

  const totalTickets = tickets.length;
  // 8-state workflow counts.
  const newTickets = tickets.filter((t) => t.status === "new").length;
  const inProgressTickets = tickets.filter(
    (t) => t.status === "in_progress",
  ).length;
  const withUserTickets = tickets.filter((t) => t.status === "with_user").length;
  const withVendorTickets = tickets.filter(
    (t) => t.status === "with_vendor",
  ).length;
  const onHoldTickets = tickets.filter((t) => t.status === "on_hold").length;
  const scheduledTickets = tickets.filter((t) => t.status === "scheduled").length;
  const resolvedTickets = tickets.filter((t) => t.status === "resolved").length;
  const closedTickets = tickets.filter((t) => t.status === "closed").length;

  // Legacy aliases — Overview tiles still use these names. We keep them
  // pointing at the closest 8-state equivalents so existing UI doesn't
  // need to change shape.
  const openTickets = newTickets;
  const pendingTickets = inProgressTickets;

  // Split breach counts so dashboards can show Response vs Resolution
  // breaches separately. We derive these on the fly via slaState() rather
  // than relying on the persisted slaBreached/responseSlaBreached flags
  // (which the route does not currently re-stamp on every state
  // transition), so the counts always reflect the live SLA position.
  const slaStates = tickets.map((t) => ({ t, s: slaState(t) }));
  const responseBreachedCount = slaStates.filter(
    ({ t, s }) =>
      (s.phase === "response" && s.breached) || t.responseSlaBreached,
  ).length;
  const resolutionBreachedCount = slaStates.filter(
    ({ t, s }) =>
      (s.phase === "resolution" && s.breached) || t.slaBreached,
  ).length;
  const ticketsBreachedSla = slaStates.filter(
    ({ t, s }) => s.breached || t.slaBreached || t.responseSlaBreached,
  ).length;

  const respondedTickets = tickets.filter((t) => t.firstResponseAt);
  const responseSecondsList = respondedTickets.map((t) =>
    Math.max(
      0,
      Math.floor(
        ((t.firstResponseAt as Date).getTime() - t.createdAt.getTime()) / 1000,
      ),
    ),
  );
  const averageResponseSeconds = responseSecondsList.length
    ? Math.round(
        responseSecondsList.reduce((a, b) => a + b, 0) /
          responseSecondsList.length,
      )
    : 0;

  const resolvedList = tickets.filter((t) => t.resolvedAt);
  const resolutionSecondsList = resolvedList.map((t) =>
    Math.max(
      0,
      Math.floor(
        ((t.resolvedAt as Date).getTime() - t.createdAt.getTime()) / 1000,
      ),
    ),
  );
  const averageResolutionSeconds = resolutionSecondsList.length
    ? Math.round(
        resolutionSecondsList.reduce((a, b) => a + b, 0) /
          resolutionSecondsList.length,
      )
    : 0;

  const respondedInTime = respondedTickets.filter(
    (t) =>
      t.responseDueAt &&
      (t.firstResponseAt as Date) <= (t.responseDueAt as Date),
  ).length;
  const slaResponseCompliance = respondedTickets.length
    ? respondedInTime / respondedTickets.length
    : 1;

  const resolvedInTime = resolvedList.filter(
    (t) =>
      t.resolutionDueAt &&
      (t.resolvedAt as Date) <= (t.resolutionDueAt as Date),
  ).length;
  const slaResolutionCompliance = resolvedList.length
    ? resolvedInTime / resolvedList.length
    : 1;

  const statusBreakdown = [
    { status: "new", count: newTickets },
    { status: "in_progress", count: inProgressTickets },
    { status: "with_user", count: withUserTickets },
    { status: "with_vendor", count: withVendorTickets },
    { status: "on_hold", count: onHoldTickets },
    { status: "scheduled", count: scheduledTickets },
    { status: "resolved", count: resolvedTickets },
    { status: "closed", count: closedTickets },
  ];

  // Top agents
  const agentCounts = new Map<number, number>();
  for (const t of tickets) {
    if (t.assigneeId != null) {
      agentCounts.set(t.assigneeId, (agentCounts.get(t.assigneeId) ?? 0) + 1);
    }
  }
  const agentIds = Array.from(agentCounts.keys());
  const agentRows = agentIds.length
    ? await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, agentIds))
    : [];
  const agentMap = new Map(agentRows.map((a) => [a.id, a]));
  const topAgents = Array.from(agentCounts.entries())
    .map(([agentId, count]) => ({
      agentId,
      agentName: agentMap.get(agentId)?.name ?? `Agent #${agentId}`,
      ticketCount: count,
    }))
    .sort((a, b) => b.ticketCount - a.ticketCount)
    .slice(0, 5);

  const data = {
    rangeDays,
    departmentId:
      deptIds != null && deptIds.length === 1 ? deptIds[0] : null,
    averageResponseSeconds,
    averageResolutionSeconds,
    slaResponseCompliance: Math.round(slaResponseCompliance * 1000) / 1000,
    slaResolutionCompliance: Math.round(slaResolutionCompliance * 1000) / 1000,
    ticketsBreachedSla,
    responseBreachedCount,
    resolutionBreachedCount,
    openTickets,
    closedTickets,
    pendingTickets,
    resolvedTickets,
    newTickets,
    inProgressTickets,
    withUserTickets,
    withVendorTickets,
    onHoldTickets,
    scheduledTickets,
    totalTickets,
    averageSatisfactionScore: 4.6,
    estimatedTimeSavedHours: Math.round(totalTickets * 0.42 * 10) / 10,
    estimatedCostSavedDollars: totalTickets * 26,
    statusBreakdown,
    topAgents,
  };
  res.json(GetDashboardOverviewResponse.parse(data));
});

router.get("/dashboard/timeseries", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = GetDashboardTimeseriesQueryParams.safeParse(coerceQuery(req.query as Record<string, unknown>));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rangeDays = params.data.rangeDays ?? 30;
  const since = rangeStart(rangeDays);
  const { deptIds } = await applyAccess(user, params.data.departmentId);

  const conds: Array<ReturnType<typeof eq>> = [
    gte(ticketsTable.createdAt, since),
  ];
  if (deptIds != null) {
    if (deptIds.length === 0) {
      conds.push(sql`false` as unknown as ReturnType<typeof eq>);
    } else {
      conds.push(inArray(ticketsTable.departmentId, deptIds));
    }
  }
  if (params.data.assigneeId != null)
    conds.push(eq(ticketsTable.assigneeId, params.data.assigneeId));
  if (user.role === "end_user") conds.push(eq(ticketsTable.reporterId, user.id));

  const tickets = await db.select().from(ticketsTable).where(and(...conds));

  // Decide bucket size: daily for 30, weekly for 180, monthly for 365.
  type Bucket = { date: string; opened: number; resolved: number };
  const buckets = new Map<string, Bucket>();

  function keyFor(date: Date): string {
    if (rangeDays <= 30) {
      return date.toISOString().slice(0, 10);
    }
    if (rangeDays <= 180) {
      const d = new Date(date);
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day;
      d.setUTCDate(diff);
      return d.toISOString().slice(0, 10);
    }
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      "0",
    )}`;
  }

  // Pre-fill all buckets so the chart isn't sparse.
  const now = new Date();
  if (rangeDays <= 30) {
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const k = keyFor(d);
      if (!buckets.has(k)) buckets.set(k, { date: k, opened: 0, resolved: 0 });
    }
  } else if (rangeDays <= 180) {
    for (let i = Math.ceil(rangeDays / 7) - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const k = keyFor(d);
      if (!buckets.has(k)) buckets.set(k, { date: k, opened: 0, resolved: 0 });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
      );
      const k = keyFor(d);
      if (!buckets.has(k)) buckets.set(k, { date: k, opened: 0, resolved: 0 });
    }
  }

  for (const t of tickets) {
    const k = keyFor(t.createdAt);
    const b = buckets.get(k);
    if (b) b.opened += 1;
    if (t.resolvedAt) {
      const k2 = keyFor(t.resolvedAt);
      const b2 = buckets.get(k2);
      if (b2) b2.resolved += 1;
    }
  }

  const points = Array.from(buckets.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  res.json(GetDashboardTimeseriesResponse.parse({ rangeDays, points }));
});

router.get("/dashboard/breached", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = GetBreachedTicketsQueryParams.safeParse(coerceQuery(req.query as Record<string, unknown>));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rangeDays = params.data.rangeDays ?? 30;
  const since = rangeStart(rangeDays);
  const { deptIds: allowedDeptIds } = await applyAccess(
    user,
    params.data.departmentId,
  );

  // Pull every non-terminal ticket in range; we'll filter to "currently
  // breached" via slaState() below so we catch resolution-phase breaches
  // that weren't yet stamped into slaBreached, plus response-phase
  // breaches that the persisted flag doesn't represent at all.
  const conds: Array<ReturnType<typeof eq>> = [
    gte(ticketsTable.createdAt, since),
  ];
  if (allowedDeptIds != null) {
    if (allowedDeptIds.length === 0) {
      conds.push(sql`false` as unknown as ReturnType<typeof eq>);
    } else {
      conds.push(inArray(ticketsTable.departmentId, allowedDeptIds));
    }
  }
  if (params.data.assigneeId != null)
    conds.push(eq(ticketsTable.assigneeId, params.data.assigneeId));
  if (user.role === "end_user") conds.push(eq(ticketsTable.reporterId, user.id));

  const allRows = await db.select().from(ticketsTable).where(and(...conds));
  // Drop terminal tickets first (resolved/closed are off the SLA clock,
  // even if they have a stale slaBreached=true flag from history), then
  // keep the rest whose live SLA state is breached — falling back to the
  // persisted flags for non-terminal tickets so we don't miss seeded
  // data that hasn't been re-evaluated yet.
  const rows = allRows.filter((r) => {
    if (TERMINAL_STATUSES.has(r.status)) return false;
    const s = slaState(r);
    return s.breached || r.slaBreached || r.responseSlaBreached;
  });

  // Hydrate similar to /tickets by inlining minimal logic
  const deptIds = Array.from(new Set(rows.map((r) => r.departmentId)));
  const userIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        r.assigneeId != null ? [r.reporterId, r.assigneeId] : [r.reporterId],
      ),
    ),
  );
  const deptRows = deptIds.length
    ? await db
        .select({ id: departmentsTable.id, name: departmentsTable.name })
        .from(departmentsTable)
        .where(inArray(departmentsTable.id, deptIds))
    : [];
  const userRows = userIds.length
    ? await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const deptMap = new Map(deptRows.map((d) => [d.id, d.name]));
  const userMap = new Map(userRows.map((u) => [u.id, u.name]));

  const data = rows.map((r) => {
    const s = slaState(r);
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
      departmentName: deptMap.get(r.departmentId) ?? "—",
      reporterId: r.reporterId,
      reporterName: userMap.get(r.reporterId) ?? "—",
      assigneeId: r.assigneeId ?? null,
      assigneeName:
        r.assigneeId != null ? userMap.get(r.assigneeId) ?? null : null,
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
      slaStatus: deriveSlaStatus(r, s),
      slaPhase: s.phase,
      slaPaused: s.paused,
      slaActiveDueAt: s.dueAt ? s.dueAt.toISOString() : null,
      responseDueAt: r.responseDueAt ? r.responseDueAt.toISOString() : null,
      resolutionDueAt: r.resolutionDueAt
        ? r.resolutionDueAt.toISOString()
        : null,
      firstResponseAt: r.firstResponseAt
        ? r.firstResponseAt.toISOString()
        : null,
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

  res.json(GetBreachedTicketsResponse.parse(data));
});

export default router;
