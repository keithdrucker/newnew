import {
  useGetDashboardOverview,
  useGetDashboardTimeseries,
  useGetBreachedTickets,
  useGetSession,
  useListAgents,
  getListAgentsQueryKey,
  getDashboardOverview,
  getDashboardTimeseries,
  getBreachedTickets,
  getGetDashboardOverviewQueryKey,
  getGetDashboardTimeseriesQueryKey,
  getGetBreachedTicketsQueryKey,
  type DashboardOverview,
  type DashboardTimeseries,
  type Ticket,
  type AgentLeaderboardItem,
} from "@workspace/api-client-react";
import { useQueries } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { format } from "date-fns";
import {
  Clock,
  Timer,
  Target,
  AlertTriangle,
  Inbox,
  CheckCircle2,
  Hourglass,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import ProjectsDashboard from "@/pages/projects-dashboard";
import InitiativesDashboard from "@/pages/initiatives-dashboard";
import OperationalTasksDashboard from "@/pages/operational-tasks-dashboard";
import { useTeamScope, filterByTeamScope } from "@/lib/team-scope";

function fmtDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.round(seconds / 3600);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

type DashboardView =
  | "tickets"
  | "projects"
  | "initiatives"
  | "operational_tasks";

const DASHBOARD_VIEW_KEY = "itsm.dashboard.view";

const DASHBOARD_VIEW_LABEL: Record<DashboardView, string> = {
  tickets: "Tickets",
  operational_tasks: "Operational Tasks",
  initiatives: "Initiatives",
  projects: "Projects",
};

function isDashboardView(v: string): v is DashboardView {
  return (
    v === "tickets" ||
    v === "projects" ||
    v === "initiatives" ||
    v === "operational_tasks"
  );
}

export default function Dashboard() {
  const { data: session } = useGetSession();
  // End-users only see Tickets — Projects, Initiatives and Operational
  // Tasks are agent/admin surfaces. Until the session resolves, treat
  // the user as restricted so we don't briefly render an agent-only
  // view (and fire its API calls) for someone who isn't entitled.
  const showAgentViews = session !== undefined && session.role !== "end_user";

  // Persist the active view across reloads so a user landing back on
  // the dashboard sees what they were last looking at.
  const [view, setView] = useState<DashboardView>(() => {
    if (typeof window === "undefined") return "tickets";
    const raw = window.localStorage.getItem(DASHBOARD_VIEW_KEY);
    return raw && isDashboardView(raw) ? raw : "tickets";
  });

  // If the role changes (e.g. switching session) and the agent-only
  // views are no longer visible, snap back to the tickets view so we
  // don't render a hidden state.
  useEffect(() => {
    if (!showAgentViews && view !== "tickets") {
      setView("tickets");
    }
  }, [showAgentViews, view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_VIEW_KEY, view);
  }, [view]);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex items-center">
        <Select
          value={view}
          onValueChange={(v) => {
            if (isDashboardView(v)) setView(v);
          }}
        >
          <SelectTrigger
            className="w-[200px]"
            data-testid="select-dashboard-view"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tickets">
              {DASHBOARD_VIEW_LABEL.tickets}
            </SelectItem>
            {showAgentViews && (
              <>
                <SelectItem value="operational_tasks">
                  {DASHBOARD_VIEW_LABEL.operational_tasks}
                </SelectItem>
                <SelectItem value="initiatives">
                  {DASHBOARD_VIEW_LABEL.initiatives}
                </SelectItem>
                <SelectItem value="projects">
                  {DASHBOARD_VIEW_LABEL.projects}
                </SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {view === "tickets" && <TicketsDashboardContent />}
      {view === "projects" && <ProjectsDashboard />}
      {view === "initiatives" && <InitiativesDashboard />}
      {view === "operational_tasks" && <OperationalTasksDashboard />}
    </div>
  );
}

// Merge dashboard overview rows for several teams into one weighted
// aggregate. Counts sum, averages weight by totalTickets, top agents
// merge by agentId. Returns null when the input is empty so consumers
// can show their own loading state.
function aggregateOverviews(
  rows: DashboardOverview[],
  rangeDays: number,
): DashboardOverview | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  const sum = (k: keyof DashboardOverview) =>
    rows.reduce((acc, r) => acc + ((r[k] as number) ?? 0), 0);

  const totalTickets = sum("totalTickets");
  const weightedAvg = (k: keyof DashboardOverview) => {
    if (totalTickets === 0) return 0;
    return (
      rows.reduce(
        (acc, r) => acc + ((r[k] as number) ?? 0) * (r.totalTickets ?? 0),
        0,
      ) / totalTickets
    );
  };

  // Merge top-agents: keyed by agentId, sum ticket counts, then sort
  // desc and keep the top 5 (matches the per-team API return size).
  const agentMap = new Map<number, AgentLeaderboardItem>();
  for (const row of rows) {
    for (const a of row.topAgents ?? []) {
      const existing = agentMap.get(a.agentId);
      if (existing) {
        existing.ticketCount += a.ticketCount;
      } else {
        agentMap.set(a.agentId, { ...a });
      }
    }
  }
  const topAgents = Array.from(agentMap.values())
    .sort((a, b) => b.ticketCount - a.ticketCount)
    .slice(0, 5);

  // statusBreakdown: merge by status string.
  const statusMap = new Map<string, number>();
  for (const row of rows) {
    for (const s of row.statusBreakdown ?? []) {
      statusMap.set(s.status, (statusMap.get(s.status) ?? 0) + s.count);
    }
  }

  return {
    rangeDays,
    departmentId: null,
    averageResponseSeconds: weightedAvg("averageResponseSeconds"),
    averageResolutionSeconds: weightedAvg("averageResolutionSeconds"),
    slaResponseCompliance: weightedAvg("slaResponseCompliance"),
    slaResolutionCompliance: weightedAvg("slaResolutionCompliance"),
    ticketsBreachedSla: sum("ticketsBreachedSla"),
    responseBreachedCount: sum("responseBreachedCount"),
    resolutionBreachedCount: sum("resolutionBreachedCount"),
    openTickets: sum("openTickets"),
    closedTickets: sum("closedTickets"),
    pendingTickets: sum("pendingTickets"),
    resolvedTickets: sum("resolvedTickets"),
    newTickets: sum("newTickets"),
    inProgressTickets: sum("inProgressTickets"),
    withUserTickets: sum("withUserTickets"),
    withVendorTickets: sum("withVendorTickets"),
    onHoldTickets: sum("onHoldTickets"),
    scheduledTickets: sum("scheduledTickets"),
    totalTickets,
    averageSatisfactionScore: weightedAvg("averageSatisfactionScore"),
    estimatedTimeSavedHours: sum("estimatedTimeSavedHours"),
    estimatedCostSavedDollars: sum("estimatedCostSavedDollars"),
    statusBreakdown: Array.from(statusMap.entries()).map(([status, count]) => ({
      status: status as DashboardOverview["statusBreakdown"][number]["status"],
      count,
    })),
    topAgents,
  };
}

