import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, teamWorkTypesTable, departmentsTable } from "@workspace/db";
import { getCurrentUser } from "../lib/session";

// Per-team work-type enablement.
//
// The five canonical work types are tracked in `team_work_types` keyed
// by (department_id, work_type). Rows are lazy-created on first GET so
// existing teams keep all sections enabled by default — disabling a
// work type takes an explicit toggle from an admin.
//
// Behavior rules enforced here:
//   * Disabling a work type forces `requiresTimeTracking` to false.
//   * Enabling time-tracking on a disabled work type is rejected (400).
//   * Only admins can mutate; reads are open to any authenticated user
//     (the Settings UI is admin-only at the route layer, but reads are
//     also used by membership-aware components).
const router: IRouter = Router();

const WORK_TYPES = [
  "tickets",
  "operational_tasks",
  "initiatives",
  "projects",
  "timesheets",
] as const;
type WorkType = (typeof WORK_TYPES)[number];

type Row = typeof teamWorkTypesTable.$inferSelect;

function toDto(r: Row) {
  return {
    id: r.id,
    departmentId: r.departmentId,
    workType: r.workType as WorkType,
    isEnabled: r.isEnabled,
    requiresTimeTracking: r.requiresTimeTracking,
  };
}

router.get(
  "/departments/:id/work-types",
  async (req, res): Promise<void> => {
    await getCurrentUser(req); // require auth
    const departmentId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(departmentId)) {
      res.status(400).json({ error: "Invalid department id" });
      return;
    }

    const [dept] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, departmentId))
      .limit(1);
    if (!dept) {
      res.status(404).json({ error: "Department not found" });
      return;
    }

    const existing = await db
      .select()
      .from(teamWorkTypesTable)
      .where(eq(teamWorkTypesTable.departmentId, departmentId));

    const present = new Set(existing.map((r) => r.workType));
    const missing = WORK_TYPES.filter((w) => !present.has(w));

    if (missing.length > 0) {
      // Defaults: enabled, time-tracking off. Concurrent inserts are
      // protected by the unique index — onConflictDoNothing() avoids
      // crashing if two callers race.
      await db
        .insert(teamWorkTypesTable)
        .values(
          missing.map((w) => ({
            departmentId,
            workType: w,
            isEnabled: true,
            requiresTimeTracking: false,
          })),
        )
        .onConflictDoNothing();
    }

    const final = await db
      .select()
      .from(teamWorkTypesTable)
      .where(eq(teamWorkTypesTable.departmentId, departmentId));

    // Stable order: same as the spec list so the UI doesn't need to sort.
    const ordered = WORK_TYPES.map((w) => final.find((r) => r.workType === w))
      .filter((r): r is Row => Boolean(r))
      .map(toDto);

    res.json(ordered);
  },
);

router.patch(
  "/departments/:id/work-types/:workType",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const departmentId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(departmentId)) {
      res.status(400).json({ error: "Invalid department id" });
      return;
    }
    const workType = req.params.workType as WorkType;
    if (!WORK_TYPES.includes(workType)) {
      res.status(400).json({ error: "Invalid work type" });
      return;
    }

    const body = (req.body ?? {}) as {
      isEnabled?: unknown;
      requiresTimeTracking?: unknown;
    };
    const isEnabled =
      typeof body.isEnabled === "boolean" ? body.isEnabled : undefined;
    const requiresTimeTracking =
      typeof body.requiresTimeTracking === "boolean"
        ? body.requiresTimeTracking
        : undefined;
    if (isEnabled === undefined && requiresTimeTracking === undefined) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    // Lazy-create the row so PATCH works on first interaction.
    let [existing] = await db
      .select()
      .from(teamWorkTypesTable)
      .where(
        and(
          eq(teamWorkTypesTable.departmentId, departmentId),
          eq(teamWorkTypesTable.workType, workType),
        ),
      )
      .limit(1);

    if (!existing) {
      const [created] = await db
        .insert(teamWorkTypesTable)
        .values({
          departmentId,
          workType,
          isEnabled: true,
          requiresTimeTracking: false,
        })
        .returning();
      existing = created;
    }

    const nextEnabled = isEnabled ?? existing.isEnabled;
    let nextTimeTracking = requiresTimeTracking ?? existing.requiresTimeTracking;

    // Rule: time-tracking requires the work type to be enabled.
    // - If the request explicitly tries requiresTimeTracking=true on a
    //   row whose effective enablement is false, reject with 400 — the
    //   server must enforce this even when the client doesn't send
    //   isEnabled in the same PATCH (so we check nextEnabled, not just
    //   the request body).
    // - If the request is disabling the work type, force time tracking
    //   off as a side effect (no 400 — disabling implicitly clears it).
    if (requiresTimeTracking === true && !nextEnabled) {
      res.status(400).json({
        error: "Cannot require time tracking on a disabled work type",
      });
      return;
    }
    if (!nextEnabled) {
      nextTimeTracking = false;
    }

    const [row] = await db
      .update(teamWorkTypesTable)
      .set({
        isEnabled: nextEnabled,
        requiresTimeTracking: nextTimeTracking,
      })
      .where(eq(teamWorkTypesTable.id, existing.id))
      .returning();
    res.json(toDto(row));
  },
);

export default router;
