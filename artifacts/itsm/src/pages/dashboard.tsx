import {
  useGetDashboardOverview,
  useGetDashboardTimeseries,
  useGetBreachedTickets,
  useGetSession,
  useListAgents,
  useListTickets,
  getListAgentsQueryKey,
  getListTicketsQueryKey,
  getDashboardOverview,
  getDashboardTimeseries,
  getBreachedTickets,
  getGetDashboardOverviewQueryKey,
  getGetDashboardTimeseriesQueryKey,
  getGetBreachedTicketsQueryKey,
  type DashboardOverview,
  type DashboardTimeseries,
  type Ticket,
  type TicketPriority,
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
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  RISK_LEVELS,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_COLOR,
  CATEGORY_PALETTE,
  bucketCounts,
  getTicketRiskBucket,
  getTicketCategoryBucket,
  getTicketRootCauseCategory,
  getTicketResolutionCategory,
} from "@/lib/ticket-categorization";
import {
  buildAiImpactSummary,
  buildTimeIntelligenceSummary,
  fmtMinutes,
} from "@/lib/ai-impact-placeholder";
import { DashboardVisibilityProvider } from "@/components/dashboard/dashboard-visibility-provider";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { CustomizeDashboardSheet } from "@/components/dashboard/customize-dashboard-sheet";
import { useDashboardVisibility } from "@/components/dashboard/dashboard-visibility-provider";
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
  isInRange,
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
  team_health: "Team Health",
  tickets: "Support Performance",
  operational_tasks: "Operations Overview",
  initiatives: "Initiative Pipeline",
  projects: "Project Execution",
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

      {view === "team_health" && showAgentViews && (
        <DashboardVisibilityProvider dashboardKey="team_health">
          <TeamHealthDashboard />
        </DashboardVisibilityProvider>
      )}
      {view === "tickets" && (
        <DashboardVisibilityProvider dashboardKey="support_performance">
          <TicketsDashboardContent />
        </DashboardVisibilityProvider>
      )}
      {view === "projects" && (
        <DashboardVisibilityProvider dashboardKey="project_execution">
          <ProjectsDashboard />
        </DashboardVisibilityProvider>
      )}
      {view === "initiatives" && (
        <DashboardVisibilityProvider dashboardKey="initiative_pipeline">
          <InitiativesDashboard />
        </DashboardVisibilityProvider>
      )}
      {view === "operational_tasks" && (
        <DashboardVisibilityProvider dashboardKey="operations_overview">
          <OperationalTasksDashboard />
        </DashboardVisibilityProvider>
      )}
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
  const { data: session } = useGetSession();
  const isAdmin = session?.role === "admin";
  const visibility = useDashboardVisibility();
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

  // Pull the full ticket list for the active team scope so we can
  // derive risk metrics (high-priority open, unassigned, stale) and
  // the priority breakdown chart client-side. The server-side
  // `/dashboard/overview` endpoint exposes aggregates only — it
  // doesn't expose per-ticket priority/assignee/age — so this is the
  // only path to those metrics without a new endpoint.
  const ticketsParams = queryDeptId != null ? { departmentId: queryDeptId } : {};
  const { data: allTickets } = useListTickets(ticketsParams, {
    query: { queryKey: getListTicketsQueryKey(ticketsParams) },
  });

  // Match the date window the rest of this dashboard is showing.
  // Without this, the Risk/Workload tiles would always be computed
  // off the full ticket history while the SLA/Throughput cards next
  // to them obey the picker — producing contradictory numbers on the
  // same screen when users change the range.
  const ticketBounds = useMemo(() => resolveRange(range), [range]);

  const scopedTickets = useMemo<Ticket[]>(() => {
    let list: Ticket[] = allTickets ?? [];
    if (!scope.single && !scope.isAll) list = filterByTeamScope(list, scope);
    if (assigneeIds.length > 0) {
      const idSet = new Set(assigneeIds);
      list = list.filter(
        (t) => t.assigneeId != null && idSet.has(t.assigneeId),
      );
    }
    list = list.filter((t) => isInRange(t.createdAt, ticketBounds));
    return list;
  }, [allTickets, scope, assigneeIds, ticketBounds]);

  const riskStats = useMemo(() => {
    const now = Date.now();
    const STALE_MS = 7 * 24 * 60 * 60 * 1000;
    const AT_RISK_WINDOW_MS = 24 * 60 * 60 * 1000;
    const isOpen = (t: Ticket) =>
      t.status !== "resolved" && t.status !== "closed";
    const open = scopedTickets.filter(isOpen);
    // "At-risk" = active SLA clock running (not paused, not breached) and
    // the deadline lands inside the next 24h. The schema only exposes
    // on_track / breached / paused, so we derive the at-risk bucket
    // ourselves from `slaActiveDueAt`.
    const atRiskSla = open.filter((t) => {
      if (t.slaStatus !== "on_track") return false;
      if (!t.slaActiveDueAt) return false;
      const dueMs = new Date(t.slaActiveDueAt).getTime();
      return dueMs - now > 0 && dueMs - now <= AT_RISK_WINDOW_MS;
    }).length;
    const highPriorityOpen = open.filter(
      (t) => t.priority === "urgent" || t.priority === "high",
    ).length;
    const unassigned = open.filter((t) => t.assigneeId == null).length;
    const stale = open.filter(
      (t) => now - new Date(t.updatedAt).getTime() > STALE_MS,
    ).length;
    const created = scopedTickets.length;
    const resolved = scopedTickets.filter((t) => t.resolvedAt != null).length;
    const backlog = open.length;
    // Priority distribution chart — always render the four buckets
    // even when empty so the X axis is stable across re-renders.
    const priorityCounts: Record<TicketPriority, number> = {
      urgent: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const t of scopedTickets) {
      priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;
    }
    const priorityChart = [
      { name: "Urgent", value: priorityCounts.urgent, fill: "#ef4444" },
      { name: "High", value: priorityCounts.high, fill: "#f97316" },
      { name: "Medium", value: priorityCounts.medium, fill: "#eab308" },
      { name: "Low", value: priorityCounts.low, fill: "#10b981" },
    ];

    // Risk Level distribution — uses ticket.riskLevel with fallback to
    // "Uncategorized". Always render the full set of buckets so the
    // chart axis is stable across re-renders.
    const riskBucketCounts = bucketCounts(scopedTickets, getTicketRiskBucket);
    const riskChart = RISK_LEVELS.map((k) => ({
      name: RISK_LEVEL_LABEL[k] ?? k,
      value: riskBucketCounts.get(k) ?? 0,
      fill: RISK_LEVEL_COLOR[k] ?? "#94a3b8",
    }));

    // Category donut — derived from the free-text `category` field.
    // Top 8 categories shown individually; everything else collapses
    // into an "Other" slice so the donut stays legible.
    const categoryEntries = Array.from(
      bucketCounts(scopedTickets, getTicketCategoryBucket).entries(),
    ).sort((a, b) => b[1] - a[1]);
    const TOP_N_CATEGORIES = 8;
    const topCats = categoryEntries.slice(0, TOP_N_CATEGORIES);
    const restCats = categoryEntries.slice(TOP_N_CATEGORIES);
    let restTotal = restCats.reduce((acc, [, v]) => acc + v, 0);
    // If a real ticket category is literally named "Other" we must
    // not render two identically-labelled slices — fold that real
    // bucket into the synthetic remainder so the donut stays
    // unambiguous and React keys stay unique.
    const filteredTop = topCats.filter(([name, value]) => {
      if (name === "Other") {
        restTotal += value;
        return false;
      }
      return true;
    });
    const categoryChart = [
      ...filteredTop.map(([name, value], i) => ({
        name,
        value,
        fill: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
      })),
      ...(restTotal > 0
        ? [{ name: "Other", value: restTotal, fill: "#cbd5e1" }]
        : []),
    ];

    // Root cause + resolution distributions — derive at-read using the
    // free-text notes until persisted category fields land. Sorted so
    // the bar chart leads with the most common bucket.
    const rootCauseEntries = Array.from(
      bucketCounts(scopedTickets, getTicketRootCauseCategory).entries(),
    ).sort((a, b) => b[1] - a[1]);
    const rootCauseChart = rootCauseEntries.map(([name, value]) => ({
      name,
      value,
    }));
    const resolutionEntries = Array.from(
      bucketCounts(scopedTickets, getTicketResolutionCategory).entries(),
    ).sort((a, b) => b[1] - a[1]);
    const resolutionChart = resolutionEntries.map(([name, value]) => ({
      name,
      value,
    }));

    return {
      atRiskSla,
      highPriorityOpen,
      unassigned,
      stale,
      created,
      resolved,
      backlog,
      priorityChart,
      riskChart,
      categoryChart,
      rootCauseChart,
      resolutionChart,
    };
  }, [scopedTickets]);

  // AI Impact + Time Intelligence summaries are placeholder-derived
  // (see ai-impact-placeholder for the contract) but scoped against
  // the same scopedTickets list, so they react to team/agent/range
  // filters just like the real KPIs.
  const aiSummary = useMemo(
    () => buildAiImpactSummary(scopedTickets),
    [scopedTickets],
  );
  const timeSummary = useMemo(
    () => buildTimeIntelligenceSummary(scopedTickets),
    [scopedTickets],
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
            Support Performance
          </h1>
          <p
            className="text-sm text-muted-foreground mt-1"
            data-testid="text-dashboard-description"
          >
            Track response times, resolution efficiency, and SLA performance
            across your support team.
          </p>
          <p
            className="text-xs text-muted-foreground mt-1"
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
          {isAdmin && <CustomizeDashboardSheet />}
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
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto">
            {/* The overview tab always renders because three of its
                four sub-sections are locked; only the optional tabs
                drop their trigger when hidden via Customize. */}
            <TabsTrigger value="overview" data-testid="tab-overview">
              Overview
            </TabsTrigger>
            {visibility.isVisible("risk_categories") && (
              <TabsTrigger value="risk" data-testid="tab-risk-categories">
                Risk &amp; Categories
              </TabsTrigger>
            )}
            {visibility.isVisible("root_cause_resolution") && (
              <TabsTrigger value="root-cause" data-testid="tab-root-cause">
                Root Cause &amp; Resolution
              </TabsTrigger>
            )}
            {visibility.isVisible("ai_impact") && (
              <TabsTrigger value="ai-impact" data-testid="tab-ai-impact">
                AI Impact
              </TabsTrigger>
            )}
            {visibility.isVisible("time_intelligence") && (
              <TabsTrigger
                value="time-intelligence"
                data-testid="tab-time-intelligence"
              >
                Time Intelligence
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-0">
          <DashboardSection sectionKey="performance_metrics">
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
          </DashboardSection>

          <DashboardSection sectionKey="workload">
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

          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              icon={<Inbox className="h-4 w-4 text-sky-500" />}
              label="Created (in scope)"
              value={String(riskStats.created)}
              hint="Tickets visible at current scope"
            />
            <KpiCard
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Resolved (in scope)"
              value={String(riskStats.resolved)}
              hint="Including closed"
            />
            <KpiCard
              icon={<Hourglass className="h-4 w-4 text-amber-500" />}
              label="Backlog"
              value={String(riskStats.backlog)}
              hint="Open + pending + on hold"
              tone={riskStats.backlog > 0 ? "warning" : undefined}
            />
          </div>
          </DashboardSection>

          <DashboardSection sectionKey="risk_sla">
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              label="At-Risk SLA"
              value={String(riskStats.atRiskSla)}
              hint="Open tickets nearing breach"
              tone={riskStats.atRiskSla > 0 ? "warning" : undefined}
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
              label="High-Priority Open"
              value={String(riskStats.highPriorityOpen)}
              hint="Urgent + high, still open"
              tone={riskStats.highPriorityOpen > 0 ? "warning" : undefined}
            />
            <KpiCard
              icon={<Inbox className="h-4 w-4 text-violet-500" />}
              label="Unassigned"
              value={String(riskStats.unassigned)}
              hint="Open tickets with no owner"
              tone={riskStats.unassigned > 0 ? "warning" : undefined}
            />
            <KpiCard
              icon={<Clock className="h-4 w-4 text-orange-500" />}
              label="Stale > 7d"
              value={String(riskStats.stale)}
              hint="No update in 7+ days"
              tone={riskStats.stale > 0 ? "warning" : undefined}
            />
          </div>
          </DashboardSection>

          <DashboardSection sectionKey="ticket_analysis">
          <Card data-testid="card-priority-distribution">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Tickets by priority
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[240px]">
              {riskStats.created === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tickets in scope.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={riskStats.priorityChart}
                    margin={{ top: 5, right: 20, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      allowDecimals={false}
                    />
                    <Tooltip />
                    <Bar dataKey="value" name="Tickets" radius={[4, 4, 0, 0]}>
                      {riskStats.priorityChart.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

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
          </DashboardSection>

          <DashboardSection sectionKey="risk_sla">
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
          </DashboardSection>
          </TabsContent>

          <TabsContent value="risk" className="space-y-6 mt-0">
            <DashboardSection sectionKey="risk_categories">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card data-testid="card-risk-level">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    Tickets by risk level
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]">
                  {riskStats.created === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tickets in scope.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={riskStats.riskChart}
                        margin={{ top: 5, right: 20, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e2e8f0"
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          allowDecimals={false}
                        />
                        <Tooltip />
                        <Bar
                          dataKey="value"
                          name="Tickets"
                          radius={[4, 4, 0, 0]}
                        >
                          {riskStats.riskChart.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-category-donut">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-sky-500" />
                    Tickets by category
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]">
                  {riskStats.categoryChart.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tickets in scope.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip />
                        <Legend
                          layout="vertical"
                          align="right"
                          verticalAlign="middle"
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <Pie
                          data={riskStats.categoryChart}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {riskStats.categoryChart.map((entry, i) => (
                            <Cell
                              key={`${entry.name}-${i}`}
                              fill={entry.fill}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
            </DashboardSection>
          </TabsContent>

          <TabsContent value="root-cause" className="space-y-6 mt-0">
            <DashboardSection sectionKey="root_cause_resolution">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card data-testid="card-root-cause">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Root cause distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {riskStats.rootCauseChart.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tickets in scope.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={riskStats.rootCauseChart}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 30, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e2e8f0"
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          allowDecimals={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          width={170}
                        />
                        <Tooltip />
                        <Bar
                          dataKey="value"
                          name="Tickets"
                          fill="#6366f1"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-resolution">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Resolution distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {riskStats.resolutionChart.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tickets in scope.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={riskStats.resolutionChart}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 30, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e2e8f0"
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          allowDecimals={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          width={170}
                        />
                        <Tooltip />
                        <Bar
                          dataKey="value"
                          name="Tickets"
                          fill="#10b981"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
            <p className="text-xs text-muted-foreground">
              Categories are derived from the tech&apos;s free-text root
              cause and resolution notes via a rule-based classifier.
              When the dedicated category fields ship they will replace
              this derivation automatically.
            </p>
            </DashboardSection>
          </TabsContent>

          <TabsContent value="ai-impact" className="space-y-6 mt-0">
            <DashboardSection sectionKey="ai_impact">
            <p className="text-xs text-muted-foreground">
              AI Impact metrics are placeholder values derived from the
              current ticket dataset until the AI handling backend lands.
              They scale with your filters but should not be used for
              capacity planning.
            </p>
            <div className="grid gap-4 md:grid-cols-4">
              <KpiCard
                icon={<TrendingUp className="h-4 w-4 text-indigo-500" />}
                label="AI Resolved"
                value={String(aiSummary.aiResolved)}
                hint="Interactions handled by AI"
              />
              <KpiCard
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                label="AI Deflected"
                value={String(aiSummary.aiDeflected)}
                hint="Avoided becoming tickets"
              />
              <KpiCard
                icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
                label="Human Escalations"
                value={String(aiSummary.humanEscalated)}
                hint="Routed to a human agent"
              />
              <KpiCard
                icon={<Clock className="h-4 w-4 text-violet-500" />}
                label="Time Saved by AI"
                value={fmtMinutes(aiSummary.estimatedMinutesSaved)}
                hint="Estimated, vs avg human time"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card data-testid="card-ai-resolved-vs-human">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    AI resolved vs human escalated
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Pie
                        data={aiSummary.donutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {aiSummary.donutData.map((e) => (
                          <Cell key={e.name} fill={e.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card data-testid="card-ai-deflected-vs-created">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    AI deflected vs tickets created
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={aiSummary.deflectedVsCreated}
                      margin={{ top: 5, right: 20, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        allowDecimals={false}
                      />
                      <Tooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {aiSummary.deflectedVsCreated.map((e) => (
                          <Cell key={e.name} fill={e.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card data-testid="card-ai-time-saved-trend">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  AI time saved trend
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                {aiSummary.trend.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tickets in scope.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={aiSummary.trend}
                      margin={{ top: 5, right: 20, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        formatter={(v: number) => [
                          fmtMinutes(v),
                          "Time saved",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="minutesSaved"
                        name="Minutes saved"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            </DashboardSection>
          </TabsContent>

          <TabsContent
            value="time-intelligence"
            className="space-y-6 mt-0"
          >
            <DashboardSection sectionKey="time_intelligence">
            <p className="text-xs text-muted-foreground">
              Time Intelligence metrics rely on per-stage timing
              information that isn&apos;t yet captured per-ticket.
              Values are placeholder estimates derived from the current
              dataset and replace once the timing backend lands.
            </p>
            <div className="grid gap-4 md:grid-cols-4">
              <KpiCard
                icon={<Timer className="h-4 w-4 text-indigo-500" />}
                label="Avg Time per Ticket"
                value={fmtMinutes(timeSummary.avgMinutesPerTicket)}
                hint="Resolved tickets, end-to-end"
              />
              <KpiCard
                icon={<Clock className="h-4 w-4 text-emerald-500" />}
                label="Saved Before Assignment"
                value={fmtMinutes(timeSummary.minutesSavedBeforeAssignment)}
                hint="AI handled pre-assignment"
              />
              <KpiCard
                icon={<Clock className="h-4 w-4 text-orange-500" />}
                label="Human Support Time"
                value={fmtMinutes(timeSummary.humanSupportMinutes)}
                hint="Across all human-handled work"
              />
              <KpiCard
                icon={<Clock className="h-4 w-4 text-violet-500" />}
                label="AI Handling Time"
                value={fmtMinutes(timeSummary.aiHandlingMinutes)}
                hint="Across AI-resolved interactions"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card data-testid="card-time-comparison">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Avg AI vs human resolution time
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={timeSummary.comparisonChart}
                      margin={{ top: 5, right: 20, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        formatter={(v: number) => [fmtMinutes(v), "Time"]}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {timeSummary.comparisonChart.map((e) => (
                          <Cell key={e.name} fill={e.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card data-testid="card-support-time-trend">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Support time trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {timeSummary.trend.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tickets in scope.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={timeSummary.trend}
                        margin={{ top: 5, right: 20, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e2e8f0"
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          formatter={(v: number) => [fmtMinutes(v), "Time"]}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="monotone"
                          dataKey="humanMinutes"
                          name="Human"
                          stroke="#f97316"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="aiMinutes"
                          name="AI"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
            </DashboardSection>
          </TabsContent>
        </Tabs>
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
