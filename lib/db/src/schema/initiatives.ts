import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

// An "initiative" is a lightweight DECISION record — should we even do
// this work? It is intentionally separate from Projects (execution).
//
// Lifecycle (left to right):
//   backlog            → fresh idea, no analysis yet
//   under_review       → light research only (pros/cons, rough cost,
//                        expected benefit, risk)
//   approved           → TERMINAL. The PATCH handler that moves an
//                        initiative into this state must atomically
//                        create a Project and stamp createdProjectId.
//   rejected_deferred  → TERMINAL. Decision recorded, no work proceeds.
//                        Requires a decisionReason.
//
// Once a row reaches a terminal state its status must NEVER change
// again (the API enforces this with a 409). No phase / roadmap statuses
// belong here — that lives on Projects.
export const initiativesTable = pgTable(
  "initiatives",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    // backlog | under_review | approved | rejected_deferred
    status: text("status").notNull().default("backlog"),

    departmentId: integer("department_id").references(
      () => departmentsTable.id,
      { onDelete: "set null" },
    ),
    // Person who suggested the idea.
    reporterId: integer("reporter_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // Person doing the review (writing pros/cons etc). Optional.
    assigneeId: integer("assignee_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),

    // --- Light analysis fields (filled in during Under Review) ---
    prosCons: text("pros_cons").notNull().default(""),
    roughCost: text("rough_cost").notNull().default(""),
    expectedBenefit: text("expected_benefit").notNull().default(""),
    riskNotes: text("risk_notes").notNull().default(""),

    // --- Decision fields (filled when entering a terminal state) ---
    // Required when status = rejected_deferred. Optional but encouraged
    // when status = approved (used as the new project's rationale).
    decisionReason: text("decision_reason").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedById: integer("decided_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // Set when status transitions to "approved" — the new project that
    // was atomically created from this initiative. SET NULL on project
    // deletion so an orphaned terminal initiative is still readable
    // rather than cascading away.
    createdProjectId: integer("created_project_id").references(
      () => projectsTable.id,
      { onDelete: "set null" },
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    statusIdx: index("initiatives_status_idx").on(t.status),
    deptIdx: index("initiatives_department_idx").on(t.departmentId),
    updatedIdx: index("initiatives_updated_idx").on(t.updatedAt),
  }),
);

export type Initiative = typeof initiativesTable.$inferSelect;
export type NewInitiative = typeof initiativesTable.$inferInsert;
