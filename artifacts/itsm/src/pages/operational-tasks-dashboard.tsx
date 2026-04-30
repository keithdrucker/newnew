import { useMemo } from "react";
import { Link } from "wouter";
import {
  useListOperationalTasks,
  getListOperationalTasksQueryKey,
  type OperationalTask,
  type OperationalTaskStatus,
  type OperationalTaskFrequency,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ListChecks,
  CalendarClock,
  Activity,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Repeat,
} from "lucide-react";
import { useTeamScope, filterByTeamScope } from "@/lib/team-scope";
import {
  useDashboardFilters,
  TimeRangePicker,
  AssigneePicker,
  useAgentOptions,
  isInRange,
} from "@/lib/dashboard-filters";

const STATUS_LABEL: Record<OperationalTaskStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  closed: "Closed",
};

const STATUS_BADGE_CLASS: Record<OperationalTaskStatus, string> = {
  scheduled: "bg-slate-100 text-slate-700",
  in_progress: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-600",
};

const FREQUENCY_LABEL: Record<OperationalTaskFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  bi_weekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  bi_annual: "Bi-annual",
  annual: "Annual",
  multi_year: "Multi-year",
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Day-based "due in next N days (inclusive of today)" check. The
// `nextDueDate` field is a calendar date (YYYY-MM-DD), so we have to
// compare on the local day rather than millisecond timestamps —
// otherwise a task due today can fall out of "this week" the moment
// the clock crosses local midnight, and timezones can skew the
// boundary by a whole day.
function isDueWithinDays(yyyyMmDd: string, days: number): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!m) return false;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + days);
  return due.getTime() >= today.getTime() && due.getTime() <= limit.getTime();
}

