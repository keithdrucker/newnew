import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { operationalTasksTable } from "./operationalTasks";
import { usersTable } from "./users";

// Immutable activity / audit log for an Operational Task. Every
// state-changing route appends one row here. Rows are never edited
// or deleted from application code — when a task itself is deleted,
// the FK cascades the activity rows out with it.
//
// `action` is a stable string code (e.g. `status_changed`,
// `owner_reassigned`, `completed`, `closed`, `time_logged`,
// `checklist_item_completed`). `details` carries the per-action
// payload (old/new values, item id + text, time entry id, etc.) so
// the UI can render rich descriptions without coupling renderer
// changes to a schema migration.
//
// `userId` is nullable because system-applied transitions (lazy
// auto-close after 24h on one_time tasks) have no acting user. The
// UI renders these as "System".
export const operationalTaskActivityTable = pgTable(
  "operational_task_activity",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => operationalTasksTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    taskCreatedIdx: index("op_task_activity_task_created_idx").on(
      t.taskId,
      t.createdAt,
    ),
  }),
);

export type OperationalTaskActivityRow =
  typeof operationalTaskActivityTable.$inferSelect;
export type OperationalTaskActivityInsert =
  typeof operationalTaskActivityTable.$inferInsert;
