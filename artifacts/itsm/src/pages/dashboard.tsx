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
import TeamHealthDashboard from "@/pages/team-health-dashboard";
import { useTeamScope, filterByTeamScope } from "@/lib/team-scope";
import {
  AssigneePicker,
  TimeRangePicker,
  resolveRange,
  teamScopeSignature,
  DEFAULT_TIME_RANGE,
  type TimeRangeValue,
} from "@/lib/dashboard-filters";

function fmtDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.round(seconds / 3600);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

type DashboardView =
  | "team_health"
  | "tickets"
  | "projects"
  | "initiatives"
  | "operational_tasks";

// v2: bumped when Team Health Dashboard was introduced as the new
// default. Existing users had "tickets" persisted purely because
// tickets *was* the previous default — bumping the key lets the new
// default land for everyone exactly once. Subsequent explicit picks
// from the dropdown are still persisted under the v2 key.
const DASHBOARD_VIEW_KEY = "itsm.dashboard.view.v2";

const DASHBOARD_VIEW_LABEL: Record<DashboardView, string> = {
  team_health: "Team Health Dashboard",
  tickets: "Tickets",
  operational_tasks: "Operational Tasks",
  initiatives: "Initiatives",
  projects: "Projects",
};

function isDashboardView(v: string): v is DashboardView {
  return (
    v === "team_health" ||
    v === "tickets" ||
    v === "projects" ||
    v === "initiatives" ||
    v === "operational_tasks"
  );
}

