import { useMemo } from "react";
import { Link } from "wouter";
import {
  useListTickets,
  useListOperationalTasks,
  useListInitiatives,
  useListProjects,
  useGetSession,
  getListTicketsQueryKey,
  getListOperationalTasksQueryKey,
  getListInitiativesQueryKey,
  getListProjectsQueryKey,
  type Ticket,
  type OperationalTask,
  type Initiative,
  type ProjectSummary,
} from "@workspace/api-client-react";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { CustomizeDashboardSheet } from "@/components/dashboard/customize-dashboard-sheet";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Inbox,
  KanbanSquare,
  Lightbulb,
  ListChecks,
  PauseCircle,
  ShieldCheck,
  Users,
  Layers,
} from "lucide-react";
import { useTeamScope, filterByTeamScope } from "@/lib/team-scope";
import {
  useDashboardFilters,
  TimeRangePicker,
  AssigneePicker,
  useAgentOptions,
  isInRange,
} from "@/lib/dashboard-filters";
import { cn } from "@/lib/utils";

// "Active" = anything still on the team's plate. Cleanest definition
// is "not resolved and not closed" — that covers paused states like
// with_user / with_vendor / on_hold / scheduled which still represent
// open inventory even though the SLA clock is paused.
function ticketIsActive(t: Ticket): boolean {
  return t.status !== "resolved" && t.status !== "closed";
}

function projectIsActive(p: ProjectSummary): boolean {
  return p.status === "active" || p.status === "on_hold";
}

function projectIsAtRisk(p: ProjectSummary): boolean {
  if (p.status === "completed" || p.status === "archived") return false;
  if (!p.dueAt) return false;
  return new Date(p.dueAt as unknown as string).getTime() < Date.now();
}

function formatShortDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso as string).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function TeamHealthDashboard() {
  const scope = useTeamScope();
  const { data: session } = useGetSession();
  const isAdmin = session?.role === "admin";

  // Same convention as the other sub-dashboards: when a single team
  // is in scope we narrow the API call by departmentId so the user
  // only pays for what they need; for "All Teams" / multi-team we
  // pull the user's full accessible set and narrow client-side via
  // filterByTeamScope.
  const queryDeptId = scope.single ? scope.singleId ?? undefined : undefined;
  const filters = useDashboardFilters();
  const agents = useAgentOptions(queryDeptId);

  const ticketParams = queryDeptId != null ? { departmentId: queryDeptId } : {};
  const opsParams = queryDeptId != null ? { departmentId: queryDeptId } : {};
  const initParams = queryDeptId != null ? { departmentId: queryDeptId } : {};
  const projParams = { departmentId: queryDeptId };

  const tickets = useListTickets(ticketParams, {
    query: { queryKey: getListTicketsQueryKey(ticketParams) },
  });
  const opsTasks = useListOperationalTasks(opsParams, {
    query: { queryKey: getListOperationalTasksQueryKey(opsParams) },
  });
  const initiatives = useListInitiatives(initParams, {
    query: { queryKey: getListInitiativesQueryKey(initParams) },
  });
  const projects = useListProjects(projParams, {
    query: { queryKey: getListProjectsQueryKey(projParams) },
  });

  const isLoading =
    tickets.isLoading ||
    opsTasks.isLoading ||
    initiatives.isLoading ||
    projects.isLoading;

  // Apply scope (multi-team only — single is server-narrowed already,
  // and "all" passes through). Then apply the agent filter: tickets
  // and initiatives carry an `assigneeId`; ops tasks and projects use
  // `ownerId`. A null assignee/owner can never match an explicit
  // agent selection, so it gets dropped when the filter is active.
  // Finally apply the time-range filter on the field that best
  // reflects "recent activity": tickets by createdAt (matches the
  // Tickets dashboard), the rest by updatedAt (matches the existing
  // sub-dashboards).
  const assigneeFilter = filters.assigneeFilter;
  const scopedTickets = useMemo<Ticket[]>(() => {
    let list: Ticket[] = tickets.data ?? [];
    if (!scope.single && !scope.isAll) list = filterByTeamScope(list, scope);
    if (assigneeFilter)
      list = list.filter(
        (t) => t.assigneeId != null && assigneeFilter.has(t.assigneeId),
      );
    return list.filter((t) => isInRange(t.createdAt, filters.bounds));
  }, [tickets.data, scope, assigneeFilter, filters.bounds]);

  const scopedOpsTasks = useMemo<OperationalTask[]>(() => {
    let list: OperationalTask[] = opsTasks.data ?? [];
    if (!scope.single && !scope.isAll) list = filterByTeamScope(list, scope);
    if (assigneeFilter)
      list = list.filter(
        (t) => t.ownerId != null && assigneeFilter.has(t.ownerId),
      );
    return list.filter((t) => isInRange(t.updatedAt, filters.bounds));
  }, [opsTasks.data, scope, assigneeFilter, filters.bounds]);

  const scopedInitiatives = useMemo<Initiative[]>(() => {
    let list: Initiative[] = initiatives.data ?? [];
    if (!scope.single && !scope.isAll) list = filterByTeamScope(list, scope);
    if (assigneeFilter)
      list = list.filter(
        (i) => i.assigneeId != null && assigneeFilter.has(i.assigneeId),
      );
    return list.filter((i) => isInRange(i.updatedAt, filters.bounds));
  }, [initiatives.data, scope, assigneeFilter, filters.bounds]);

  const scopedProjects = useMemo<ProjectSummary[]>(() => {
    let list: ProjectSummary[] = projects.data ?? [];
    if (!scope.single && !scope.isAll) list = filterByTeamScope(list, scope);
    if (assigneeFilter)
      list = list.filter(
        (p) => p.ownerId != null && assigneeFilter.has(p.ownerId),
      );
    return list.filter((p) => isInRange(p.updatedAt, filters.bounds));
  }, [projects.data, scope, assigneeFilter, filters.bounds]);

  // Aggregate KPIs across all scoped data.
  const kpis = useMemo(() => {
    const activeTickets = scopedTickets.filter(ticketIsActive);
    const breachedTickets = activeTickets.filter((t) => t.slaBreached);
    // "Active" ops tasks = non-terminal only. The status enum is
    // scheduled / in_progress / completed / closed; both completed and
    // closed are terminal and must be excluded so we don't inflate the
    // workload composite below.
    const activeOps = scopedOpsTasks.filter(
      (t) => t.status === "scheduled" || t.status === "in_progress",
    );
    const overdueOps = scopedOpsTasks.filter(
      (t) =>
        t.isOverdue &&
        (t.status === "scheduled" || t.status === "in_progress"),
    );
    const inReviewInitiatives = scopedInitiatives.filter(
      (i) => i.status === "under_review",
    );
    const activeProjects = scopedProjects.filter(projectIsActive);
    const onHoldProjects = scopedProjects.filter(
      (p) => p.status === "on_hold",
    );
    const atRiskProjects = scopedProjects.filter(projectIsAtRisk);

    const slaCompliance =
      activeTickets.length === 0
        ? null
        : Math.round(
            ((activeTickets.length - breachedTickets.length) /
              activeTickets.length) *
              100,
          );

    // "Total active work" composite — what's currently on the team's
    // plate across every channel. Initiatives count only the in-review
    // ones since backlog isn't truly "active work".
    const totalActiveWork =
      activeTickets.length +
      activeOps.length +
      inReviewInitiatives.length +
      activeProjects.length;

    return {
      activeTickets: activeTickets.length,
      breachedTickets: breachedTickets.length,
      slaCompliance,
      activeOps: activeOps.length,
      overdueOps: overdueOps.length,
      totalOps: scopedOpsTasks.length,
      inReviewInitiatives: inReviewInitiatives.length,
      totalInitiatives: scopedInitiatives.length,
      activeProjects: activeProjects.length,
      onHoldProjects: onHoldProjects.length,
      atRiskProjects: atRiskProjects.length,
      totalActiveWork,
    };
  }, [scopedTickets, scopedOpsTasks, scopedInitiatives, scopedProjects]);

  // Per-team breakdown — only useful when more than one team is in
  // scope. We bucket by departmentId and look up names from the
  // accessible teams list so renamed/missing teams don't crash the
  // table.
  const showWorkloadTable = scope.selectedIds.length > 1 || scope.isAll;
  const teamRows = useMemo(() => {
    if (!showWorkloadTable) return [];
    const ids = scope.isAll
      ? scope.accessible.map((d) => d.id)
      : scope.selectedIds;
    const nameById = new Map(scope.accessible.map((d) => [d.id, d.name]));

    const countByDept = <T extends { departmentId?: number | null }>(
      list: T[],
      predicate: (item: T) => boolean,
    ) => {
      const m = new Map<number, number>();
      for (const it of list) {
        if (it.departmentId == null) continue;
        if (!predicate(it)) continue;
        m.set(it.departmentId, (m.get(it.departmentId) ?? 0) + 1);
      }
      return m;
    };

    const activeTicketsByDept = countByDept(scopedTickets, ticketIsActive);
    const breachedTicketsByDept = countByDept(
      scopedTickets,
      (t) => ticketIsActive(t) && t.slaBreached,
    );
    const overdueOpsByDept = countByDept(
      scopedOpsTasks,
      (t) => t.isOverdue && t.status !== "completed",
    );
    const inReviewByDept = countByDept(
      scopedInitiatives,
      (i) => i.status === "under_review",
    );
    const atRiskProjectsByDept = countByDept(scopedProjects, projectIsAtRisk);

    return ids.map((id) => ({
      id,
      name: nameById.get(id) ?? `Team ${id}`,
      activeTickets: activeTicketsByDept.get(id) ?? 0,
      breachedTickets: breachedTicketsByDept.get(id) ?? 0,
      overdueOps: overdueOpsByDept.get(id) ?? 0,
      inReview: inReviewByDept.get(id) ?? 0,
      atRiskProjects: atRiskProjectsByDept.get(id) ?? 0,
    }));
  }, [
    showWorkloadTable,
    scope,
    scopedTickets,
    scopedOpsTasks,
    scopedInitiatives,
    scopedProjects,
  ]);

  // Cross-section "needs attention" lists, sorted to surface the
  // worst offenders first.
  const needsAttention = useMemo(() => {
    const overdueOps = scopedOpsTasks
      .filter((t) => t.isOverdue && t.status !== "completed")
      .sort(
        (a, b) =>
          new Date(a.nextDueDate).getTime() -
          new Date(b.nextDueDate).getTime(),
      )
      .slice(0, 5);
    const atRiskProjects = scopedProjects
      .filter(projectIsAtRisk)
      .sort(
        (a, b) =>
          new Date(a.dueAt as unknown as string).getTime() -
          new Date(b.dueAt as unknown as string).getTime(),
      )
      .slice(0, 5);
    const inReview = scopedInitiatives
      .filter((i) => i.status === "under_review")
      .sort(
        (a, b) =>
          new Date(a.createdAt as string).getTime() -
          new Date(b.createdAt as string).getTime(),
      )
      .slice(0, 5);
    return { overdueOps, atRiskProjects, inReview };
  }, [scopedOpsTasks, scopedProjects, scopedInitiatives]);

  const scopeLabel = useMemo(() => {
    if (scope.isAll) return "All Teams";
    if (scope.single) {
      const dept = scope.accessible.find((d) => d.id === scope.singleId);
      return dept?.name ?? "1 team";
    }
    return `${scope.selectedIds.length} teams`;
  }, [scope]);

  return (
    <div className="space-y-6" data-testid="team-health-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Team Health
          </h1>
          <p
            className="text-sm text-muted-foreground mt-1"
            data-testid="text-dashboard-description"
          >
            High-level view of workload, risk, and delivery across support,
            operations, and projects.
          </p>
          <p
            className="text-xs text-muted-foreground mt-1"
            data-testid="text-scope-label"
          >
            {scopeLabel} · {filters.rangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <AssigneePicker
            selectedIds={filters.assigneeIds}
            onChange={filters.setAssigneeIds}
            agents={agents}
            testId="select-team-health-assignee"
          />
          <TimeRangePicker
            value={filters.range}
            onChange={filters.setRange}
            testId="select-team-health-range"
          />
          {isAdmin && <CustomizeDashboardSheet />}
        </div>
      </div>

      {isLoading ? (
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
          <DashboardSection sectionKey="executive_summary">
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard
              icon={<Layers className="h-4 w-4 text-indigo-500" />}
              label="Total Active Work"
              value={String(kpis.totalActiveWork)}
              hint="Tickets + ops + reviews + projects"
              testId="kpi-total-active-work"
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              label="Tickets Breaching SLA"
              value={String(kpis.breachedTickets)}
              hint={`of ${kpis.activeTickets} active tickets`}
              tone={kpis.breachedTickets > 0 ? "warning" : undefined}
              href="/tickets"
              testId="kpi-tickets-breaching-sla"
            />
            <KpiCard
              icon={<PauseCircle className="h-4 w-4 text-amber-500" />}
              label="Projects On Hold"
              value={String(kpis.onHoldProjects)}
              hint="Paused or blocked"
              href="/projects"
              testId="kpi-projects-on-hold"
            />
            <KpiCard
              icon={<ListChecks className="h-4 w-4 text-sky-500" />}
              label="Ops Tasks Active"
              value={String(kpis.activeOps)}
              hint={`${kpis.overdueOps} overdue`}
              tone={kpis.overdueOps > 0 ? "warning" : undefined}
              href="/operational-tasks"
              testId="kpi-ops-tasks-active"
            />
          </div>
          </DashboardSection>

          <DashboardSection sectionKey="workload">
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard
              icon={<Inbox className="h-4 w-4 text-sky-500" />}
              label="Active Tickets"
              value={String(kpis.activeTickets)}
              hint={
                kpis.breachedTickets > 0
                  ? `${kpis.breachedTickets} breaching SLA`
                  : "Within SLA"
              }
              tone={kpis.breachedTickets > 0 ? "warning" : undefined}
              href="/tickets"
              testId="kpi-active-tickets"
            />
            <KpiCard
              icon={<ListChecks className="h-4 w-4 text-amber-500" />}
              label="Overdue Ops Tasks"
              value={String(kpis.overdueOps)}
              hint={`of ${kpis.totalOps} tasks`}
              tone={kpis.overdueOps > 0 ? "warning" : undefined}
              href="/operational-tasks"
              testId="kpi-overdue-ops"
            />
            <KpiCard
              icon={<Lightbulb className="h-4 w-4 text-violet-500" />}
              label="Initiatives In Review"
              value={String(kpis.inReviewInitiatives)}
              hint={`of ${kpis.totalInitiatives} initiatives`}
              href="/initiatives"
              testId="kpi-in-review-initiatives"
            />
            <KpiCard
              icon={<KanbanSquare className="h-4 w-4 text-emerald-500" />}
              label="Active Projects"
              value={String(kpis.activeProjects)}
              hint={
                kpis.atRiskProjects > 0
                  ? `${kpis.atRiskProjects} past due`
                  : "All on track"
              }
              tone={kpis.atRiskProjects > 0 ? "warning" : undefined}
              href="/projects"
              testId="kpi-active-projects"
            />
          </div>
          </DashboardSection>

          <DashboardSection sectionKey="risk">
          <div className="grid gap-4 md:grid-cols-3">
            <Card data-testid="card-sla-health">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  SLA Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums">
                  {kpis.slaCompliance == null
                    ? "—"
                    : `${kpis.slaCompliance}%`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis.slaCompliance == null
                    ? "No active tickets"
                    : `${kpis.activeTickets - kpis.breachedTickets} of ${kpis.activeTickets} active tickets within SLA`}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-throughput">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-sky-500" />
                  Throughput
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Row
                  label="Tickets in window"
                  value={String(scopedTickets.length)}
                />
                <Row
                  label="Ops tasks completed"
                  value={String(
                    scopedOpsTasks.filter((t) => t.status === "completed")
                      .length,
                  )}
                />
                <Row
                  label="Initiatives decided"
                  value={String(
                    scopedInitiatives.filter(
                      (i) =>
                        i.status === "approved" ||
                        i.status === "rejected_deferred",
                    ).length,
                  )}
                />
                <Row
                  label="Projects completed"
                  value={String(
                    scopedProjects.filter((p) => p.status === "completed")
                      .length,
                  )}
                />
              </CardContent>
            </Card>

            <Card data-testid="card-risk">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Risk Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Row
                  label="SLA-breaching tickets"
                  value={String(kpis.breachedTickets)}
                  tone={kpis.breachedTickets > 0 ? "warning" : undefined}
                />
                <Row
                  label="Overdue ops tasks"
                  value={String(kpis.overdueOps)}
                  tone={kpis.overdueOps > 0 ? "warning" : undefined}
                />
                <Row
                  label="At-risk projects"
                  value={String(kpis.atRiskProjects)}
                  tone={kpis.atRiskProjects > 0 ? "warning" : undefined}
                />
                <Row
                  label="Awaiting review"
                  value={String(kpis.inReviewInitiatives)}
                />
              </CardContent>
            </Card>
          </div>
          </DashboardSection>

          <DashboardSection sectionKey="delivery">
          {showWorkloadTable && teamRows.length > 0 && (
            <Card data-testid="card-workload-by-team">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-500" />
                  Workload by Team
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                        <th className="px-6 py-2 font-medium">Team</th>
                        <th className="px-3 py-2 font-medium text-right">
                          Active Tickets
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          Breaching
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          Overdue Ops
                        </th>
                        <th className="px-3 py-2 font-medium text-right">
                          In Review
                        </th>
                        <th className="px-3 py-2 font-medium text-right pr-6">
                          At-risk Projects
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamRows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b last:border-b-0 hover:bg-muted/30"
                          data-testid={`team-row-${row.id}`}
                        >
                          <td className="px-6 py-3 font-medium">{row.name}</td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {row.activeTickets}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-3 text-right tabular-nums",
                              row.breachedTickets > 0 && "text-amber-600",
                            )}
                          >
                            {row.breachedTickets}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-3 text-right tabular-nums",
                              row.overdueOps > 0 && "text-amber-600",
                            )}
                          >
                            {row.overdueOps}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {row.inReview}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-3 text-right tabular-nums pr-6",
                              row.atRiskProjects > 0 && "text-amber-600",
                            )}
                          >
                            {row.atRiskProjects}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card data-testid="card-needs-attention-ops">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-500" />
                  Overdue Ops Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                {needsAttention.overdueOps.length === 0 ? (
                  <EmptyState icon={<CheckCircle2 className="h-4 w-4" />}>
                    Nothing overdue
                  </EmptyState>
                ) : (
                  <ul className="space-y-2">
                    {needsAttention.overdueOps.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/operational-tasks/${t.id}`}
                          className="block rounded p-2 -mx-2 hover:bg-muted/50"
                        >
                          <div className="text-sm font-medium truncate">
                            {t.name}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{t.departmentName}</span>
                            <span>·</span>
                            <span>Due {formatShortDate(t.nextDueDate)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-needs-attention-projects">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <KanbanSquare className="h-4 w-4 text-amber-500" />
                  At-risk Projects
                </CardTitle>
              </CardHeader>
              <CardContent>
                {needsAttention.atRiskProjects.length === 0 ? (
                  <EmptyState icon={<CheckCircle2 className="h-4 w-4" />}>
                    No projects past due
                  </EmptyState>
                ) : (
                  <ul className="space-y-2">
                    {needsAttention.atRiskProjects.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/projects/${p.id}`}
                          className="block rounded p-2 -mx-2 hover:bg-muted/50"
                        >
                          <div className="text-sm font-medium truncate">
                            {p.name}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>
                              {p.departmentName ?? "Cross-functional"}
                            </span>
                            <span>·</span>
                            <span>Due {formatShortDate(p.dueAt)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-needs-attention-initiatives">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-violet-500" />
                  Initiatives In Review
                </CardTitle>
              </CardHeader>
              <CardContent>
                {needsAttention.inReview.length === 0 ? (
                  <EmptyState icon={<CheckCircle2 className="h-4 w-4" />}>
                    Nothing waiting on review
                  </EmptyState>
                ) : (
                  <ul className="space-y-2">
                    {needsAttention.inReview.map((i) => (
                      <li key={i.id}>
                        <Link
                          href={`/initiatives/${i.id}`}
                          className="block rounded p-2 -mx-2 hover:bg-muted/50"
                        >
                          <div className="text-sm font-medium truncate">
                            {i.title}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>
                              {i.departmentName ?? "Cross-functional"}
                            </span>
                            {i.category && (
                              <>
                                <span>·</span>
                                <Badge
                                  variant="secondary"
                                  className="font-normal"
                                >
                                  {i.category}
                                </Badge>
                              </>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          </DashboardSection>
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
  href,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
  href?: string;
  testId?: string;
}) {
  const inner = (
    <Card
      className={cn(
        "transition-colors",
        href && "hover:border-foreground/30 cursor-pointer",
      )}
      data-testid={testId}
    >
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
          {icon}
        </div>
        <div
          className={cn(
            "text-3xl font-semibold tabular-nums",
            tone === "warning" && "text-amber-600",
          )}
        >
          {value}
        </div>
        {hint != null && (
          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium tabular-nums",
          tone === "warning" && "text-amber-600",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
      {icon}
      <span>{children}</span>
    </div>
  );
}
