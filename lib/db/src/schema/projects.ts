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
import { departmentsTable } from "./departments";
import { usersTable } from "./users";
import { initiativesTable } from "./initiatives";

export type TaskLabel = { name: string; color: string };

// Each checklist item has a stable `id` (UUID) so the granular
// CRUD/reorder endpoints can address it. Items written before the
// new endpoints landed may be missing `id` and `position`; the API
// layer back-fills them on read so callers never see undefined.
export type ChecklistItem = {
  id?: string;
  position?: number;
  text: string;
  done: boolean;
  assigneeId?: number | null;
  assigneeName?: string | null;
};

// Per-department phase column on the (legacy) department-level
// Kanban board. The Projects board is now the fixed 6-phase board
// (`backlog_needs_assignment` → `cancelled`); this table is no
// longer driven from the Projects UI but is preserved so existing
// data and any cross-app dependencies keep working.
export const departmentBucketsTable = pgTable(
  "department_buckets",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#4B9CD3"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    deptIdx: index("department_buckets_dept_idx").on(t.departmentId),
    deptNameUq: uniqueIndex("department_buckets_dept_name_uq").on(
      t.departmentId,
      t.name,
    ),
  }),
);

// A project is a unit of execution with a clear phase lifecycle.
//
// Linear phases:
//   backlog_needs_assignment → planning → in_progress → completed
//
// Side states (NOT linear; can be entered from planning or
// in_progress and resumed back via `previousActivePhase`):
//   on_hold, cancelled
export const projectsTable = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("#4B9CD3"),

    // ---- New phase-based lifecycle (canonical) ----
    // backlog_needs_assignment | planning | in_progress | on_hold |
    // completed | cancelled
    phase: text("phase").notNull().default("backlog_needs_assignment"),
    // Set when a project enters `on_hold` so Resume returns the
    // project to the phase it was in beforehand.
    previousActivePhase: text("previous_active_phase"),

    // ---- Legacy status, retained for back-compat (not driven by
    //      the new UI). Not removed in this pass to avoid breaking
    //      any downstream consumers that may still read it. ----
    // active | on_hold | completed | archived
    status: text("status").notNull().default("active"),

    departmentId: integer("department_id").references(
      () => departmentsTable.id,
      { onDelete: "set null" },
    ),
    bucketId: integer("bucket_id").references(() => departmentBucketsTable.id, {
      onDelete: "set null",
    }),
    ownerId: integer("owner_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),

    // ---- Phase 1: Backlog / Needs Assignment ----
    assignedTeam: text("assigned_team").notNull().default(""),
    // low | medium | high | urgent (urgent kept from legacy data)
    priority: text("priority").notNull().default("medium"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    dueAt: timestamp("due_at", { withTimezone: true }),

    // ---- Phase 2: Planning ----
    planningNotes: text("planning_notes").notNull().default(""),

    // ---- Phase 3: In Progress ----
    statusUpdate: text("status_update").notNull().default(""),

    // ---- Phase 4 (side): On Hold ----
    holdReason: text("hold_reason").notNull().default(""),
    holdNotes: text("hold_notes").notNull().default(""),
    revisitDate: date("revisit_date"),

    // ---- Phase 5: Completed ----
    completionSummary: text("completion_summary").notNull().default(""),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    // ---- Phase 6: Cancelled ----
    cancellationReason: text("cancellation_reason").notNull().default(""),

    // Reverse link to the initiative that spawned this project (if
    // any). Initiatives keep their own `createdProjectId` for the
    // forward link.
    linkedInitiativeId: integer("linked_initiative_id").references(
      () => initiativesTable.id,
      { onDelete: "set null" },
    ),

    // ---- Initiative-era metadata (preserved for back-compat) ----
    suggestedById: integer("suggested_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    goal: text("goal").notNull().default(""),
    implementation: text("implementation").notNull().default(""),
    rationale: text("rationale").notNull().default(""),
    impactedDepartmentIds: jsonb("impacted_department_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    additionalComments: text("additional_comments").notNull().default(""),
    completedYear: integer("completed_year"),
    labels: jsonb("labels").$type<TaskLabel[]>().notNull().default([]),

    // The work-steps to deliver this project. Stable per-item ids
    // are populated lazily by the API on first interaction.
    checklist: jsonb("checklist")
      .$type<ChecklistItem[]>()
      .notNull()
      .default([]),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    deptIdx: index("projects_department_idx").on(t.departmentId),
    bucketIdx: index("projects_bucket_idx").on(t.bucketId),
    phaseIdx: index("projects_phase_idx").on(t.phase),
    updatedIdx: index("projects_updated_idx").on(t.updatedAt),
  }),
);

// Activity log / discussion thread on a project.
export const projectCommentsTable = pgTable(
  "project_comments",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    authorId: integer("author_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("project_comments_project_idx").on(t.projectId),
  }),
);

// Append-only audit trail for every project mutation that is
// surfaced in the History panel. Inserted in the same transaction
// as the underlying change so the trail can never drift.
//
// `action` values:
//   created | created_from_initiative | phase_changed |
//   assignment_changed | hold_started | hold_resumed |
//   completed | cancelled | reopened |
//   checklist_added | checklist_edited | checklist_removed |
//   checklist_checked | checklist_unchecked | checklist_reordered |
//   updated
export const projectAuditEventsTable = pgTable(
  "project_audit_events",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    // Optional phase transition fields. Not all events have them
    // (e.g. checklist edits do not change the phase).
    oldPhase: text("old_phase"),
    newPhase: text("new_phase"),
    // Free-form structured payload (e.g. `{ checklistText, itemId }`).
    detail: jsonb("detail").$type<Record<string, unknown>>().default({}),
    reason: text("reason").notNull().default(""),
    changedById: integer("changed_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("project_audit_project_idx").on(t.projectId),
    timeIdx: index("project_audit_time_idx").on(t.changedAt),
  }),
);

export type Project = typeof projectsTable.$inferSelect;
export type DepartmentBucket = typeof departmentBucketsTable.$inferSelect;
export type ProjectComment = typeof projectCommentsTable.$inferSelect;
export type ProjectAuditEvent = typeof projectAuditEventsTable.$inferSelect;
export type NewProjectAuditEvent =
  typeof projectAuditEventsTable.$inferInsert;
