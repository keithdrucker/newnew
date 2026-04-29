import type { ticketsTable } from "@workspace/db";

type TicketRow = typeof ticketsTable.$inferSelect;

export const PAUSED_STATUSES = new Set([
  "with_user",
  "with_vendor",
  "on_hold",
  "scheduled",
]);

export const TERMINAL_STATUSES = new Set(["resolved", "closed"]);

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export type SlaState = {
  phase: "response" | "resolution" | "none";
  paused: boolean;
  /** Effective deadline of the currently-active SLA, accounting for
   *  accumulated and currently-running pause time. */
  dueAt: Date | null;
  /** True when the active SLA has a deadline in the past. */
  breached: boolean;
};

/**
 * Pure function that derives the current SLA state from a ticket row.
 *
 * Phase model:
 *  - `response`: before `firstResponseAt`. Response SLA is the active
 *    clock; it is **not** paused by waiting-on-user/vendor/etc statuses
 *    because those are agent-driven holds that don't apply to "did
 *    anyone acknowledge yet".
 *  - `resolution`: after `firstResponseAt`. Resolution SLA is the active
 *    clock and pauses while in any of the four paused statuses. When
 *    paused, accumulated pause time + the currently-running pause delta
 *    are added to the original `resolutionDueAt` so the deadline slides
 *    forward in real time.
 *  - `none`: ticket is resolved/closed; no SLA is being tracked.
 */
export function slaState(r: TicketRow, nowMs = Date.now()): SlaState {
  if (TERMINAL_STATUSES.has(r.status)) {
    return { phase: "none", paused: false, dueAt: null, breached: false };
  }

  const paused = PAUSED_STATUSES.has(r.status);

  if (!r.firstResponseAt) {
    const due = r.responseDueAt;
    return {
      phase: "response",
      paused: false,
      dueAt: due,
      breached: due ? due.getTime() < nowMs : false,
    };
  }

  const accumulated = r.slaAccumulatedPauseMs ?? 0;
  const running = r.slaPausedAt ? nowMs - r.slaPausedAt.getTime() : 0;
  const totalPause = accumulated + (running > 0 ? running : 0);
  const due = r.resolutionDueAt
    ? new Date(r.resolutionDueAt.getTime() + totalPause)
    : null;
  return {
    phase: "resolution",
    paused,
    dueAt: due,
    breached: !paused && due ? due.getTime() < nowMs : false,
  };
}

export function deriveSlaStatus(
  r: TicketRow,
  state?: SlaState,
): "on_track" | "breached" | "paused" {
  const s = state ?? slaState(r);
  if (s.phase === "none") return "on_track";
  if (s.breached || r.slaBreached || r.responseSlaBreached) return "breached";
  if (s.paused) return "paused";
  return "on_track";
}
