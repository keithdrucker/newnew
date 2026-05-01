// Planning Year utilities shared by Initiatives, Projects, and Risks.
//
// The product spec calls for a single, consistent rolling-window
// rule:
//   - Range  = current calendar year ± 3.
//   - Default = current calendar year.
//   - Visibility (the "golden rule"): if the selected year IS the
//     current calendar year, callers see every NOT-CLOSED row plus
//     any row planned for the current year. For any other year in
//     range, callers see only rows whose planning year matches.
//
// The closed-status sets are owned by the route files because they
// differ per module (Risks uses status, Projects uses phase, etc.).

export const PLANNING_YEAR_RADIUS = 3;

export function currentPlanningYear(): number {
  return new Date().getUTCFullYear();
}

// Inclusive [currentYear - 3, currentYear + 3].
export function isPlanningYearInRange(year: number): boolean {
  if (!Number.isInteger(year)) return false;
  const now = currentPlanningYear();
  return year >= now - PLANNING_YEAR_RADIUS && year <= now + PLANNING_YEAR_RADIUS;
}

// Resolve the planning year on a CREATE: explicit value if supplied
// (must be in range), else the server's current calendar year.
// Returns { ok: true, year } or { ok: false, error } where error is
// a user-facing message suitable for a 400.
export type ResolveResult =
  | { ok: true; year: number }
  | { ok: false; error: string };

export function resolveCreatePlanningYear(input: number | undefined): ResolveResult {
  if (input == null) return { ok: true, year: currentPlanningYear() };
  if (!isPlanningYearInRange(input)) {
    const now = currentPlanningYear();
    return {
      ok: false,
      error:
        `planningYear ${input} is outside the allowed window ` +
        `[${now - PLANNING_YEAR_RADIUS}, ${now + PLANNING_YEAR_RADIUS}].`,
    };
  }
  return { ok: true, year: input };
}

// Validate a PATCH value: only checks range (a missing patch value
// means "leave as is" — that's the caller's responsibility).
export function validatePatchPlanningYear(input: number | undefined): ResolveResult {
  if (input == null) return { ok: true, year: 0 };
  if (!isPlanningYearInRange(input)) {
    const now = currentPlanningYear();
    return {
      ok: false,
      error:
        `planningYear ${input} is outside the allowed window ` +
        `[${now - PLANNING_YEAR_RADIUS}, ${now + PLANNING_YEAR_RADIUS}].`,
    };
  }
  return { ok: true, year: input };
}
