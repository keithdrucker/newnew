import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTicketTimeEntries,
  useCreateTicketTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  getListTicketTimeEntriesQueryKey,
  getListTimeEntriesQueryKey,
} from "@workspace/api-client-react";
import type { TimeEntry } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Pencil, Trash2, Check, X } from "lucide-react";

// Snap a Date to the nearest 15-minute boundary so the input control
// always emits a "round" value the server will accept verbatim. This
// matches the same `round15` helper on the backend.
function round15(d: Date): Date {
  const fifteen = 15 * 60 * 1000;
  return new Date(Math.round(d.getTime() / fifteen) * fifteen);
}

// HTML <input type="datetime-local"> wants `YYYY-MM-DDTHH:mm` in LOCAL
// time. Date.toISOString() is UTC, which would shift the displayed time
// in any non-UTC timezone — so we format the date parts directly.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function TicketTimeEntries({
  ticketId,
  currentUserId,
  isAdmin,
  embedded = false,
}: {
  ticketId: number;
  currentUserId: number;
  isAdmin: boolean;
  // When true, drops the outer card chrome so the component slots
  // cleanly inside another container (e.g. the Technical Notes column).
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const { data: entries, isLoading } = useListTicketTimeEntries(ticketId);
  const create = useCreateTicketTimeEntry();
  const update = useUpdateTimeEntry();
  const remove = useDeleteTimeEntry();
  // Track which entry (if any) is currently in inline-edit mode. Only
  // one edit row at a time keeps the UI predictable.
  const [editingId, setEditingId] = useState<number | null>(null);

  async function refreshEntryQueries() {
    await Promise.all([
      qc.invalidateQueries({
        queryKey: getListTicketTimeEntriesQueryKey(ticketId),
      }),
      qc.invalidateQueries({ queryKey: getListTimeEntriesQueryKey() }),
    ]);
  }

  // Default the form to "right now, rounded to the previous 15 mins"
  // for start, and start + 15 minutes for end. This is what users
  // actually want when they click "log time" right after finishing
  // a task.
  const initial = useMemo(() => {
    const now = round15(new Date());
    const end = new Date(now.getTime() + 15 * 60 * 1000);
    return { start: toLocalInput(now), end: toLocalInput(end) };
  }, []);

  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totalMinutes = (entries ?? []).reduce(
    (acc, e) => acc + e.durationMinutes,
    0,
  );

  async function handleSubmit() {
    setError(null);
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Enter valid start and end times.");
      return;
    }
    if (endDate <= startDate) {
      setError("End time must be after start time.");
      return;
    }
    if (!note.trim()) {
      setError("Add a note describing what you worked on.");
      return;
    }
    try {
      await create.mutateAsync({
        id: ticketId,
        data: {
          startAt: startDate.toISOString(),
          endAt: endDate.toISOString(),
          note: note.trim(),
        },
      });
      // Refresh both this ticket's list and the timesheet page query.
      await refreshEntryQueries();
      setNote("");
    } catch (e) {
      setError((e as Error).message ?? "Failed to log time.");
    }
  }

  async function handleDelete(id: number) {
    await remove.mutateAsync({ id });
    await refreshEntryQueries();
  }

  const wrapperClass = embedded
    ? "space-y-3"
    : "bg-card rounded-lg border shadow-sm p-5 space-y-4";

  return (
    <div className={wrapperClass} data-testid="time-entries-section">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!embedded && (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <h3 className="font-medium text-sm">Time Entries</h3>
          {!embedded && (
            <span className="text-xs text-muted-foreground">
              Internal — not visible to the requester
            </span>
          )}
        </div>
        {(entries?.length ?? 0) > 0 && (
          <span className="text-xs text-muted-foreground">
            Total:{" "}
            <span className="font-medium text-foreground">
              {formatDuration(totalMinutes)}
            </span>
          </span>
        )}
      </div>

      {/* Compact log-time form */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Start
          </label>
          <Input
            type="datetime-local"
            step={900 /* 15 minutes */}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            data-testid="input-time-entry-start"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            End
          </label>
          <Input
            type="datetime-local"
            step={900}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            data-testid="input-time-entry-end"
          />
        </div>
      </div>
      <Textarea
        placeholder="What did you work on? (private to your team)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-[64px]"
        data-testid="input-time-entry-note"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={create.isPending}
          data-testid="button-log-time"
        >
          {create.isPending ? "Logging…" : "Log time"}
        </Button>
      </div>

      {/* Existing entries */}
      <div className="space-y-2 pt-2 border-t">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading entries…</p>
        )}
        {!isLoading && (entries?.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground">
            No time logged on this ticket yet.
          </p>
        )}
        {entries?.map((e) => {
          const canMutate = isAdmin || e.userId === currentUserId;
          if (editingId === e.id && canMutate) {
            return (
              <EditTimeEntryRow
                key={e.id}
                entry={e}
                isSaving={update.isPending}
                onCancel={() => setEditingId(null)}
                onSave={async (patch) => {
                  await update.mutateAsync({ id: e.id, data: patch });
                  await refreshEntryQueries();
                  setEditingId(null);
                }}
              />
            );
          }
          return (
            <div
              key={e.id}
              className="flex items-start justify-between gap-3 text-sm"
              data-testid={`time-entry-${e.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{e.userName}</span>
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(e.startAt), "MMM d, h:mm a")} –{" "}
                    {format(new Date(e.endAt), "h:mm a")}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                    {formatDuration(e.durationMinutes)}
                  </span>
                </div>
                {e.note && (
                  <p className="text-muted-foreground text-xs mt-0.5 whitespace-pre-wrap">
                    {e.note}
                  </p>
                )}
              </div>
              {canMutate && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingId(e.id)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Edit entry"
                    data-testid={`button-edit-time-entry-${e.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(e.id)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label="Delete entry"
                    data-testid={`button-delete-time-entry-${e.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Inline edit row used when an entry is in edit mode. Lives inside the
// list so the user can update start/end/note without leaving context.
function EditTimeEntryRow({
  entry,
  isSaving,
  onSave,
  onCancel,
}: {
  entry: TimeEntry;
  isSaving: boolean;
  onSave: (patch: {
    startAt: string;
    endAt: string;
    note: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(toLocalInput(new Date(entry.startAt)));
  const [end, setEnd] = useState(toLocalInput(new Date(entry.endAt)));
  const [note, setNote] = useState(entry.note);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Enter valid start and end times.");
      return;
    }
    if (endDate <= startDate) {
      setError("End time must be after start time.");
      return;
    }
    if (!note.trim()) {
      setError("Add a note describing what you worked on.");
      return;
    }
    try {
      await onSave({
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        note: note.trim(),
      });
    } catch (e) {
      setError((e as Error).message ?? "Failed to update entry.");
    }
  }

  return (
    <div
      className="rounded-md border bg-muted/30 p-3 space-y-2"
      data-testid={`time-entry-edit-${entry.id}`}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Start
          </label>
          <Input
            type="datetime-local"
            step={900}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            data-testid={`input-edit-time-entry-start-${entry.id}`}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            End
          </label>
          <Input
            type="datetime-local"
            step={900}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            data-testid={`input-edit-time-entry-end-${entry.id}`}
          />
        </div>
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="min-h-[56px] text-sm"
        data-testid={`input-edit-time-entry-note-${entry.id}`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
          data-testid={`button-cancel-edit-time-entry-${entry.id}`}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          data-testid={`button-save-edit-time-entry-${entry.id}`}
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
