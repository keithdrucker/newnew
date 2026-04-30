import { useMemo } from "react";
import { Redirect } from "wouter";
import {
  useGetSession,
  useListInitiatives,
  useListProjects,
  useListDepartments,
  type Initiative,
  type InitiativeStatus,
  type ProjectSummary,
  type ProjectStatus,
  type Department,
} from "@workspace/api-client-react";
import {
  Lightbulb,
  KanbanSquare,
  CheckCircle2,
  GitBranch,
  Loader2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const INITIATIVE_STATUS_LABEL: Record<InitiativeStatus, string> = {
  backlog: "Backlog",
  under_review: "Under review",
  approved: "Approved",
  rejected_deferred: "Rejected / Deferred",
};

const INITIATIVE_STATUS_BADGE: Record<InitiativeStatus, string> = {
  backlog: "bg-slate-500/15 text-slate-700 dark:text-slate-200",
  under_review: "bg-amber-500/15 text-amber-700 dark:text-amber-200",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
  rejected_deferred: "bg-rose-500/15 text-rose-700 dark:text-rose-200",
};

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

function toTime(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const t = new Date(date as string | Date).getTime();
  return Number.isFinite(t) ? t : null;
}

function daysAgo(date: Date | string | null | undefined): number | null {
  const t = toTime(date);
  if (t == null) return null;
  const ms = Date.now() - t;
  if (ms < 0) return null;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date | string | null | undefined): string {
  const t = toTime(date);
  if (t == null) return "—";
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function deptName(
  departments: Department[] | undefined,
  id: number | null | undefined,
  fallback: string | null | undefined,
): string {
  if (fallback) return fallback;
  if (id == null) return "Cross-team";
  const match = departments?.find((d) => d.id === id);
  return match?.name ?? "Cross-team";
}

export default function ExecutiveDashboard() {
  // All hooks must be called unconditionally on every render. The
  // admin gate happens AFTER the hook block via a render-time
  // <Redirect /> — non-admins still mount the queries for one tick
  // but immediately navigate away, so this is harmless and keeps
  // the rules-of-hooks invariant intact.
  const { data: session, isLoading: sessionLoading } = useGetSession();

  // Executive view ignores the global team scope on purpose: the
  // audience is steering committees who need cross-team visibility.
  // We pull the unfiltered server-side accessible set (admins see all
  // teams by virtue of role) and aggregate locally.
  const { data: initiatives, isLoading: initiativesLoading } =
    useListInitiatives({});
  const { data: projects, isLoading: projectsLoading } = useListProjects({});
  const { data: departments } = useListDepartments({ scope: "all" });

  const allInitiatives = useMemo<Initiative[]>(
    () => (Array.isArray(initiatives) ? initiatives : []),
    [initiatives],
  );
  const allProjects = useMemo<ProjectSummary[]>(
    () => (Array.isArray(projects) ? projects : []),
    [projects],
  );

  const loading = sessionLoading || initiativesLoading || projectsLoading;

  // ---- KPI tiles -------------------------------------------------------
  const initiativeStatusCounts = useMemo(() => {
    const counts: Record<InitiativeStatus, number> = {
      backlog: 0,
      under_review: 0,
      approved: 0,
      rejected_deferred: 0,
    };
    for (const i of allInitiatives) counts[i.status] += 1;
    return counts;
  }, [allInitiatives]);

  const projectStatusCounts = useMemo(() => {
    const counts: Record<ProjectStatus, number> = {
      active: 0,
      on_hold: 0,
      completed: 0,
      archived: 0,
    };
    for (const p of allProjects) counts[p.status] += 1;
    return counts;
  }, [allProjects]);

  const completedLast90 = useMemo(() => {
    return allProjects.filter((p) => {
      if (p.status !== "completed") return false;
      const d = daysAgo(p.completedAt);
      return d != null && d <= 90;
    }).length;
  }, [allProjects]);

  const decisionsLast30 = useMemo(() => {
    return allInitiatives.filter((i) => {
      if (!i.decidedAt) return false;
      const d = daysAgo(i.decidedAt);
      return d != null && d <= 30;
    }).length;
  }, [allInitiatives]);

  // ---- By team breakdowns ----------------------------------------------
  const initiativesByDept = useMemo(() => {
    const map = new Map<
      string,
      {
        deptId: number | null;
        name: string;
        backlog: number;
        under_review: number;
        approved: number;
        rejected_deferred: number;
        total: number;
      }
    >();
    for (const i of allInitiatives) {
      const key = i.departmentId == null ? "cross" : String(i.departmentId);
      const name = deptName(departments, i.departmentId, i.departmentName);
      const row = map.get(key) ?? {
        deptId: i.departmentId ?? null,
        name,
        backlog: 0,
        under_review: 0,
        approved: 0,
        rejected_deferred: 0,
        total: 0,
      };
      row[i.status] += 1;
      row.total += 1;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [allInitiatives, departments]);

  const projectsByDept = useMemo(() => {
    const map = new Map<
      string,
      {
        deptId: number | null;
        name: string;
        active: number;
        on_hold: number;
        completed: number;
        archived: number;
        total: number;
      }
    >();
    for (const p of allProjects) {
      const key = p.departmentId == null ? "cross" : String(p.departmentId);
      const name = deptName(departments, p.departmentId, p.departmentName);
      const row = map.get(key) ?? {
        deptId: p.departmentId ?? null,
        name,
        active: 0,
        on_hold: 0,
        completed: 0,
        archived: 0,
        total: 0,
      };
      row[p.status] += 1;
      row.total += 1;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [allProjects, departments]);

  // ---- Top categories (initiatives) ------------------------------------
  const topCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of allInitiatives) {
      const cat = (i.category ?? "").trim() || "Uncategorized";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [allInitiatives]);

  // ---- Recent decisions -------------------------------------------------
  const recentDecisions = useMemo(() => {
    return allInitiatives
      .filter((i) => i.decidedAt)
      .sort((a, b) => (toTime(b.decidedAt) ?? 0) - (toTime(a.decidedAt) ?? 0))
      .slice(0, 8);
  }, [allInitiatives]);

  // ---- At-risk projects (on hold + revisit-overdue) --------------------
  const atRiskProjects = useMemo(() => {
    const now = Date.now();
    return allProjects
      .filter((p) => {
        if (p.status === "on_hold") return true;
        const dueT = toTime(p.dueAt);
        if (
          dueT != null &&
          dueT < now &&
          p.status !== "completed" &&
          p.status !== "archived"
        ) {
          return true;
        }
        return false;
      })
      .slice(0, 8);
  }, [allProjects]);

  // Admin-only surface — render the redirect after the hook block so
  // we never violate the rules of hooks.
  if (!sessionLoading && session?.role !== "admin") {
    return <Redirect to="/" />;
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-executive-dashboard">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading executive view…
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div
      className="p-6 space-y-6 max-w-[1400px] mx-auto"
      data-testid="page-executive-dashboard"
    >
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Team Health
          </h1>
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wider"
            data-testid="badge-cross-team"
          >
            All teams
          </Badge>
        </div>
        <p
          className="text-sm text-muted-foreground"
          data-testid="text-dashboard-description"
        >
          High-level view of workload, risk, and delivery across support,
          operations, and projects.
        </p>
      </header>

      {/* KPI tiles */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        data-testid="kpi-tiles"
      >
        <KpiTile
          icon={<Lightbulb className="h-4 w-4" />}
          label="Initiatives in pipeline"
          value={
            initiativeStatusCounts.backlog +
            initiativeStatusCounts.under_review
          }
          sub={`${initiativeStatusCounts.backlog} backlog · ${initiativeStatusCounts.under_review} review`}
          testId="kpi-initiatives-pipeline"
        />
        <KpiTile
          icon={<KanbanSquare className="h-4 w-4" />}
          label="Active projects"
          value={projectStatusCounts.active}
          sub={`${projectStatusCounts.on_hold} on hold`}
          testId="kpi-projects-active"
        />
        <KpiTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Completed (90 days)"
          value={completedLast90}
          sub={`${projectStatusCounts.completed} total completed`}
          testId="kpi-projects-completed"
        />
        <KpiTile
          icon={<GitBranch className="h-4 w-4" />}
          label="Decisions (30 days)"
          value={decisionsLast30}
          sub={`${initiativeStatusCounts.approved} approved · ${initiativeStatusCounts.rejected_deferred} declined`}
          testId="kpi-decisions"
        />
      </div>

      {/* Initiatives by team */}
      <Card data-testid="card-initiatives-by-team">
        <CardHeader>
          <CardTitle className="text-base">Initiatives by team</CardTitle>
        </CardHeader>
        <CardContent>
          {initiativesByDept.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No initiatives recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Team</th>
                    <th className="py-2 pr-4 font-medium text-right">Backlog</th>
                    <th className="py-2 pr-4 font-medium text-right">Review</th>
                    <th className="py-2 pr-4 font-medium text-right">Approved</th>
                    <th className="py-2 pr-4 font-medium text-right">Declined</th>
                    <th className="py-2 pr-4 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {initiativesByDept.map((row) => (
                    <tr
                      key={row.deptId ?? "cross"}
                      className="border-b last:border-0"
                      data-testid={`row-initiatives-team-${row.deptId ?? "cross"}`}
                    >
                      <td className="py-2 pr-4 font-medium">{row.name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.backlog}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.under_review}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-emerald-600 dark:text-emerald-300">
                        {row.approved}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-rose-600 dark:text-rose-300">
                        {row.rejected_deferred}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums font-semibold">
                        {row.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projects by team */}
      <Card data-testid="card-projects-by-team">
        <CardHeader>
          <CardTitle className="text-base">Projects by team</CardTitle>
        </CardHeader>
        <CardContent>
          {projectsByDept.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Team</th>
                    <th className="py-2 pr-4 font-medium text-right">Active</th>
                    <th className="py-2 pr-4 font-medium text-right">On hold</th>
                    <th className="py-2 pr-4 font-medium text-right">Completed</th>
                    <th className="py-2 pr-4 font-medium text-right">Archived</th>
                    <th className="py-2 pr-4 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {projectsByDept.map((row) => (
                    <tr
                      key={row.deptId ?? "cross"}
                      className="border-b last:border-0"
                      data-testid={`row-projects-team-${row.deptId ?? "cross"}`}
                    >
                      <td className="py-2 pr-4 font-medium">{row.name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.active}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-amber-600 dark:text-amber-300">
                        {row.on_hold}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-emerald-600 dark:text-emerald-300">
                        {row.completed}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {row.archived}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums font-semibold">
                        {row.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top categories */}
        <Card data-testid="card-top-categories">
          <CardHeader>
            <CardTitle className="text-base">
              Top initiative categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No categorised initiatives yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {topCategories.map((row) => {
                  const max = topCategories[0].count || 1;
                  const pct = (row.count / max) * 100;
                  return (
                    <li
                      key={row.category}
                      className="space-y-1"
                      data-testid={`row-top-category`}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{row.category}</span>
                        <span className="tabular-nums font-medium">
                          {row.count}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded">
                        <div
                          className="h-1.5 bg-primary rounded"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* At-risk projects */}
        <Card data-testid="card-at-risk-projects">
          <CardHeader>
            <CardTitle className="text-base">Projects needing attention</CardTitle>
          </CardHeader>
          <CardContent>
            {atRiskProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No on-hold or overdue projects. Nice.
              </p>
            ) : (
              <ul className="space-y-2">
                {atRiskProjects.map((p) => {
                  const dueT = toTime(p.dueAt);
                  const overdue =
                    dueT != null &&
                    dueT < Date.now() &&
                    p.status !== "completed" &&
                    p.status !== "archived";
                  return (
                    <li
                      key={p.id}
                      className="flex items-start justify-between gap-3 text-sm border-b last:border-0 pb-2 last:pb-0"
                      data-testid={`row-at-risk-${p.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {deptName(departments, p.departmentId, p.departmentName)}
                          {p.dueAt
                            ? ` · due ${formatDate(p.dueAt)}`
                            : ""}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          p.status === "on_hold"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-500/30"
                            : "bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-500/30"
                        }
                      >
                        {overdue && p.status !== "on_hold"
                          ? "Overdue"
                          : PROJECT_STATUS_LABEL[p.status]}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent decisions */}
      <Card data-testid="card-recent-decisions">
        <CardHeader>
          <CardTitle className="text-base">Recent initiative decisions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDecisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No initiative decisions on record yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Initiative</th>
                    <th className="py-2 pr-4 font-medium">Team</th>
                    <th className="py-2 pr-4 font-medium">Outcome</th>
                    <th className="py-2 pr-4 font-medium">Decided</th>
                    <th className="py-2 pr-4 font-medium">By</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDecisions.map((i) => (
                    <tr
                      key={i.id}
                      className="border-b last:border-0"
                      data-testid={`row-decision-${i.id}`}
                    >
                      <td className="py-2 pr-4 font-medium max-w-[280px]">
                        <span className="truncate block">{i.title}</span>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {deptName(departments, i.departmentId, i.departmentName)}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant="outline"
                          className={INITIATIVE_STATUS_BADGE[i.status]}
                        >
                          {INITIATIVE_STATUS_LABEL[i.status]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatDate(i.decidedAt)}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {i.decidedByName ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs uppercase tracking-wider">{label}</span>
          <span>{icon}</span>
        </div>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
