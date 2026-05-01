// Planning Year filter — shared by Initiatives, Projects, and Risk
// Register. The visibility rule (the "golden rule") lives on the
// server (see openapi.yaml). This module is purely UI: a tiny
// dropdown whose selection is persisted per-page in sessionStorage
// so navigating away and back does not jar the user out of the year
// they were reviewing.
//
// Range: rolling [currentYear - 3, currentYear + 3]. The default is
// always the calendar current year, so callers don't need to do
// any year math themselves.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PLANNING_YEAR_RADIUS = 3;

export function currentPlanningYear(today: Date = new Date()): number {
  return today.getUTCFullYear();
}

// Returns the rolling-window option list, ordered Future → Current →
// Previous (top-down). Caller should split into <SelectGroup>s.
export type PlanningYearOption = {
  year: number;
  bucket: "future" | "current" | "previous";
};

export function planningYearOptions(today: Date = new Date()): PlanningYearOption[] {
  const now = currentPlanningYear(today);
  const out: PlanningYearOption[] = [];
  for (let y = now + PLANNING_YEAR_RADIUS; y > now; y--) {
    out.push({ year: y, bucket: "future" });
  }
  out.push({ year: now, bucket: "current" });
  for (let y = now - 1; y >= now - PLANNING_YEAR_RADIUS; y--) {
    out.push({ year: y, bucket: "previous" });
  }
  return out;
}

// React hook that persists the user's chosen planning year per
// page-scope key in sessionStorage. Defaults to current calendar
// year on first visit (or when the stored value falls outside the
// rolling window — e.g. the calendar year ticked over since the
// last visit and the persisted year is now too old/new).
const STORAGE_PREFIX = "planningYear:";

export function usePlanningYear(scopeKey: string): readonly [number, (year: number) => void] {
  const initial = useMemo(() => {
    const now = currentPlanningYear();
    if (typeof window === "undefined") return now;
    try {
      const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${scopeKey}`);
      if (raw == null) return now;
      const parsed = Number.parseInt(raw, 10);
      if (
        !Number.isFinite(parsed) ||
        parsed < now - PLANNING_YEAR_RADIUS ||
        parsed > now + PLANNING_YEAR_RADIUS
      ) {
        return now;
      }
      return parsed;
    } catch {
      return now;
    }
  }, [scopeKey]);

  const [year, setYearState] = useState<number>(initial);

  // Keep state in sync if the scope key itself changes (e.g. multiple
  // filters mounted on the same screen — unlikely but cheap).
  useEffect(() => {
    setYearState(initial);
  }, [initial]);

  const setYear = useCallback(
    (next: number) => {
      setYearState(next);
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(
            `${STORAGE_PREFIX}${scopeKey}`,
            String(next),
          );
        } catch {
          /* sessionStorage unavailable — silently ignore. */
        }
      }
    },
    [scopeKey],
  );

  return [year, setYear] as const;
}

export type PlanningYearFilterProps = {
  value: number;
  onChange: (year: number) => void;
  // Optional ARIA label for the trigger; defaults to "Planning year".
  label?: string;
};

export function PlanningYearFilter({
  value,
  onChange,
  label = "Planning year",
}: PlanningYearFilterProps) {
  const options = useMemo(() => planningYearOptions(), []);
  const future = options.filter((o) => o.bucket === "future");
  const current = options.find((o) => o.bucket === "current");
  const previous = options.filter((o) => o.bucket === "previous");

  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n)) onChange(n);
      }}
    >
      <SelectTrigger
        aria-label={label}
        className="h-9 w-[160px] bg-white"
      >
        <span className="text-xs font-medium text-slate-500 mr-1.5">
          Planning year
        </span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {future.length > 0 && (
          <SelectGroup>
            <SelectLabel>Future</SelectLabel>
            {future.map((o) => (
              <SelectItem key={o.year} value={String(o.year)}>
                {o.year}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {current && (
          <SelectGroup>
            <SelectLabel>This year</SelectLabel>
            <SelectItem value={String(current.year)}>
              {current.year} (current)
            </SelectItem>
          </SelectGroup>
        )}
        {previous.length > 0 && (
          <SelectGroup>
            <SelectLabel>Previous</SelectLabel>
            {previous.map((o) => (
              <SelectItem key={o.year} value={String(o.year)}>
                {o.year}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

// Compact ±3-year selector reused inside Create / Detail dialogs on
// Initiatives, Projects, and Risk Register so the inline editing
// experience is consistent. Renders a "(out of range)" placeholder
// when the persisted value falls outside the rolling window — that
// can happen for legacy rows after the calendar year ticks over.
export function PlanningYearMiniSelect({
  value,
  onChange,
  testId,
  className,
}: {
  value: number;
  onChange: (year: number) => void;
  testId?: string;
  className?: string;
}) {
  const options = useMemo(() => planningYearOptions(), []);
  const now = currentPlanningYear();
  const includesValue = options.some((o) => o.year === value);
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n)) onChange(n);
      }}
    >
      <SelectTrigger data-testid={testId} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!includesValue && (
          <SelectItem value={String(value)}>{value} (out of range)</SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.year} value={String(o.year)}>
            {o.year}
            {o.year === now ? " (current)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Helper: header sentence to render under the page title. Mirrors
// the server-side visibility rule so the UI text stays correct.
export function planningYearHelperText(year: number): string {
  const now = currentPlanningYear();
  if (year === now) {
    return `Showing all open items, plus items planned for ${year}.`;
  }
  return `Showing items planned for ${year}.`;
}

// Helper: empty-state copy when the filtered list is empty. Same
// rule as `planningYearHelperText` but phrased for an empty view.
export function planningYearEmptyText(year: number): string {
  const now = currentPlanningYear();
  if (year === now) {
    return `No open items, and nothing is planned for ${year} yet.`;
  }
  return `Nothing is planned for ${year}.`;
}
