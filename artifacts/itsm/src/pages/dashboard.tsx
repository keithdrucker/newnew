import {
  useGetDashboardOverview,
  useGetDashboardTimeseries,
  useGetBreachedTickets,
  useGetSession,
  useListDepartments,
} from "@workspace/api-client-react";
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
import { useState, useMemo } from "react";
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

function fmtDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.round(seconds / 3600);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export default function Dashboard() {
  const { data: session } = useGetSession();
  const [rangeDays, setRangeDays] = useState<"30" | "180" | "365">("30");
  const [departmentId, setDepartmentId] = useState<string>("all");

  const { data: departments } = useListDepartments();

  const queryDeptId = departmentId === "all" ? undefined : Number(departmentId);
  const queryRangeDays = Number(rangeDays) as 30 | 180 | 365;

  const { data: overview, isLoading: isOverviewLoading } =
    useGetDashboardOverview({
      departmentId: queryDeptId,
      rangeDays: queryRangeDays,
    });
  const { data: timeseries } = useGetDashboardTimeseries({
    departmentId: queryDeptId,
    rangeDays: queryRangeDays,
  });
  const { data: breached } = useGetBreachedTickets({
    departmentId: queryDeptId,
    rangeDays: queryRangeDays,
  });

  const chartData = useMemo(() => {
    return (
      timeseries?.points.map((p) => ({
        date: format(new Date(p.date), "MMM d"),
        Opened: p.opened,
        Resolved: p.resolved,
      })) ?? []
    );
  }, [timeseries]);

  const lockedDept = session?.role === "agent";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Service desk performance for{" "}
            {lockedDept
              ? session?.departmentName
              : departmentId === "all"
                ? "all departments"
                : (departments?.find((d) => d.id === Number(departmentId))?.name ??
                  "selected department")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!lockedDept && (
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger
                className="w-[200px]"
                data-testid="select-department"
              >
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
              {breached && breached.length > 0 ? (
                <div className="divide-y">
                  {breached.slice(0, 6).map((t) => (
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
