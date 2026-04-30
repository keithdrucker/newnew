import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { departmentsTable } from "./departments";
import { usersTable } from "./users";

// Operational Tasks represent IT-initiated time-based work — daily,
// weekly, monthly, etc. internal tasks. They are NOT request-based and
// are NOT created by end users. There is a single `operational_tasks`
// object: `type` discriminates `recurring` vs `one_time` and
// `frequency` is required only for recurring tasks.
//
// STATUS MODEL (intentionally minimal):
//   scheduled (default) → in_progress → completed
//
// "overdue" is NEVER persisted — it's purely derived at read time as
// `today > nextDueDate AND status != "completed"`. The DB has no
// `overdue` value, the API never accepts it, and the UI computes it
// on the fly. This keeps the source of truth a single boolean fact
// (the date) and avoids drift between stored status and reality.
//
// COMPLETION RULES:
//   - Completing a `one_time` task permanently closes it (status=completed,
//     completedAt/completedById captured).
//   - Completing a `recurring` task does the same for the current row
//     AND atomically inserts a fresh `scheduled` row with `nextDueDate`
//     advanced by the frequency interval, the same checklist (with all
//     `done` flags reset to false), the same owner/name/description/
//     departmentId, and the shared `seriesId` so the chain is queryable.
//
// `seriesId` links every instance of the same recurring chain back to
// the original task's id. The original carries `seriesId = id` (set by
// the API on insert). One-time tasks leave `seriesId` null.
export type OperationalTaskChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  assigneeId?: number | null;
  assigneeName?: string | null;
  // Optional per-item due date (YYYY-MM-DD). Stored inside the jsonb
  // so per-item dates require no migration.
  dueDate?: string | null;
  // ISO timestamp captured the moment `done` flips from false → true.
  // Cleared when `done` flips back to false. Stored in the jsonb so
  // we don't need a separate audit table just for checklist ticks —
  // the activity log already records the action; this is the per-item
  // completion timestamp shown inline on each checklist row.
  completedAt?: string | null;
};

export const operationalTasksTable = pgTable(
  "operational_tasks",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // 'recurring' | 'one_time'
    type: text("type").notNull(),
    // null when type='one_time'. Allowed values for recurring:
    // daily | weekly | bi_weekly | monthly | quarterly | bi_annual |
    // annual | multi_year
    frequency: text("frequency"),
    // Stored as a calendar date (YYYY-MM-DD). Overdue is computed as
    // `today > nextDueDate AND status != "completed"`.
    nextDueDate: date("next_due_date").notNull(),
    ownerId: integer("owner_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // 'scheduled' | 'in_progress' | 'completed' | 'closed'.
    // Overdue is NEVER stored — it's derived as
    // `today > nextDueDate AND status NOT IN ('completed','closed')`.
    // 'closed' is system-applied only: a one_time task that has been
    // completed for >24h is auto-promoted from 'completed' → 'closed'
    // on the next read (see lazy-close logic in the route module).
    // Closed tasks are read-only and are hidden by default in the
    // list view (Show Closed toggle reveals them).
    status: text("status").notNull().default("scheduled"),
    // Optional ITIL-style tag describing the control area this task
    // supports (security, access management, backups, …). Free-form
    // text so adding new categories doesn't require a migration; the
    // UI picks from a fixed list of ~7 well-known categories.
    controlCategory: text("control_category"),
    checklist: jsonb("checklist")
      .$type<OperationalTaskChecklistItem[]>()
      .notNull()
      .default([]),
    // For recurring chains: every instance shares the same `seriesId`
    // (= the id of the first instance). One-time tasks leave this null.
    seriesId: integer("series_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: integer("completed_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    deptStatusDueIdx: index("operational_tasks_dept_status_due_idx").on(
      t.departmentId,
      t.status,
      t.nextDueDate,
    ),
    ownerIdx: index("operational_tasks_owner_idx").on(t.ownerId),
    seriesIdx: index("operational_tasks_series_idx").on(t.seriesId),
    // Defense-in-depth: at most ONE active (non-completed) row per
    // recurring series. The app-level conditional UPDATE on
    // `/complete` prevents the same-row race, but this DB-enforced
    // invariant blocks any other path (manual SQL repairs, future
    // refactors, multi-writer mistakes) from creating two open
    // instances of the same recurring chain. One-time tasks have
    // `series_id = NULL` and are excluded from the constraint.
    seriesActiveUq: uniqueIndex("operational_tasks_series_active_uq")
      .on(t.seriesId)
      .where(sql`series_id IS NOT NULL AND status <> 'completed'`),
  }),
);

export type OperationalTaskRow =
  typeof operationalTasksTable.$inferSelect;
export type OperationalTaskInsert =
  typeof operationalTasksTable.$inferInsert;
export type OperationalTaskType = "recurring" | "one_time";
export type OperationalTaskStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  // System-applied terminal state. A one_time task that has been
  // `completed` for >24h is auto-promoted to `closed` on the next
  // read. Closed tasks are read-only and hidden by default in the
  // list view (Show Closed toggle reveals them). Never reachable
  // through user-driven status transitions.
  | "closed";
export type OperationalTaskFrequency =
  | "daily"
  | "weekly"
  | "bi_weekly"
  | "monthly"
  | "quarterly"
  | "bi_annual"
  | "annual"
  | "multi_year";
