import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Project = typeof projectsTable.$inferSelect;

export const projectBucketsTable = pgTable("project_buckets", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProjectBucket = typeof projectBucketsTable.$inferSelect;

export type ProjectTaskLabel = { name: string; color: string };

export const projectTasksTable = pgTable("project_tasks", {
  id: serial("id").primaryKey(),
  bucketId: integer("bucket_id").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  completed: boolean("completed").notNull().default(false),
  position: integer("position").notNull().default(0),
  assigneeId: integer("assignee_id"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  labels: jsonb("labels").$type<ProjectTaskLabel[]>().notNull().default([]),
  checklistDone: integer("checklist_done").notNull().default(0),
  checklistTotal: integer("checklist_total").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ProjectTask = typeof projectTasksTable.$inferSelect;