export default function OperationalTasksDashboard() {
  const scope = useTeamScope();

  // Single-team narrows server-side via departmentId; "All Teams" /
  // multi-team fetch the user's full accessible set then we narrow
  // client-side via filterByTeamScope.
  const queryDeptId = scope.single ? scope.singleId ?? undefined : undefined;
  const filters = useDashboardFilters();
  const params =
    queryDeptId != null ? { departmentId: queryDeptId } : {};
  const {
    data: tasks,
    isLoading,
    isError,
    error,
  } = useListOperationalTasks(params, {
    query: {
      queryKey: getListOperationalTasksQueryKey(params),
      retry: (failureCount, err) => {
        const status = (err as { status?: number } | null)?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  });

  // Agent picker only meaningful on a single team; reset when scope flips.
  const agents = useAgentOptions(queryDeptId);

  const errStatus = (error as { status?: number } | null)?.status;
  const forbidden = isError && errStatus === 403;

  // Apply scope → time range → assignee in that order. The assignee
  // filter is honored at every scope (single/multi/all): when the user
  // picks an agent on "All Teams" we just keep tasks owned by that
  // person across the full accessible set.
  const filtered = useMemo<OperationalTask[]>(() => {
    let list: OperationalTask[] = tasks ?? [];
    if (!scope.single && !scope.isAll) {
      list = filterByTeamScope(list, scope);
    }
    list = list.filter((t) => isInRange(t.updatedAt, filters.bounds));
    const assigneeSet = filters.assigneeFilter;
    if (assigneeSet) {
      list = list.filter((t) => t.ownerId != null && assigneeSet.has(t.ownerId));
    }
    return list;
  }, [tasks, scope, filters.bounds, filters.assigneeFilter]);

  const stats = useMemo(() => {
    const counts: Record<OperationalTaskStatus, number> = {
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      closed: 0,
    };
    let overdue = 0;
    let dueThisWeek = 0;
    const byDept = new Map<string, number>();
    const byFreq = new Map<string, number>();

    for (const t of filtered) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
      if (t.isOverdue && t.status !== "completed") overdue += 1;
      if (
        t.status !== "completed" &&
        !t.isOverdue &&
        isDueWithinDays(t.nextDueDate, 7)
      ) {
        dueThisWeek += 1;
      }
      const deptKey = t.departmentName ?? "—";
      byDept.set(deptKey, (byDept.get(deptKey) ?? 0) + 1);
      if (t.frequency) {
        const label = FREQUENCY_LABEL[t.frequency] ?? t.frequency;
        byFreq.set(label, (byFreq.get(label) ?? 0) + 1);
      } else {
        byFreq.set("One-time", (byFreq.get("One-time") ?? 0) + 1);
      }
    }

    const departmentBreakdown = [...byDept.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const frequencyBreakdown = [...byFreq.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // "Needs attention" = overdue first, then due-soonest open tasks.
    const openTasks = filtered.filter((t) => t.status !== "completed");
    const needsAttention = [...openTasks]
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return (
          new Date(a.nextDueDate).getTime() -
          new Date(b.nextDueDate).getTime()
        );
      })
      .slice(0, 6);

    return {
      total: filtered.length,
      counts,
      overdue,
      dueThisWeek,
      departmentBreakdown,
      frequencyBreakdown,
      needsAttention,
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
    <div className="space-y-6" data-testid="operational-tasks-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Operational Tasks Dashboard
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
            selectedIds={filters.assigneeIds}
            onChange={filters.setAssigneeIds}
            agents={agents}
            testId="select-ops-tasks-dashboard-assignee"
          />
          <TimeRangePicker
            value={filters.range}
            onChange={filters.setRange}
            testId="select-ops-tasks-dashboard-range"
          />
        </div>
      </div>

      {forbidden ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="font-medium">
              You don't have access to operational tasks
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Ask an admin to grant you access to this department.
            </p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="font-medium">Couldn't load operational tasks</p>
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
              icon={<ListChecks className="h-4 w-4 text-indigo-500" />}
              label="Total Tasks"
              value={String(stats.total)}
              hint={`${stats.counts.completed} completed`}
            />
            <KpiCard
              icon={<Activity className="h-4 w-4 text-sky-500" />}
              label="In Progress"
              value={String(stats.counts.in_progress)}
              hint={`${stats.counts.scheduled} scheduled`}
            />
            <KpiCard
              icon={<CalendarClock className="h-4 w-4 text-emerald-500" />}
              label="Due This Week"
              value={String(stats.dueThisWeek)}
              hint="Open tasks, next 7 days"
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              label="Overdue"
              value={String(stats.overdue)}
              hint={`of ${stats.total} tasks`}
              tone={stats.overdue > 0 ? "warning" : undefined}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatusCard
              icon={<CalendarClock className="h-4 w-4 text-slate-500" />}
              label="Scheduled"
              value={stats.counts.scheduled}
            />
            <StatusCard
              icon={<Activity className="h-4 w-4 text-sky-500" />}
              label="In progress"
              value={stats.counts.in_progress}
            />
            <StatusCard
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Completed"
              value={stats.counts.completed}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Repeat className="h-4 w-4" />
                  By cadence
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.frequencyBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tasks in this window.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stats.frequencyBreakdown.map((f) => {
                      const max =
                        stats.frequencyBreakdown[0].count || 1;
                      const pct = Math.round((f.count / max) * 100);
                      return (
                        <div key={f.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate">{f.name}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {f.count}
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
                <CardTitle className="text-sm font-medium">
                  Tasks by team
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.departmentBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tasks in this window.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {stats.departmentBreakdown.map((d) => {
                      const max =
                        stats.departmentBreakdown[0].count || 1;
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
                              className="h-full rounded-full bg-emerald-500 transition-all"
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
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Needs attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.needsAttention.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing overdue or due soon. Nice.
                </p>
              ) : (
                <div className="divide-y">
                  {stats.needsAttention.map((t) => (
                    <Link
                      key={t.id}
                      href="/operational-tasks"
                      data-testid={`needs-attention-task-${t.id}`}
                      className="flex items-center justify-between py-2.5 text-sm hover:bg-muted/40 -mx-2 px-2 rounded"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.departmentName}
                          {t.ownerName ? ` · ${t.ownerName}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <Badge
                          variant="secondary"
                          className={
                            t.isOverdue
                              ? "bg-amber-100 text-amber-700"
                              : STATUS_BADGE_CLASS[t.status]
                          }
                        >
                          {t.isOverdue ? "Overdue" : STATUS_LABEL[t.status]}
                        </Badge>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(t.nextDueDate)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
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
