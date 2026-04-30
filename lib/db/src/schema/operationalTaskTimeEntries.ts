import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { operationalTasksTable } from "./operationalTasks";
import { usersTable } from "./users";
import { departmentsTable } from "./departments";

// Time tracking against an Operational Task. Mirrors the ticket
// `time_entries` table so the timesheet UI can render both sources
// uniformly. Kept as a separate table (rather than making `ticket_id`
// nullable on `time_entries`) to preserve the existing strict NOT NULL
// invariant on ticket entries — that table is queried in many places
// that assume `ticketId` is always set.
//
// `departmentId` is snapshotted from the task at write time so
// timesheet queries can scope by department without joining
// `operational_tasks`. `startAt`/`endAt` are stored to the minute and
// callers round to 15-minute boundaries (server re-snaps for
// defense-in-depth, matching ticket time entries).
export const operationalTaskTimeEntriesTable = pgTable(
  "operational_task_time_entries",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => operationalTasksTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    taskIdx: index("op_task_time_entries_task_idx").on(t.taskId),
    userStartIdx: index("op_task_time_entries_user_start_idx").on(
      t.userId,
      t.startAt,
    ),
  }),
);

export type OperationalTaskTimeEntryRow =
  typeof operationalTaskTimeEntriesTable.$inferSelect;
export type OperationalTaskTimeEntryInsert =
  typeof operationalTaskTimeEntriesTable.$inferInsert;
