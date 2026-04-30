import { useMemo } from "react";
import { Link } from "wouter";
import {
  useListProjects,
  getListProjectsQueryKey,
  type ProjectSummary,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  KanbanSquare,
  ListChecks,
  Activity,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  Archive,
  CalendarDays,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTeamScope, filterByTeamScope } from "@/lib/team-scope";
import {
  useDashboardFilters,
  TimeRangePicker,
  AssigneePicker,
  useAgentOptions,
  isInRange,
} from "@/lib/dashboard-filters";

const STATUS_LABEL: Record<ProjectSummary["status"], string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

function isOverdue(p: ProjectSummary) {
  if (!p.dueAt) return false;
  if (p.status === "completed" || p.status === "archived") return false;
  return new Date(p.dueAt as unknown as string).getTime() < Date.now();
}

function formatDue(iso: string | Date | null | undefined) {
  if (!iso) return null;
  return new Date(iso as string).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectsDashboard() {
  const scope = useTeamScope();
  const queryDeptId = scope.single ? scope.singleId ?? undefined : undefined;
  const filters = useDashboardFilters(queryDeptId);

  const projectsParams = { departmentId: queryDeptId };
  const { data: projects, isLoading, isError, error } = useListProjects(
    projectsParams,
    {
      query: {
        queryKey: getListProjectsQueryKey(projectsParams),
        retry: (failureCount, err) => {
          const status = (err as { status?: number } | null)?.status ?? 0;
          if (status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  );

  const agents = useAgentOptions(queryDeptId);

  const errStatus = (error as { status?: number } | null)?.status;
  const forbidden = isError && errStatus === 403;

  // Apply scope → time range → assignee. Filter on `updatedAt` so a
  // long-running project that had recent activity still appears in
  // short windows. The assignee filter applies at every scope
  // (single/multi/all).
  const filtered = useMemo<ProjectSummary[]>(() => {
    let list: ProjectSummary[] = projects ?? [];
    if (!scope.single && !scope.isAll) {
      list = filterByTeamScope(list, scope);
    }
    list = list.filter((p) => isInRange(p.updatedAt, filters.bounds));
    if (filters.assigneeFilter != null) {
      list = list.filter((p) => p.ownerId === filters.assigneeFilter);
    }
    return list;
  }, [projects, scope, filters.bounds, filters.assigneeFilter]);

  const stats = useMemo(() => {
    const counts = { active: 0, on_hold: 0, completed: 0, archived: 0 };
    let totalTasks = 0;
    let doneTasks = 0;
    let overdue = 0;
    const byDept = new Map<string, number>();
    const byOwner = new Map<string, number>();

    for (const p of filtered) {
      counts[p.status] += 1;
      totalTasks += p.checklistTotal;
      doneTasks += p.checklistDone;
      if (isOverdue(p)) overdue += 1;
      const deptKey = p.departmentName ?? "Cross-functional";
      byDept.set(deptKey, (byDept.get(deptKey) ?? 0) + 1);
      if (p.ownerName) {
        byOwner.set(p.ownerName, (byOwner.get(p.ownerName) ?? 0) + 1);
      }
    }

    const overallPct =
      totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

    const topProgress = [...filtered]
      .filter((p) => p.checklistTotal > 0)
      .map((p) => ({
        name: p.name,
        color: p.color,
        pct: Math.round((p.checklistDone / p.checklistTotal) * 100),
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);

    const departmentBreakdown = [...byDept.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const topOwners = [...byOwner.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const overdueList = filtered
      .filter(isOverdue)
      .sort(
        (a, b) =>
          new Date(a.dueAt as unknown as string).getTime() -
          new Date(b.dueAt as unknown as string).getTime(),
      )
      .slice(0, 6);

    return {
      total: filtered.length,
      counts,
      totalTasks,
      doneTasks,
      overallPct,
      overdue,
      topProgress,
      departmentBreakdown,
      topOwners,
      overdueList,
    };
  }, [filtered]);

  const scopeLabel = useMemo(() => {
    if (scope.isAll) return "All Teams";
    if (scope.single) {
      const dept = scope.accessible.find((d) => d.id === scope.singleId);
      return dept?.name ?? "1 team";
    }
    return `${scope.selectedIds.length} teams`;
  }, [scope]);

  return (
    <div className="space-y-6" data-testid="projects-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Projects Dashboard
          </h1>
          <p
            className="text-sm text-muted-foreground mt-1"
            data-testid="text-scope-label"
          >
            {scopeLabel} · {filters.rangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <AssigneePicker
            value={filters.assigneeId}
            onChange={filters.setAssigneeId}
            agents={agents}
            testId="select-projects-dashboard-assignee"
          />
          <TimeRangePicker
            value={filters.range}
            onChange={filters.setRange}
            testId="select-projects-dashboard-range"
          />
        </div>
      </div>

      {forbidden ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="font-medium">You don't have access to projects</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ask an admin or your team's agent to share a project with you.
            </p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="font-medium">Couldn't load projects</p>
            <p className="text-sm text-muted-foreground mt-1">
              Something went wrong. Try refreshing the page.
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
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
              icon={<KanbanSquare className="h-4 w-4 text-indigo-500" />}
              label="Total Projects"
              value={String(stats.total)}
              hint={`${stats.counts.active} active`}
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
              label="Overall Progress"
              value={`${stats.overallPct}%`}
              hint={`${stats.doneTasks} of ${stats.totalTasks} tasks`}
            />
            <KpiCard
              icon={<ListChecks className="h-4 w-4 text-violet-500" />}
              label="Open Tasks"
              value={String(stats.totalTasks - stats.doneTasks)}
              hint={`${stats.totalTasks} total tasks`}
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              label="Overdue"
              value={String(stats.overdue)}
              hint={`of ${stats.total} projects`}
              tone={stats.overdue > 0 ? "warning" : undefined}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <StatusCard
              icon={<Activity className="h-4 w-4 text-emerald-500" />}
              label="Active"
              value={stats.counts.active}
            />
            <StatusCard
              icon={<PauseCircle className="h-4 w-4 text-amber-500" />}
              label="On hold"
              value={stats.counts.on_hold}
            />
            <StatusCard
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Completed"
              value={stats.counts.completed}
            />
            <StatusCard
              icon={<Archive className="h-4 w-4 text-muted-foreground" />}
              label="Archived"
              value={stats.counts.archived}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Project progress (top 8)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {stats.topProgress.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tasks to chart in this window.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.topProgress}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e2e8f0"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        unit="%"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        width={130}
                      />
                      <Tooltip formatter={(v: number) => `${v}%`} />
                      <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                        {stats.topProgress.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Top owners
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.topOwners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No owners assigned yet.
                  </p>
                ) : (
                  stats.topOwners.map((o) => (
                    <div
                      key={o.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="truncate">{o.name}</span>
                      <Badge variant="secondary">{o.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Projects by team
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.departmentBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No projects in this window.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stats.departmentBreakdown.map((d) => {
                      const max = stats.departmentBreakdown[0].count || 1;
                      const pct = Math.round((d.count / max) * 100);
                      return (
                        <div key={d.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate">{d.name}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {d.count}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Overdue projects
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.overdueList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No overdue projects. Nice.
                  </p>
                ) : (
                  <div className="divide-y">
                    {stats.overdueList.map((p) => (
                      <Link
                        key={p.id}
                        href="/projects"
                        data-testid={`overdue-project-${p.id}`}
                        className="flex items-center justify-between py-2.5 text-sm hover:bg-muted/40 -mx-2 px-2 rounded"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                            )}
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="truncate font-medium">
                            {p.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                          <Badge
                            variant="secondary"
                            className="bg-amber-100 text-amber-700"
                          >
                            {STATUS_LABEL[p.status]}
                          </Badge>
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDue(p.dueAt)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