// Combine multiple per-team timeseries into one. Points are keyed by
// date string so days that exist in only some teams still render.
function aggregateTimeseries(
  rows: DashboardTimeseries[],
  rangeDays: number,
): DashboardTimeseries | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  const byDate = new Map<string, { opened: number; resolved: number }>();
  for (const row of rows) {
    for (const p of row.points ?? []) {
      const key = String(p.date);
      const existing = byDate.get(key) ?? { opened: 0, resolved: 0 };
      existing.opened += p.opened;
      existing.resolved += p.resolved;
      byDate.set(key, existing);
    }
  }
  const points = Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { rangeDays, points };
}

// Run the three dashboard queries in a way that respects the active
// team scope:
//   - single team selected → one query with departmentId
//   - "All Teams"          → one query with no departmentId (server
//                            returns the user's full accessible set)
//   - explicit multi (2+   → one query per selected team in parallel,
//     but not all)           merged client-side via aggregate*()
// This keeps the dashboard honest when the user picks, say, two of
// three teams: we don't quietly include the un-selected team.
function useScopedDashboard(
  rangeDays: 30 | 180 | 365,
  assigneeId: number | undefined,
) {
  const scope = useTeamScope();
  const isMulti = !scope.isAll && !scope.single && scope.selectedIds.length > 1;
  const enableSingle = !isMulti && !scope.loading;
  const singleDeptId = scope.single ? scope.singleId ?? undefined : undefined;

  // Single / All paths use the regular hooks. We disable them when we
  // know we'll use the multi path so we don't fire duplicate requests
  // mid-scope-change.
  const singleOverviewParams = {
    departmentId: singleDeptId,
    assigneeId,
    rangeDays,
  };
  const singleTimeseriesParams = {
    departmentId: singleDeptId,
    assigneeId,
    rangeDays,
  };
  const singleBreachedParams = {
    departmentId: singleDeptId,
    assigneeId,
    rangeDays,
  };
  const singleOverview = useGetDashboardOverview(singleOverviewParams, {
    query: {
      queryKey: getGetDashboardOverviewQueryKey(singleOverviewParams),
      enabled: enableSingle,
    },
  });
  const singleTimeseries = useGetDashboardTimeseries(singleTimeseriesParams, {
    query: {
      queryKey: getGetDashboardTimeseriesQueryKey(singleTimeseriesParams),
      enabled: enableSingle,
    },
  });
  const singleBreached = useGetBreachedTickets(singleBreachedParams, {
    query: {
      queryKey: getGetBreachedTicketsQueryKey(singleBreachedParams),
      enabled: enableSingle,
    },
  });

  // Multi path: parallel per-team queries via useQueries. We always
  // declare these (even when not multi) so React's hook order stays
  // stable; they just resolve to empty arrays when disabled.
  // The assignee filter is threaded into each per-team query so the
  // aggregated totals match what the user would see if they switched
  // to a single team.
  const multiTeamIds = isMulti ? scope.selectedIds : [];
  const overviewQueries = useQueries({
    queries: multiTeamIds.map((teamId) => ({
      queryKey: getGetDashboardOverviewQueryKey({
        departmentId: teamId,
        assigneeId,
        rangeDays,
      }),
      queryFn: () =>
        getDashboardOverview({ departmentId: teamId, assigneeId, rangeDays }),
      enabled: isMulti,
    })),
  });
  const timeseriesQueries = useQueries({
    queries: multiTeamIds.map((teamId) => ({
      queryKey: getGetDashboardTimeseriesQueryKey({
        departmentId: teamId,
        assigneeId,
        rangeDays,
      }),
      queryFn: () =>
        getDashboardTimeseries({ departmentId: teamId, assigneeId, rangeDays }),
      enabled: isMulti,
    })),
  });
  const breachedQueries = useQueries({
    queries: multiTeamIds.map((teamId) => ({
      queryKey: getGetBreachedTicketsQueryKey({
        departmentId: teamId,
        assigneeId,
        rangeDays,
      }),
      queryFn: () =>
        getBreachedTickets({ departmentId: teamId, assigneeId, rangeDays }),
      enabled: isMulti,
    })),
  });

  const aggregatedOverview = useMemo<DashboardOverview | null>(() => {
    if (!isMulti) return null;
    const rows = overviewQueries
      .map((q) => q.data)
      .filter((r): r is DashboardOverview => r != null);
    return aggregateOverviews(rows, rangeDays);
  }, [isMulti, overviewQueries, rangeDays]);

  const aggregatedTimeseries = useMemo<DashboardTimeseries | null>(() => {
    if (!isMulti) return null;
    const rows = timeseriesQueries
      .map((q) => q.data)
      .filter((r): r is DashboardTimeseries => r != null);
    return aggregateTimeseries(rows, rangeDays);
  }, [isMulti, timeseriesQueries, rangeDays]);

  const aggregatedBreached = useMemo<Ticket[]>(() => {
    if (!isMulti) return [];
    return breachedQueries.flatMap((q) => q.data ?? []);
  }, [isMulti, breachedQueries]);

  if (isMulti) {
    const anyOverviewLoading = overviewQueries.some((q) => q.isLoading);
    return {
      overview: aggregatedOverview ?? undefined,
      timeseries: aggregatedTimeseries ?? undefined,
      breached: aggregatedBreached,
      isOverviewLoading: anyOverviewLoading || aggregatedOverview == null,
    };
  }

  return {
    overview: singleOverview.data,
    timeseries: singleTimeseries.data,
    breached: singleBreached.data,
    isOverviewLoading: singleOverview.isLoading,
  };
}

