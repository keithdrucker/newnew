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

const router: IRouter = Router();

function rangeStart(rangeDays: number): Date {
  return new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
}

async function applyAccess(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  paramDeptId: number | undefined,
): Promise<{ deptFilter: number | null }> {
  if (user.role === "agent" && user.departmentId != null) {
    return { deptFilter: user.departmentId };
  }
  if (user.role === "end_user") {
    // end_user dashboards are scoped via reporter, not department.
    return { deptFilter: paramDeptId ?? null };
  }
  return { deptFilter: paramDeptId ?? null };
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
  const { deptFilter } = await applyAccess(user, params.data.departmentId);

  const conds: Array<ReturnType<typeof eq>> = [
    gte(ticketsTable.createdAt, since),
  ];
  if (deptFilter != null) conds.push(eq(ticketsTable.departmentId, deptFilter));
  if (params.data.assigneeId != null)
    conds.push(eq(ticketsTable.assigneeId, params.data.assigneeId));
  if (user.role === "end_user") conds.push(eq(ticketsTable.reporterId, user.id));

  const where = and(...conds);
  const tickets = await db.select().from(ticketsTable).where(where);

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((t) => t.status === "open").length;
  const pendingTickets = tickets.filter((t) => t.status === "pending").length;
  const resolvedTickets = tickets.filter((t) => t.status === "resolved").length;
  const closedTickets = tickets.filter((t) => t.status === "closed").length;
  const ticketsBreachedSla = tickets.filter((t) => t.slaBreached).length;

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
    { status: "open", count: openTickets },
    { status: "pending", count: pendingTickets },
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
    departmentId: deptFilter ?? null,
    averageResponseSeconds,
    averageResolutionSeconds,
    slaResponseCompliance: Math.round(slaResponseCompliance * 1000) / 1000,
    slaResolutionCompliance: Math.round(slaResolutionCompliance * 1000) / 1000,
    ticketsBreachedSla,
    openTickets,
    closedTickets,
    pendingTickets,
    resolvedTickets,
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
  const { deptFilter } = await applyAccess(user, params.data.departmentId);

  const conds: Array<ReturnType<typeof eq>> = [
    gte(ticketsTable.createdAt, since),
  ];
  if (deptFilter != null) conds.push(eq(ticketsTable.departmentId, deptFilter));
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
  const { deptFilter } = await applyAccess(user, params.data.departmentId);

  const conds: Array<ReturnType<typeof eq>> = [
    gte(ticketsTable.createdAt, since),
    eq(ticketsTable.slaBreached, true),
  ];
  if (deptFilter != null) conds.push(eq(ticketsTable.departmentId, deptFilter));
  if (params.data.assigneeId != null)
    conds.push(eq(ticketsTable.assigneeId, params.data.assigneeId));
  if (user.role === "end_user") conds.push(eq(ticketsTable.reporterId, user.id));

  const rows = await db.select().from(ticketsTable).where(and(...conds));
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

  const data = rows.map((r) => ({
    id: r.id,
    ticketKey: r.ticketKey,
    title: r.title,
    description: r.description,
    type: r.type as "incident" | "request",
    priority: r.priority as "low" | "medium" | "high" | "urgent",
    status: r.status as "open" | "pending" | "resolved" | "closed",
    source: r.source as "portal" | "email" | "phone" | "chat" | "walk_in",
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
    slaBreached: r.slaBreached,
    responseDueAt: r.responseDueAt ? r.responseDueAt.toISOString() : null,
    resolutionDueAt: r.resolutionDueAt ? r.resolutionDueAt.toISOString() : null,
    firstResponseAt: r.firstResponseAt ? r.firstResponseAt.toISOString() : null,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  res.json(GetBreachedTicketsResponse.parse(data));
});

export default router;
