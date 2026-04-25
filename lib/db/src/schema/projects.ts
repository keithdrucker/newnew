import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { usersTable } from "./users";

export type TaskLabel = { name: string; color: string };
export type ChecklistItem = {
  text: string;
  done: boolean;
  assigneeId?: number | null;
};

// A "project" / initiative — a board of work. Loosely modeled on
// Microsoft Planner: every project owns its own list of buckets
// (columns), and each bucket has a list of tasks (cards).
//
// A project IS the initiative. The 7-bucket pipeline (New Suggestions,
// Future Roadmap, Backlog, Phase 1..3, Completed) lives inside it and
// the cards inside the buckets are the work-steps to deliver the
// initiative. The rich initiative metadata (goal, rationale, suggested
// by, impacted departments, etc.) therefore lives on the project row.
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
    updatedIdx: index("projects_updated_idx").on(t.updatedAt),
  }),
);

export const projectBucketsTable = pgTable(
  "project_buckets",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("project_buckets_project_idx").on(t.projectId),
  }),
);

export const projectTasksTable = pgTable(
  "project_tasks",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    bucketId: integer("bucket_id")
      .notNull()
      .references(() => projectBucketsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    labels: jsonb("labels").$type<TaskLabel[]>().notNull().default([]),
    checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
    assigneeId: integer("assignee_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // low | medium | high | urgent
    priority: text("priority").notNull().default("medium"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    // --- Initiative pipeline fields ---
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    projectIdx: index("project_tasks_project_idx").on(t.projectId),
    bucketIdx: index("project_tasks_bucket_idx").on(t.bucketId),
  }),
);

// Activity log / discussion thread on an initiative (project task).
export const projectTaskCommentsTable = pgTable(
  "project_task_comments",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => projectTasksTable.id, { onDelete: "cascade" }),
    authorId: integer("author_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    taskIdx: index("project_task_comments_task_idx").on(t.taskId),
  }),
);

export type Project = typeof projectsTable.$inferSelect;
export type ProjectBucket = typeof projectBucketsTable.$inferSelect;
export type ProjectTask = typeof projectTasksTable.$inferSelect;
export type ProjectTaskComment = typeof projectTaskCommentsTable.$inferSelect;
