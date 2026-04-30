import { useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  addWeeks,
  isSameDay,
} from "date-fns";
import {
  useGetSession,
  getListTimeEntriesQueryKey,
  useListTimeEntries,
  useListTimesheetVisibleUsers,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Users, ChevronLeft, ChevronRight } from "lucide-react";

// Monday-anchored week boundaries. We compute three windows up front
// (this week, last week, plus a single combined query covering both)
// so the page makes one API call and slices the result client-side.
function weekBounds(reference: Date) {
  const start = startOfWeek(reference, { weekStartsOn: 1 });
  const end = endOfWeek(reference, { weekStartsOn: 1 });
  return { start, end };
}

function formatDuration(mins: number): string {
  if (mins === 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

type Entry = {
  id: number;
  // `source` discriminates ticket work from operational-task work.
  // Older payloads (pre-rollup) didn't include this field, so we
  // tolerate `undefined` and treat it as "ticket" downstream.
  source?: "ticket" | "operational_task";
  ticketId?: number | null;
  ticketKey?: string | null;
  ticketTitle?: string | null;
  taskId?: number | null;
  taskName?: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  note: string;
};

function DayBlock({
  day,
  entries,
  isToday,
}: {
  day: Date;
  entries: Entry[];
  isToday: boolean;
}) {
  // Always render entries in chronological order (earliest start
  // first). The API doesn't promise an order, so we sort here so both
  // day and week views read top-to-bottom by time.
  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      ),
    [entries],
  );
  const total = sortedEntries.reduce((acc, e) => acc + e.durationMinutes, 0);
  return (
    <div
      className="bg-card rounded-lg border shadow-sm p-4 space-y-3"
      data-testid={`timesheet-day-${format(day, "yyyy-MM-dd")}`}
    >
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">{format(day, "EEEE")}</h3>
          <span className="text-xs text-muted-foreground">
            {format(day, "MMM d")}
          </span>
          {isToday && (
            <span className="text-[10px] uppercase tracking-wide bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
              Today
            </span>
          )}
        </div>
        <span className="text-sm font-medium">{formatDuration(total)}</span>
      </div>
      {sortedEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No time logged.</p>
      ) : (
        <ul className="space-y-2">
          {sortedEntries.map((e) => {
            // Operational-task entries link to the operational tasks
            // page (no per-task route exists yet); ticket entries link
            // to the ticket detail. Source label makes the origin
            // unambiguous in the merged list.
            const isOpTask = e.source === "operational_task";
            const href = isOpTask
              ? "/operational-tasks"
              : `/tickets/${e.ticketId ?? ""}`;
            const label = isOpTask
              ? e.taskName ?? "Operational task"
              : e.ticketKey ?? `#${e.ticketId ?? "?"}`;
            const subLabel = isOpTask
              ? "Operational task"
              : e.ticketTitle ?? "";
            return (
              <li
                key={`${e.source ?? "ticket"}-${e.id}`}
                className="text-sm"
                data-testid={`timesheet-entry-${e.source ?? "ticket"}-${e.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      href={href}
                      className="font-medium text-blue-700 hover:underline truncate"
                    >
                      {label}
                    </Link>
                    {isOpTask && (
                      <span className="text-[10px] uppercase tracking-wide bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded shrink-0">
                        Op task
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(e.startAt), "h:mm a")} –{" "}
                    {format(new Date(e.endAt), "h:mm a")} ·{" "}
                    {formatDuration(e.durationMinutes)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {subLabel}
                </div>
                {e.note && (
                  <div className="text-xs text-muted-foreground/80 mt-0.5 whitespace-pre-wrap">
                    {e.note}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function WeekSection({
  title,
  weekStart,
  weekEnd,
  entries,
}: {
  title: string;
  weekStart: Date;
  weekEnd: Date;
  entries: Entry[];
}) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    days.forEach((d) => map.set(format(d, "yyyy-MM-dd"), []));
    entries.forEach((e) => {
      const key = format(new Date(e.startAt), "yyyy-MM-dd");
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
    });
    return map;
  }, [days, entries]);

  const total = entries.reduce((acc, e) => acc + e.durationMinutes, 0);
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Week total</div>
          <div className="text-xl font-semibold" data-testid={`week-total-${title.toLowerCase().replace(/\s+/g, "-")}`}>
            {formatDuration(total)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          return (
            <DayBlock
              key={key}
              day={d}
              entries={byDay.get(key) ?? []}
              isToday={key === today}
            />
          );
        })}
      </div>
    </section>
  );
}

export default function Timesheet() {
  // Block end users at the route level. The nav already hides the link
  // but a direct URL must not render the page shell either, since this
  // is internal-only data.
  const { data: session, isLoading: sessionLoading } = useGetSession();

  // Selected user for the timesheet view. `null` means "the caller
  // themself"; managers / admins may switch to a teammate's id. We
  // initialize once `visibleUsers` resolves below.
  const [viewingUserId, setViewingUserId] = useState<number | null>(null);

  // View mode toggle. Week view shows a paired Mon–Sun grid (current
  // behavior). Day view drills down to a single day with prev/next
  // navigation so users can audit one shift at a time.
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [selectedDay, setSelectedDay] = useState<Date>(() =>
    startOfDay(new Date()),
  );

  // Fetched once per page load so the picker has the full list of
  // teammates the caller may audit. End users / unauthenticated
  // visitors will simply get a 401/403 here but the early redirect
  // below means we never actually render with that data.
  const { data: visibleUsers } = useListTimesheetVisibleUsers();

  if (sessionLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!session || session.role === "end_user") {
    return <Redirect to="/" />;
  }

  // The week summary tiles always reflect this week + last week, so
  // we keep that 14-day query stable regardless of view mode. This
  // bounds the main payload tightly and avoids huge ranges when the
  // user navigates the day picker far backward or forward.
  const now = new Date();
  const thisWeek = weekBounds(now);
  const lastWeek = weekBounds(addWeeks(now, -1));
  // `endOfWeek` already returns Sunday 23:59:59.999. Bump it by one
  // millisecond to get a true exclusive upper bound for the range
  // query without overshooting into the following Monday.
  const upperBound = new Date(thisWeek.end.getTime() + 1);

  // Pass `userId` only when the caller picked a teammate (server
  // defaults to "self" on omission, so we never request our own id
  // explicitly — keeps the cache key stable for the common case).
  const isViewingSelf =
    viewingUserId == null || viewingUserId === session.userId;
  const userIdParam = isViewingSelf ? {} : { userId: viewingUserId! };

  const { data, isLoading } = useListTimeEntries({
    from: lastWeek.start.toISOString(),
    to: upperBound.toISOString(),
    ...userIdParam,
  });

  // When the day picker lands OUTSIDE the 14-day window, fire a
  // second tightly-scoped query for just that day. This keeps the
  // request size bounded (one day, not "today minus N months") and
  // sits in its own cache slot so navigating between far-back days
  // doesn't constantly re-pull the wide range.
  const dayOutsideDefaultWindow =
    viewMode === "day" &&
    (selectedDay < lastWeek.start || selectedDay > thisWeek.end);
  const dayFrom = startOfDay(selectedDay);
  const dayTo = new Date(endOfDay(selectedDay).getTime() + 1);
  const dayOnlyParams = {
    from: dayFrom.toISOString(),
    to: dayTo.toISOString(),
    ...userIdParam,
  };
  const { data: dayOnlyData, isLoading: dayOnlyLoading } = useListTimeEntries(
    dayOnlyParams,
    {
      query: {
        enabled: dayOutsideDefaultWindow,
        queryKey: getListTimeEntriesQueryKey(dayOnlyParams),
      },
    },
  );

  const teammateOptions = (visibleUsers ?? []).filter((u) => !u.isSelf);
  const canSwitchUser = teammateOptions.length > 0;
  const viewingUser =
    (visibleUsers ?? []).find(
      (u) => u.id === (viewingUserId ?? session.userId),
    ) ?? null;

  const entries = (data ?? []) as Entry[];
  const thisWeekEntries = entries.filter((e) => {
    const t = new Date(e.startAt).getTime();
    return t >= thisWeek.start.getTime() && t <= thisWeek.end.getTime();
  });
  const lastWeekEntries = entries.filter((e) => {
    const t = new Date(e.startAt).getTime();
    return t >= lastWeek.start.getTime() && t <= lastWeek.end.getTime();
  });
  // For the day view, prefer the wide-window data when the day is
  // inside it; otherwise fall back to the day-specific query.
  const dayEntriesSource = dayOutsideDefaultWindow
    ? ((dayOnlyData ?? []) as Entry[])
    : entries;
  const selectedDayEntries = dayEntriesSource.filter((e) =>
    isSameDay(new Date(e.startAt), selectedDay),
  );

  const todayKey = format(now, "yyyy-MM-dd");
  const todayMinutes = thisWeekEntries
    .filter((e) => format(new Date(e.startAt), "yyyy-MM-dd") === todayKey)
    .reduce((acc, e) => acc + e.durationMinutes, 0);
  const thisWeekMinutes = thisWeekEntries.reduce(
    (acc, e) => acc + e.durationMinutes,
    0,
  );
  const lastWeekMinutes = lastWeekEntries.reduce(
    (acc, e) => acc + e.durationMinutes,
    0,
  );

  const viewingSomeoneElse = !isViewingSelf && viewingUser != null;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="page-timesheet">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">
            {viewingSomeoneElse
              ? `${viewingUser.name}'s Timesheet`
              : "Timesheet"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {viewingSomeoneElse
              ? "Viewing as a board manager. Only your team sees this."
              : "Time you've logged on tickets and operational tasks. Visible only to you and your team."}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Day | Week toggle. Lives next to the user picker so all
              the view-shaping controls cluster in one row. */}
          <div
            className="inline-flex rounded-md border bg-card p-0.5"
            data-testid="timesheet-view-toggle"
          >
            <button
              type="button"
              onClick={() => setViewMode("day")}
              className={
                "px-3 py-1 text-xs font-medium rounded transition-colors " +
                (viewMode === "day"
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:text-foreground")
              }
              data-testid="toggle-view-day"
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={
                "px-3 py-1 text-xs font-medium rounded transition-colors " +
                (viewMode === "week"
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:text-foreground")
              }
              data-testid="toggle-view-week"
            >
              Week
            </button>
          </div>
          {canSwitchUser && (
            <div
              className="flex items-center gap-2"
              data-testid="timesheet-user-picker"
            >
              <Users className="h-4 w-4 text-muted-foreground" />
              <Select
                value={String(viewingUserId ?? session.userId)}
                onValueChange={(v) => {
                  const id = Number(v);
                  setViewingUserId(id === session.userId ? null : id);
                }}
              >
                <SelectTrigger
                  className="h-8 w-[220px]"
                  data-testid="select-timesheet-user"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(visibleUsers ?? []).map((u) => (
                    <SelectItem
                      key={u.id}
                      value={String(u.id)}
                      data-testid={`option-timesheet-user-${u.id}`}
                    >
                      {u.isSelf ? `${u.name} (me)` : u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Today</div>
          <div className="text-2xl font-semibold" data-testid="stat-today">
            {formatDuration(todayMinutes)}
          </div>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">This week</div>
          <div className="text-2xl font-semibold" data-testid="stat-this-week">
            {formatDuration(thisWeekMinutes)}
          </div>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Last week</div>
          <div className="text-2xl font-semibold" data-testid="stat-last-week">
            {formatDuration(lastWeekMinutes)}
          </div>
        </div>
      </div>

      {isLoading || (viewMode === "day" && dayOnlyLoading) ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : viewMode === "day" ? (
        <section className="space-y-3" data-testid="timesheet-day-view">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {isSameDay(selectedDay, now)
                  ? "Today"
                  : isSameDay(selectedDay, addDays(now, -1))
                    ? "Yesterday"
                    : format(selectedDay, "EEEE")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {format(selectedDay, "MMMM d, yyyy")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setSelectedDay((d) => addDays(d, -1))}
                aria-label="Previous day"
                data-testid="button-prev-day"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setSelectedDay(startOfDay(new Date()))}
                disabled={isSameDay(selectedDay, now)}
                data-testid="button-today"
              >
                Today
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => setSelectedDay((d) => addDays(d, 1))}
                aria-label="Next day"
                data-testid="button-next-day"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DayBlock
            day={selectedDay}
            entries={selectedDayEntries}
            isToday={isSameDay(selectedDay, now)}
          />
        </section>
      ) : (
        <>
          <WeekSection
            title="This Week"
            weekStart={thisWeek.start}
            weekEnd={thisWeek.end}
            entries={thisWeekEntries}
          />
          <WeekSection
            title="Last Week"
            weekStart={lastWeek.start}
            weekEnd={lastWeek.end}
            entries={lastWeekEntries}
          />
        </>
      )}
    </div>
  );
}