export default function Dashboard() {
  const { data: session } = useGetSession();
  // End-users only see Tickets — Team Health, Projects, Initiatives,
  // and Operational Tasks are agent/admin surfaces. Until the session
  // resolves we treat the user as restricted for *render-gating*
  // purposes, but defaulting waits for the session to actually
  // resolve so we never lock an agent into the end-user default.
  const showAgentViews = session !== undefined && session.role !== "end_user";

  // The active view stays `null` until the session resolves. This is
  // critical: if we picked a default at first render we'd capture
  // "tickets" (because `session` is briefly undefined) for everyone
  // — including agents/admins — and persist that to localStorage,
  // defeating the new Team Health default. Once the session is
  // known, the post-resolution effect below applies the saved
  // preference if present, otherwise the role-appropriate default.
  const [view, setView] = useState<DashboardView | null>(null);

  // Default landing view differs by role: agents/admins land on the
  // Team Health overview, end-users on Tickets (the only view they
  // can see). A user's explicit dropdown selection is persisted to
  // localStorage under the v2 key and respected on subsequent loads
  // regardless of team scope, so changing teams or reloading never
  // resets the dropdown unless the user picks something else.
  useEffect(() => {
    if (session === undefined) return;
    const stored =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(DASHBOARD_VIEW_KEY);
    const persisted =
      stored && isDashboardView(stored) ? (stored as DashboardView) : null;
    const roleDefault: DashboardView = showAgentViews
      ? "team_health"
      : "tickets";

    if (persisted == null) {
      setView(roleDefault);
      return;
    }
    // Persisted preference is honoured, but agent-only views must
    // never be rendered for end-users (handled here on first apply
    // and by the snap-back effect below for live role changes).
    if (!showAgentViews && persisted !== "tickets") {
      setView("tickets");
      return;
    }
    setView(persisted);
    // We deliberately depend on session identity (via session?.role)
    // rather than just `showAgentViews` so the effect re-runs when
    // session resolves from undefined → defined.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.role, session === undefined]);

  // Live snap-back: if the role changes mid-session (e.g. session
  // switch) and the agent-only views are no longer visible, force
  // the dropdown back to the only entry the user can see.
  useEffect(() => {
    if (view == null) return;
    if (!showAgentViews && view !== "tickets") {
      setView("tickets");
    }
  }, [showAgentViews, view]);

  // Only persist *real* selections — never the transient null state,
  // and never overwrite the saved preference before the session has
  // resolved.
  useEffect(() => {
    if (view == null) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_VIEW_KEY, view);
  }, [view]);

  // Don't render the dropdown until the session resolves and we know
  // which default to apply — otherwise the radix Select would briefly
  // commit to whatever transient value we passed it.
  if (view == null) {
    return (
      <div
        className="space-y-6"
        data-testid="dashboard-page"
        aria-busy="true"
      />
    );
  }

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
            className="w-[240px]"
            data-testid="select-dashboard-view"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {showAgentViews && (
              <SelectItem value="team_health">
                {DASHBOARD_VIEW_LABEL.team_health}
              </SelectItem>
            )}
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

      {view === "team_health" && showAgentViews && <TeamHealthDashboard />}
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
// team scope and the (multi-select) agent filter. We materialize the
// active scope into a list of (teamId, agentId) pairs and either:
//   - fire a single query when there's exactly 1 pair (the common
//     case: one team or "All Teams" × no agent filter / 1 agent), or
//   - fan out one query per pair via useQueries and aggregate the
//     results client-side via aggregate*() for the multi case.
//
// Team dimension:
//   - "All Teams"          → [undefined]    (server returns full set)
//   - single team          → [singleId]
//   - explicit multi (2+)  → [...selectedIds]
// Agent dimension:
//   - no agents selected   → [undefined]    (no agent filter)
//   - 1+ agents selected   → [...assigneeIds]
//
// Cross-product fan-out matches the per-team aggregation already in
// place: picking 2 teams × 3 agents fires 6 parallel queries and the
// totals are the same as visiting each (team, agent) view in turn.
function useScopedDashboard(
  rangeDays: number,
  assigneeIds: number[],
  // Custom range bounds. When both are set the server uses them as
  // the absolute window and `rangeDays` becomes a granularity hint
  // for timeseries bucketing. When undefined the server falls back
  // to "last `rangeDays` days from now".
  fromIso: string | undefined,
  toIso: string | undefined,
) {
  const scope = useTeamScope();

  // Resolve the active team dimension. Empty list means "scope not
  // ready yet" and we disable all queries.
  const teamIds = useMemo<(number | undefined)[]>(() => {
    if (scope.loading) return [];
    if (scope.isAll) return [undefined];
    if (scope.single) return scope.singleId != null ? [scope.singleId] : [];
    return scope.selectedIds;
  }, [scope]);

  const agentIds = useMemo<(number | undefined)[]>(
    () => (assigneeIds.length === 0 ? [undefined] : assigneeIds),
    [assigneeIds],
  );

  const pairs = useMemo(
    () =>
      teamIds.flatMap((teamId) =>
        agentIds.map((agentId) => ({ teamId, agentId })),
      ),
    [teamIds, agentIds],
  );

  const isMulti = pairs.length > 1;
  const isSingle = pairs.length === 1;
  const singlePair = isSingle ? pairs[0] : undefined;

  // Single path: one query per endpoint. The hooks are always
  // declared (React hook order) and gated via `enabled` so they
  // don't fire when the multi path is active.
  const singleOverviewParams = {
    departmentId: singlePair?.teamId,
    assigneeId: singlePair?.agentId,
    rangeDays,
    from: fromIso,
    to: toIso,
  };
  const singleTimeseriesParams = {
    departmentId: singlePair?.teamId,
    assigneeId: singlePair?.agentId,
    rangeDays,
    from: fromIso,
    to: toIso,
  };
  const singleBreachedParams = {
    departmentId: singlePair?.teamId,
    assigneeId: singlePair?.agentId,
    rangeDays,
    from: fromIso,
    to: toIso,
  };
  const singleOverview = useGetDashboardOverview(singleOverviewParams, {
    query: {
      queryKey: getGetDashboardOverviewQueryKey(singleOverviewParams),
      enabled: isSingle,
    },
  });
  const singleTimeseries = useGetDashboardTimeseries(singleTimeseriesParams, {
    query: {
      queryKey: getGetDashboardTimeseriesQueryKey(singleTimeseriesParams),
      enabled: isSingle,
    },
  });
  const singleBreached = useGetBreachedTickets(singleBreachedParams, {
    query: {
      queryKey: getGetBreachedTicketsQueryKey(singleBreachedParams),
      enabled: isSingle,
    },
  });

  // Multi path: parallel per-pair queries via useQueries. We always
  // declare these (even when not multi) so React's hook order stays
  // stable; they're empty arrays when disabled.
  const multiPairs = isMulti ? pairs : [];
  const overviewQueries = useQueries({
    queries: multiPairs.map(({ teamId, agentId }) => {
      const p = {
        departmentId: teamId,
        assigneeId: agentId,
        rangeDays,
        from: fromIso,
        to: toIso,
      };
      return {
        queryKey: getGetDashboardOverviewQueryKey(p),
        queryFn: () => getDashboardOverview(p),
        enabled: isMulti,
      };
    }),
  });
  const timeseriesQueries = useQueries({
    queries: multiPairs.map(({ teamId, agentId }) => {
      const p = {
        departmentId: teamId,
        assigneeId: agentId,
        rangeDays,
        from: fromIso,
        to: toIso,
      };
      return {
        queryKey: getGetDashboardTimeseriesQueryKey(p),
        queryFn: () => getDashboardTimeseries(p),
        enabled: isMulti,
      };
    }),
  });
  const breachedQueries = useQueries({
    queries: multiPairs.map(({ teamId, agentId }) => {
      const p = {
        departmentId: teamId,
        assigneeId: agentId,
        rangeDays,
        from: fromIso,
        to: toIso,
      };
      return {
        queryKey: getGetBreachedTicketsQueryKey(p),
        queryFn: () => getBreachedTickets(p),
        enabled: isMulti,
      };
    }),
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

  // Scope is still bootstrapping (or has zero pairs for any other
  // reason). Force a loading state instead of falling through to the
  // disabled single-query path, where react-query would otherwise
  // surface stale cached data for the previous (departmentId,
  // assigneeId) key during the brief window before scope resolves.
  if (scope.loading || pairs.length === 0) {
    return {
      overview: undefined as DashboardOverview | undefined,
      timeseries: undefined as DashboardTimeseries | undefined,
      breached: [] as Ticket[],
      isOverviewLoading: true,
    };
  }

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
  const [range, setRange] = useState<TimeRangeValue>(DEFAULT_TIME_RANGE);
  // Multi-select agent filter. Empty array = "All Agents" (no filter).
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);

  // Translate the shared TimeRangeValue into the params the dashboard
  // endpoints understand:
  //   - For a preset (e.g. 30/90/365) the server computes the window
  //     itself from `rangeDays`, so we pass that and leave from/to
  //     undefined.
  //   - For "custom" we resolve the absolute window client-side and
  //     pass it as ISO strings; `rangeDays` is then sent purely as a
  //     bucket-granularity hint (≤30 days → daily, ≤180 → weekly,
  //     otherwise monthly), computed from the span so the chart
  //     resolution matches the chosen window.
  const queryParams = useMemo(() => {
    if (range.preset !== "custom") {
      return {
        rangeDays: Number(range.preset),
        from: undefined as string | undefined,
        to: undefined as string | undefined,
      };
    }
    const bounds = resolveRange(range);
    if (bounds.startMs == null || bounds.endMs == null) {
      // Half-specified custom range — fall back to the default preset
      // until the user fills in both dates so we don't accidentally
      // hit the server with a one-sided window.
      return {
        rangeDays: 30,
        from: undefined as string | undefined,
        to: undefined as string | undefined,
      };
    }
    const spanDays = Math.max(
      1,
      Math.ceil((bounds.endMs - bounds.startMs) / (24 * 60 * 60 * 1000)),
    );
    return {
      rangeDays: spanDays,
      from: new Date(bounds.startMs).toISOString(),
      to: new Date(bounds.endMs).toISOString(),
    };
  }, [range]);

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

  // Reset the agent filter whenever the team scope changes in any
  // meaningful way. We watch the full scope signature (not just the
  // single-team id) so transitions like "All Teams" → an explicit
  // multi-team subset also reset, instead of silently leaking the
  // previously selected agent.
  const scopeSig = teamScopeSignature(scope);
  useEffect(() => {
    setAssigneeIds([]);
  }, [scopeSig]);

  const { overview, timeseries, breached, isOverviewLoading } =
    useScopedDashboard(
      queryParams.rangeDays,
      assigneeIds,
      queryParams.from,
      queryParams.to,
    );

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
          <AssigneePicker
            selectedIds={assigneeIds}
            onChange={setAssigneeIds}
            agents={agents ?? []}
            testId="select-tickets-dashboard-assignee"
          />
          <TimeRangePicker value={range} onChange={setRange} />
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
