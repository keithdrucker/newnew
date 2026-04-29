import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Internal time tracking against tickets. Visible only to agents and
// admins on the ticket's board — never surfaced to end users (they
// shouldn't see internal effort or private notes).
//
// `startAt` / `endAt` are stored to the minute (callers round to 15-min
// increments client-side). `durationMinutes` is denormalised on write
// so reports can SUM directly without re-computing per row.
//
// `departmentId` is a snapshot from the ticket at write time so that
// timesheet queries can scope by department without joining `tickets`
// — matters once the table grows and we move tickets between boards.
export const timeEntriesTable = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  userId: integer("user_id").notNull(),
  departmentId: integer("department_id").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  // Internal note — what the agent worked on. Required so timesheets
  // are auditable; default empty would make grep/triage useless.
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TimeEntry = typeof timeEntriesTable.$inferSelect;
