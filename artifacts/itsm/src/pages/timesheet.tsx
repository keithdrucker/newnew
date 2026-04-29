import { useMemo, useState } from "react";
import { Link, Redirect } from "wouter";
import { format, startOfWeek, endOfWeek, addDays, addWeeks } from "date-fns";
import {
  useGetSession,
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
import { Users } from "lucide-react";

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
  ticketId: number;
  ticketKey: string;
  ticketTitle: string;
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
  const total = entries.reduce((acc, e) => acc + e.durationMinutes, 0);
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
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No time logged.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/tickets/${e.ticketId}`}
                  className="font-medium text-blue-700 hover:underline truncate"
                >
                  {e.ticketKey}
                </Link>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(e.startAt), "h:mm a")} –{" "}
                  {format(new Date(e.endAt), "h:mm a")} ·{" "}
                  {formatDuration(e.durationMinutes)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {e.ticketTitle}
              </div>
              {e.note && (
                <div className="text-xs text-muted-foreground/80 mt-0.5 whitespace-pre-wrap">
                  {e.note}
                </div>
              )}
            </li>
          ))}
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

  // We pull a 14-day window in one shot and slice on the client to
  // avoid two parallel hits on the same endpoint.
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
  const { data, isLoading } = useListTimeEntries({
    from: lastWeek.start.toISOString(),
    to: upperBound.toISOString(),
    ...(isViewingSelf ? {} : { userId: viewingUserId! }),
  });

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
              : "Time you've logged on tickets. Visible only to you and your team."}
          </p>
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
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