function TicketsDashboardContent() {
  const scope = useTeamScope();
  const [rangeDays, setRangeDays] = useState<"30" | "180" | "365">("30");
  const [assigneeId, setAssigneeId] = useState<string>("all");

  const queryRangeDays = Number(rangeDays) as 30 | 180 | 365;
  const queryAssigneeId = assigneeId === "all" ? undefined : Number(assigneeId);

  // The agent picker is always visible. When a single team is in
  // scope we narrow the agent list to that team; for multi/all we
  // fall back to every agent the API exposes, so the picker is
  // useful at every scope.
  const queryDeptId = scope.single ? scope.singleId ?? undefined : undefined;
  const agentsParams = queryDeptId != null ? { departmentId: queryDeptId } : {};
  const { data: agents } = useListAgents(agentsParams, {
    query: {
      queryKey: getListAgentsQueryKey(agentsParams),
    },
  });

  // Reset the agent filter whenever the team scope narrows or
  // broadens. Without this, picking an agent on Team A and then
  // switching to Team B would silently keep the old filter and
  // could produce empty result sets if that agent isn't on Team B.
  useEffect(() => {
    setAssigneeId("all");
  }, [queryDeptId]);

  const { overview, timeseries, breached, isOverviewLoading } =
    useScopedDashboard(queryRangeDays, queryAssigneeId);

  const chartData = useMemo(() => {
    return (
      timeseries?.points.map((p) => ({
        date: format(new Date(p.date), "MMM d"),
        Opened: p.opened,
        Resolved: p.resolved,
      })) ?? []
    );
  }, [timeseries]);

  // Breached tickets carry departmentId per row, so when scope is
  // multi/All and the API returned the full accessible set we narrow
  // it to the actively selected teams here.
  const breachedScoped = useMemo(() => {
    if (!breached) return [];
    if (scope.single || scope.isAll) return breached;
    return filterByTeamScope(breached, scope);
  }, [breached, scope]);

  const scopeLabel = useMemo(() => {
    if (scope.isAll) return "All Teams";
    if (scope.single) {
      const dept = scope.accessible.find((d) => d.id === scope.singleId);
      return dept?.name ?? "1 team";
    }
    return `${scope.selectedIds.length} teams`;
  }, [scope]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tickets Dashboard
          </h1>
          <p
            className="text-sm text-muted-foreground mt-1"
            data-testid="text-scope-label"
          >
            {scopeLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Always render the agent picker. The agent list is narrowed
              to the active team when one is in scope, and falls back
              to every agent when scope is multi or "All Teams". */}
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger
              className="w-[200px]"
              data-testid="select-assignee"
            >
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents && agents.length > 0 ? (
                agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))
              ) : (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No agents available
                </div>
              )}
            </SelectContent>
          </Select>
          <Select
            value={rangeDays}
            onValueChange={(v) => setRangeDays(v as "30" | "180" | "365")}
          >
            <SelectTrigger className="w-[160px]" data-testid="select-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
              <SelectItem value="365">Last 365 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isOverviewLoading || !overview ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="h-24 flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard
              icon={<Timer className="h-4 w-4 text-indigo-500" />}
              label="Avg Response"
              value={fmtDuration(overview.averageResponseSeconds)}
              hint={`${Math.round(overview.slaResponseCompliance * 100)}% within SLA`}
            />
            <KpiCard
              icon={<Clock className="h-4 w-4 text-violet-500" />}
              label="Avg Resolution"
              value={fmtDuration(overview.averageResolutionSeconds)}
              hint={`${Math.round(overview.slaResolutionCompliance * 100)}% within SLA`}
            />
            <KpiCard
              icon={<Target className="h-4 w-4 text-emerald-500" />}
              label="SLA Score"
              value={`${Math.round(overview.slaResolutionCompliance * 100)}%`}
              hint="Resolution compliance"
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              label="Breached SLA"
              value={String(overview.ticketsBreachedSla)}
              hint={`of ${overview.totalTickets} tickets`}
              tone="warning"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <StatusCard
              icon={<Inbox className="h-4 w-4 text-blue-500" />}
              label="Open"
              value={overview.openTickets}
            />
            <StatusCard
              icon={<Hourglass className="h-4 w-4 text-orange-500" />}
              label="Pending"
              value={overview.pendingTickets}
            />
            <StatusCard
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Resolved"
              value={overview.resolvedTickets}
            />
            <StatusCard
              icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
              label="Closed"
              value={overview.closedTickets}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Tickets opened vs resolved
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="gOpened"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#6366f1"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="#6366f1"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="gResolved"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#10b981"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="#10b981"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      allowDecimals={false}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="Opened"
                      stroke="#6366f1"
                      fill="url(#gOpened)"
                    />
                    <Area
                      type="monotone"
                      dataKey="Resolved"
                      stroke="#10b981"
                      fill="url(#gResolved)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Top agents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.topAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No agent activity in this range.
                  </p>
                ) : (
                  overview.topAgents.map((a) => (
                    <div
                      key={a.agentId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="truncate">{a.agentName}</span>
                      <Badge variant="secondary">{a.ticketCount}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Recent SLA breaches
              </CardTitle>
            </CardHeader>
            <CardContent>
              {breachedScoped.length > 0 ? (
                <div className="divide-y">
                  {breachedScoped.slice(0, 6).map((t) => (
                    <Link
                      key={t.id}
                      href={`/tickets/${t.id}`}
                      className="flex items-center justify-between py-2.5 text-sm hover:bg-muted/40 -mx-2 px-2 rounded"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-medium text-indigo-600 tabular-nums">
                          {t.ticketKey}
                        </span>
                        <span className="truncate">{t.title}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span>{t.departmentName}</span>
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-700"
                        >
                          {t.priority}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No SLA breaches in this range. Nice.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div
          className={
            tone === "warning"
              ? "text-2xl font-bold text-amber-600"
              : "text-2xl font-bold"
          }
        >
          {value}
        </div>
        {hint && (
          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="py-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
