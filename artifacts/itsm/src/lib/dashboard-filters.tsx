import { useEffect, useMemo, useState } from "react";
import {
  useListAgents,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useTeamScope, type TeamScope } from "@/lib/team-scope";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared time-range model used by every workspace sub-dashboard
// (Tickets uses its own range type because it talks to a server-aggregated
// endpoint that takes `rangeDays` directly). The picker offers three
// fixed presets plus a free-form start/end window.
export type TimeRangePreset = "30" | "90" | "365" | "custom";

export interface TimeRangeValue {
  preset: TimeRangePreset;
  // ISO YYYY-MM-DD; only used when preset === "custom".
  customStart?: string;
  customEnd?: string;
}

export const DEFAULT_TIME_RANGE: TimeRangeValue = { preset: "30" };

const PRESET_LABEL: Record<TimeRangePreset, string> = {
  "30": "Last 30 Days",
  "90": "Last Quarter",
  "365": "Last Year",
  custom: "Custom Range",
};

// Resolve a TimeRangeValue to absolute [start, end] millisecond bounds.
// `null` means "no constraint" — used when the user picks "custom" but
// hasn't filled in both dates yet, so we don't accidentally hide
// everything.
export function resolveRange(
  v: TimeRangeValue,
): { startMs: number | null; endMs: number | null } {
  if (v.preset === "custom") {
    const startMs = v.customStart ? new Date(v.customStart).getTime() : null;
    // Custom end is inclusive of the chosen day, so push to end-of-day.
    const endMs = v.customEnd
      ? new Date(v.customEnd).getTime() + 24 * 60 * 60 * 1000 - 1
      : null;
    return { startMs, endMs };
  }
  const days = Number(v.preset);
  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

// Test whether an ISO date string falls within a resolved range. A
// missing date is treated as "outside the window" so undated rows are
// excluded from time-bounded views (callers can opt out by passing
// `null`).
export function isInRange(
  iso: string | Date | null | undefined,
  bounds: { startMs: number | null; endMs: number | null },
): boolean {
  if (iso == null) return false;
  const t = new Date(iso as string).getTime();
  if (Number.isNaN(t)) return false;
  if (bounds.startMs != null && t < bounds.startMs) return false;
  if (bounds.endMs != null && t > bounds.endMs) return false;
  return true;
}

// Build a short human label for the active range, used in dashboard
// subtitles ("Last 30 days", "Mar 1 – Mar 31", etc.).
export function rangeLabel(v: TimeRangeValue): string {
  if (v.preset !== "custom") return PRESET_LABEL[v.preset];
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  if (v.customStart && v.customEnd) {
    return `${fmt(v.customStart)} – ${fmt(v.customEnd)}`;
  }
  // Half-specified custom range: surface the partial bound so the
  // subtitle reflects what's actually being filtered.
  if (v.customStart) return `From ${fmt(v.customStart)}`;
  if (v.customEnd) return `Until ${fmt(v.customEnd)}`;
  return "Custom range";
}

// Reusable picker. Renders the preset Select; when "custom" is active
// it also exposes two native date inputs in the same row. Keeping the
// component self-contained means each dashboard just needs `value` and
// `onChange` to integrate the full UX.
export function TimeRangePicker({
  value,
  onChange,
  testId,
}: {
  value: TimeRangeValue;
  onChange: (next: TimeRangeValue) => void;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={value.preset}
        onValueChange={(p) =>
          onChange({
            ...value,
            preset: p as TimeRangePreset,
          })
        }
      >
        <SelectTrigger
          className="w-[180px]"
          data-testid={testId ?? "select-time-range"}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="30">{PRESET_LABEL["30"]}</SelectItem>
          <SelectItem value="90">{PRESET_LABEL["90"]}</SelectItem>
          <SelectItem value="365">{PRESET_LABEL["365"]}</SelectItem>
          <SelectItem value="custom">{PRESET_LABEL.custom}</SelectItem>
        </SelectContent>
      </Select>

      {value.preset === "custom" && (
        <div className="flex items-center gap-2">
          <Label
            htmlFor={`${testId ?? "range"}-start`}
            className="text-xs text-muted-foreground"
          >
            From
          </Label>
          <Input
            id={`${testId ?? "range"}-start`}
            type="date"
            value={value.customStart ?? ""}
            max={value.customEnd}
            className="w-[150px]"
            data-testid={`${testId ?? "range"}-start`}
            onChange={(e) =>
              onChange({ ...value, customStart: e.target.value || undefined })
            }
          />
          <Label
            htmlFor={`${testId ?? "range"}-end`}
            className="text-xs text-muted-foreground"
          >
            To
          </Label>
          <Input
            id={`${testId ?? "range"}-end`}
            type="date"
            value={value.customEnd ?? ""}
            min={value.customStart}
            className="w-[150px]"
            data-testid={`${testId ?? "range"}-end`}
            onChange={(e) =>
              onChange({ ...value, customEnd: e.target.value || undefined })
            }
          />
          {/* Drop both dates and snap back to the default preset.
              Without this the custom dates linger in component state
              even after the user picks a preset, so re-entering custom
              would silently restore the prior window. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            onClick={() => onChange(DEFAULT_TIME_RANGE)}
            data-testid={`${testId ?? "range"}-reset`}
            title="Reset to last 30 days"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}

// Agent options for the assignee picker.
// - When `departmentId` is provided (single team in scope), the list is
//   narrowed to that team's agents.
// - When it's undefined (multi-team or "All Teams"), we fall back to
//   every agent the API returns, so the picker is always usable.
export function useAgentOptions(departmentId: number | undefined) {
  const params = departmentId != null ? { departmentId } : {};
  const { data: agents } = useListAgents(params, {
    query: {
      queryKey: getListAgentsQueryKey(params),
    },
  });
  return agents ?? [];
}

// Multi-select agent picker. Empty selection = "All Agents" (no
// filter), exactly mirroring the team-scope multi-select pattern in
// <TeamScopeSelector />. The trigger label collapses to:
//   - "All Agents"          when nothing is selected
//   - the agent's name      when exactly one is selected
//   - "{N} agents"          when 2+ are selected
// A "Reset" affordance inside the popover snaps back to "All Agents"
// — surfaced only when a narrowed selection is active so it doesn't
// distract in the default state.
export function AssigneePicker({
  selectedIds,
  onChange,
  agents,
  testId,
}: {
  selectedIds: number[];
  onChange: (next: number[]) => void;
  agents: Array<{ id: number; name: string }>;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const isAll = selectedIds.length === 0;

  const triggerLabel = (() => {
    if (isAll) return "All Agents";
    if (selectedIds.length === 1) {
      const a = agents.find((x) => x.id === selectedIds[0]);
      return a?.name ?? "1 agent";
    }
    return `${selectedIds.length} agents`;
  })();

  function toggle(id: number) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-[200px] flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9",
            "text-sm text-left text-foreground hover:bg-accent/50 transition-colors",
          )}
          data-testid={testId ?? "select-assignee"}
        >
          <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate flex-1">{triggerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-2"
        data-testid={`${testId ?? "select-assignee"}-popover`}
      >
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Filter by Agent
          </span>
          {!isAll && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex items-center gap-1 rounded text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`${testId ?? "select-assignee"}-reset`}
            >
              <X className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between h-8"
          onClick={() => {
            onChange([]);
            setOpen(false);
          }}
          data-testid={`${testId ?? "select-assignee"}-all`}
        >
          <span className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            All Agents
          </span>
          {isAll && <Check className="h-4 w-4 text-emerald-500" />}
        </Button>
        <Separator className="my-1" />
        <div className="max-h-[300px] overflow-y-auto space-y-0.5">
          {agents.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No agents in this team
            </div>
          ) : (
            agents.map((a) => {
              const checked = selectedIds.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 h-8 text-sm cursor-pointer transition-colors",
                    "hover:bg-muted",
                  )}
                  data-testid={`${testId ?? "select-assignee"}-option-${a.id}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(a.id)}
                  />
                  <span className="truncate flex-1">{a.name}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Stable string fingerprint of the active team scope. Used as a
// `useEffect` dep so an agent filter is reset whenever scope changes
// in *any* meaningful way — including All↔explicit-multi transitions
// where the single-team id stays `undefined` and would otherwise miss
// the reset (e.g. agent picked on "All Teams" leaking into a narrowed
// 2-team subset).
export function teamScopeSignature(scope: TeamScope): string {
  if (scope.loading) return "loading";
  if (scope.isAll) return "all";
  return `ids:${[...scope.selectedIds].sort((a, b) => a - b).join(",")}`;
}

// Convenience hook that bundles the shared filter state used by every
// list-style dashboard (operational tasks, initiatives, projects).
// The team-scope state lives in <TeamScopeProvider> already, so this
// only owns the time-range and assignee filter, and watches the full
// scope signature so the assignee filter resets on any scope change.
//
// Multi-select model: `assigneeIds` is an array of agent IDs. An
// empty array means "All Agents" (no filter applied). `assigneeFilter`
// is a Set for O(1) lookups in list filters, or `null` when no agent
// filter is active.
export function useDashboardFilters() {
  const scope = useTeamScope();
  const scopeSig = teamScopeSignature(scope);
  const [range, setRange] = useState<TimeRangeValue>(DEFAULT_TIME_RANGE);
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  useEffect(() => {
    setAssigneeIds([]);
  }, [scopeSig]);
  const bounds = useMemo(() => resolveRange(range), [range]);
  const assigneeFilter = useMemo<Set<number> | null>(() => {
    if (assigneeIds.length === 0) return null;
    return new Set(assigneeIds);
  }, [assigneeIds]);
  return {
    range,
    setRange,
    bounds,
    rangeLabel: rangeLabel(range),
    assigneeIds,
    setAssigneeIds,
    assigneeFilter,
  };
}
