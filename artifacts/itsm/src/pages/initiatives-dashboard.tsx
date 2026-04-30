import { useMemo } from "react";
import { Link } from "wouter";
import {
  useListInitiatives,
  getListInitiativesQueryKey,
  type Initiative,
  type InitiativeStatus,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  Inbox,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CalendarDays,
  Clock,
  Timer,
  GitBranch,
  BarChart3,
} from "lucide-react";
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
import { useTeamScope, filterByTeamScope } from "@/lib/team-scope";
import {
  useDashboardFilters,
  TimeRangePicker,
  AssigneePicker,
  useAgentOptions,
  isInRange,
} from "@/lib/dashboard-filters";

const STATUS_LABEL: Record<InitiativeStatus, string> = {
  backlog: "Backlog",
  under_review: "Under review",
  approved: "Approved",
  rejected_deferred: "Rejected / Deferred",
};

const STATUS_BADGE_CLASS: Record<InitiativeStatus, string> = {
  backlog: "bg-slate-100 text-slate-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected_deferred: "bg-rose-100 text-rose-700",
};

function formatDate(iso: string | Date | null | undefined) {
  if (!iso) return null;
  return new Date(iso as string).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function InitiativesDashboard() {
  const scope = useTeamScope();
  const queryDeptId = scope.single ? scope.singleId ?? undefined : undefined;
  const filters = useDashboardFilters();

  const params = queryDeptId != null ? { departmentId: queryDeptId } : {};
  const {
    data: initiatives,
    isLoading,
    isError,
    error,
  } = useListInitiatives(params, {
    query: {
      queryKey: getListInitiativesQueryKey(params),
      retry: (failureCount, err) => {
        const status = (err as { status?: number } | null)?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  });

  const agents = useAgentOptions(queryDeptId);

  const errStatus = (error as { status?: number } | null)?.status;
  const forbidden = isError && errStatus === 403;

  // Apply scope → time range → assignee. We filter on `updatedAt` so a
  // long-lived initiative that was decided this week still appears in
  // a "Last 30 days" view. The assignee filter applies at every scope
  // (single/multi/all).
  const filtered = useMemo<Initiative[]>(() => {
    let list: Initiative[] = initiatives ?? [];
    if (!scope.single && !scope.isAll) {
      list = filterByTeamScope(list, scope);
    }
    list = list.filter((i) => isInRange(i.updatedAt, filters.bounds));
    const assigneeSet = filters.assigneeFilter;
    if (assigneeSet) {
      list = list.filter(
        (i) => i.assigneeId != null && assigneeSet.has(i.assigneeId),
      );
    }
    return list;
  }, [initiatives, scope, filters.bounds, filters.assigneeFilter]);

  const stats = useMemo(() => {
    const counts: Record<InitiativeStatus, number> = {
      backlog: 0,
      under_review: 0,
      approved: 0,
      rejected_deferred: 0,
    };
    const byDept = new Map<string, number>();
    const byCategory = new Map<string, number>();
    // Avg time-to-approve = decidedAt - createdAt for approved
    // initiatives only. Rejected/deferred are excluded so we don't
    // skew the metric with quick "no" calls.
    let totalApproveMs = 0;
    let approveSamples = 0;
    let convertedFromApproved = 0;
    for (const i of filtered) {
      counts[i.status] = (counts[i.status] ?? 0) + 1;
      const deptKey = i.departmentName ?? "Cross-functional";
      byDept.set(deptKey, (byDept.get(deptKey) ?? 0) + 1);
      const cat = i.category?.trim() || "Uncategorized";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
      if (i.status === "approved" && i.decidedAt) {
        const span =
          new Date(i.decidedAt as string).getTime() -
          new Date(i.createdAt as string).getTime();
        if (Number.isFinite(span) && span >= 0) {
          totalApproveMs += span;
          approveSamples += 1;
        }
        if (i.createdProjectId != null) convertedFromApproved += 1;
      }
    }
    const departmentBreakdown = [...byDept.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const categoryBreakdown = [...byCategory.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const needsReview = filtered
      .filter((i) => i.status === "under_review")
      .sort(
        (a, b) =>
          new Date(a.createdAt as string).getTime() -
          new Date(b.createdAt as string).getTime(),
      )
      .slice(0, 6);

    const recentlyDecided = filtered
      .filter(
        (i) =>
          (i.status === "approved" || i.status === "rejected_deferred") &&
          i.decidedAt,
      )
      .sort(
        (a, b) =>
          new Date(b.decidedAt as string).getTime() -
          new Date(a.decidedAt as string).getTime(),
      )
      .slice(0, 6);

    const avgApproveDays =
      approveSamples === 0
        ? null
        : totalApproveMs / approveSamples / (1000 * 60 * 60 * 24);
    // Conversion rate = % of approved initiatives that have a
    // linked project. Null when there are no approvals to divide
    // by, which the UI displays as "—" rather than "0%" so we don't
    // imply zero conversion when there's simply no data.
    const conversionRate =
      counts.approved === 0
        ? null
        : Math.round((convertedFromApproved / counts.approved) * 100);
    const statusChartData = [
      { name: "Backlog", value: counts.backlog, fill: "#94a3b8" },
      {
        name: "Under review",
        value: counts.under_review,
        fill: "#f59e0b",
      },
      { name: "Approved", value: counts.approved, fill: "#10b981" },
      {
        name: "Rejected",
        value: counts.rejected_deferred,
        fill: "#f43f5e",
      },
    ];

    return {
      total: filtered.length,
      counts,
      avgApproveDays,
      conversionRate,
      convertedFromApproved,
      statusChartData,
      departmentBreakdown,
      categoryBreakdown,
      needsReview,
      recentlyDecided,
    };
  }, [filtered]);

  function fmtAvgDays(days: number | null): string {
    if (days == null) return "—";
    if (days < 1) {
      const hrs = Math.round(days * 24);
      return `${hrs}h`;
    }
    if (days < 10) return `${days.toFixed(1)}d`;
    return `${Math.round(days)}d`;
  }

  const scopeLabel = useMemo(() => {
    if (scope.isAll) return "All Teams";
    if (scope.single) {
      const dept = scope.accessible.find((d) => d.id === scope.singleId);
      return dept?.name ?? "1 team";
    }
    return `${scope.selectedIds.length} teams`;
  }, [scope]);

  return (
    <div className="space-y-6" data-testid="initiatives-dashboard">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Initiative Pipeline
          </h1>
          <p
            className="text-sm text-muted-foreground mt-1"
            data-testid="text-dashboard-description"
          >
            Review, prioritize, and approve proposed initiatives before
            execution.
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
            testId="select-initiatives-dashboard-assignee"
          />
          <TimeRangePicker
            value={filters.range}
            onChange={filters.setRange}
            testId="select-initiatives-dashboard-range"
          />
        </div>
      </div>

      {forbidden ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="font-medium">You don't have access to initiatives</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ask an admin to grant you access to this department.
            </p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="font-medium">Couldn't load initiatives</p>
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
              icon={<Lightbulb className="h-4 w-4 text-indigo-500" />}
              label="Total Initiatives"
              value={String(stats.total)}
              hint={`${stats.counts.under_review} awaiting review`}
            />
            <KpiCard
              icon={<Inbox className="h-4 w-4 text-slate-500" />}
              label="Backlog"
              value={String(stats.counts.backlog)}
              hint="Captured, not yet triaged"
            />
            <KpiCard
              icon={<ClipboardCheck className="h-4 w-4 text-amber-500" />}
              label="Under Review"
              value={String(stats.counts.under_review)}
              hint="Being evaluated now"
              tone={stats.counts.under_review > 0 ? "warning" : undefined}
            />
            <KpiCard
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              label="Approved"
              value={String(stats.counts.approved)}
              hint={`${stats.counts.rejected_deferred} rejected/deferred`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              icon={<XCircle className="h-4 w-4 text-rose-500" />}
              label="Rejected / Deferred"
              value={String(stats.counts.rejected_deferred)}
              hint="Closed without action"
            />
            <KpiCard
              icon={<Timer className="h-4 w-4 text-violet-500" />}
              label="Avg Time to Approve"
              value={fmtAvgDays(stats.avgApproveDays)}
              hint={`From ${stats.counts.approved} approval${stats.counts.approved === 1 ? "" : "s"}`}
            />
            <KpiCard
              icon={<GitBranch className="h-4 w-4 text-emerald-500" />}
              label="Conversion Rate"
              value={
                stats.conversionRate == null
                  ? "—"
                  : `${stats.conversionRate}%`
              }
              hint={`${stats.convertedFromApproved} of ${stats.counts.approved} approved became projects`}
            />
          </div>

          <Card data-testid="card-status-distribution">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-500" />
                Status distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              {stats.total === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No initiatives in this window.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.statusChartData}
                    margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
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
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {stats.statusChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Initiatives by team
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.departmentBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No initiatives in this window.
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
                  Top categories
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.categoryBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No categories assigned yet.
                  </p>
                ) : (
                  stats.categoryBreakdown.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="truncate">{c.name}</span>
                      <Badge variant="secondary">{c.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-amber-500" />
                  Needs review
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.needsReview.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Inbox zero on the review queue. Nice.
                  </p>
                ) : (
                  <div className="divide-y">
                    {stats.needsReview.map((i) => (
                      <Link
                        key={i.id}
                        href="/initiatives"
                        data-testid={`needs-review-initiative-${i.id}`}
                        className="flex items-center justify-between py-2.5 text-sm hover:bg-muted/40 -mx-2 px-2 rounded"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="truncate font-medium">{i.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {i.departmentName ?? "Cross-functional"}
                            {i.category ? ` · ${i.category}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                          <Badge
                            variant="secondary"
                            className={STATUS_BADGE_CLASS[i.status]}
                          >
                            {STATUS_LABEL[i.status]}
                          </Badge>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(i.createdAt)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  Recently decided
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.recentlyDecided.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No decisions in this window.
                  </p>
                ) : (
                  <div className="divide-y">
                    {stats.recentlyDecided.map((i) => (
                      <Link
                        key={i.id}
                        href="/initiatives"
                        data-testid={`recently-decided-initiative-${i.id}`}
                        className="flex items-center justify-between py-2.5 text-sm hover:bg-muted/40 -mx-2 px-2 rounded"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="truncate font-medium">{i.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {i.decidedByName
                              ? `Decided by ${i.decidedByName}`
                              : "Decision recorded"}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                          <Badge
                            variant="secondary"
                            className={STATUS_BADGE_CLASS[i.status]}
                          >
                            {i.status === "approved" ? (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            ) : (
                              <XCircle className="h-3 w-3 mr-1" />
                            )}
                            {STATUS_LABEL[i.status]}
                          </Badge>
                          <span>{formatDate(i.decidedAt)}</span>
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
