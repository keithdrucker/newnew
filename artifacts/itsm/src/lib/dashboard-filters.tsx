import { useEffect, useMemo, useState } from "react";
import {
  useListAgents,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

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
// Returning `"all"` as a sentinel from the picker lets callers
// disambiguate "no filter" from a real numeric agent id.
export function useAgentOptions(departmentId: number | undefined) {
  const params = departmentId != null ? { departmentId } : {};
  const { data: agents } = useListAgents(params, {
    query: {
      queryKey: getListAgentsQueryKey(params),
    },
  });
  return agents ?? [];
}

export function AssigneePicker({
  value,
  onChange,
  agents,
  testId,
}: {
  value: string;
  onChange: (next: string) => void;
  agents: Array<{ id: number; name: string }>;
  testId?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="w-[200px]"
        data-testid={testId ?? "select-assignee"}
      >
        <SelectValue placeholder="All Agents" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Agents</SelectItem>
        {agents.length > 0 ? (
          agents.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.name}
            </SelectItem>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No agents in this team
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

// Convenience hook that bundles the shared filter state used by every
// list-style dashboard (operational tasks, initiatives, projects).
// The team-scope state lives in <TeamScopeProvider> already, so this
// only owns the time-range and assignee filter.
//
// Pass the current single-team id (or `undefined` when scope is "all"
// or multi-team) so the hook can reset the assignee picker whenever
// the team changes — otherwise an agent selected on Team A would
// silently keep filtering after the user switches to Team B and
// produce empty result sets.
export function useDashboardFilters(scopedDeptId?: number) {
  const [range, setRange] = useState<TimeRangeValue>(DEFAULT_TIME_RANGE);
  const [assigneeId, setAssigneeId] = useState<string>("all");
  useEffect(() => {
    setAssigneeId("all");
  }, [scopedDeptId]);
  const bounds = useMemo(() => resolveRange(range), [range]);
  const assigneeFilter = assigneeId === "all" ? undefined : Number(assigneeId);
  return {
    range,
    setRange,
    bounds,
    rangeLabel: rangeLabel(range),
    assigneeId,
    setAssigneeId,
    assigneeFilter,
  };
}
