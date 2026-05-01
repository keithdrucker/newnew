import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { departmentsTable } from "./departments";

// Per-team enablement of work types. Each team (department) can opt
// into the five core work types — Tickets, Operational Tasks,
// Initiatives, Projects, Timesheets — and independently flag whether
// time tracking is required on that work type.
//
// Defaults are NOT seeded at migration time because the team list is
// dynamic; instead the GET endpoint lazily back-fills missing rows
// with `isEnabled=true, requiresTimeTracking=false` so existing teams
// keep all sections visible.
//
// Allowed `workType` values:
//   "tickets" | "operational_tasks" | "initiatives" | "projects" | "timesheets"
export const teamWorkTypesTable = pgTable(
  "team_work_types",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "cascade" }),
    workType: text("work_type").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    requiresTimeTracking: boolean("requires_time_tracking")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    deptWorkTypeUnique: uniqueIndex(
      "team_work_types_dept_work_type_unique",
    ).on(t.departmentId, t.workType),
  }),
);

export type TeamWorkType = typeof teamWorkTypesTable.$inferSelect;
