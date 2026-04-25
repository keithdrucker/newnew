import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { usersTable } from "./users";

export type TaskLabel = { name: string; color: string };
export type ChecklistItem = {
  text: string;
  done: boolean;
  assigneeId?: number | null;
  assigneeName?: string | null;
};

// Per-department phase column on the department-level Kanban board.
// Each department owns the same starter set of 7 phases (New Suggestions →
// 2026 Completed Initiatives) but admins can rename / add / remove them.
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
    // Used by ON CONFLICT DO NOTHING during default-phase bootstrap to make
    // concurrent first-reads of GET /departments/:id/board safe (no duplicate
    // columns).
    deptNameUq: uniqueIndex("department_buckets_dept_name_uq").on(
      t.departmentId,
      t.name,
    ),
  }),
);

// A project IS the initiative. It lives as a card on its department's
// Kanban board, in one of the department's phase buckets. The work-steps
// to deliver it live in the `checklist` field, the discussion thread in
// `project_comments`.
export const projectsTable = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("#4B9CD3"),
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
    dueAt: timestamp("due_at", { withTimezone: true }),
    // --- Initiative metadata ---
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
    // The work-steps to deliver this initiative.
    checklist: jsonb("checklist")
      .$type<ChecklistItem[]>()
      .notNull()
      .default([]),
    // low | medium | high | urgent
    priority: text("priority").notNull().default("medium"),
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
    updatedIdx: index("projects_updated_idx").on(t.updatedAt),
  }),
);

// Activity log / discussion thread on a project (initiative).
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

export type Project = typeof projectsTable.$inferSelect;
export type DepartmentBucket = typeof departmentBucketsTable.$inferSelect;
export type ProjectComment = typeof projectCommentsTable.$inferSelect;
