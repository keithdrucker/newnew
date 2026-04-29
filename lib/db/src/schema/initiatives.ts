import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

// An "initiative" is a lightweight DECISION record — should we even do
// this work? It is intentionally separate from Projects (execution).
//
// Lifecycle (legal transitions are enforced in the API):
//
//   backlog ──────► under_review ──────► approved
//      │              │   ▲                 │
//      │              │   │ (reopen)        │ (auto-creates project)
//      │              ▼   │                 ▼
//      └────► rejected_deferred ◄──── (defer/reject from review)
//                  │   ▲
//                  │   │ (reopen back to backlog or under_review)
//                  ▼   │
//
// "approved" and "rejected_deferred" are decision states (not strictly
// terminal — they can be re-opened with an audit trail entry). Every
// status change inserts an `initiative_audit_events` row.
export const initiativesTable = pgTable(
  "initiatives",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    // Legacy free-form description — preserved for back-compat. The new
    // structured intake uses `problemOpportunity` + `additionalNotes`.
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
    // Person doing the review (writing analysis fields). Optional.
    assigneeId: integer("assignee_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),

    // ---------------- New intake (capture phase) ----------------
    // Replaces the old free-form `description`. Kept alongside it so
    // older rows still render.
    problemOpportunity: text("problem_opportunity").notNull().default(""),
    // individual | team | department | company_wide
    impactScope: text("impact_scope").notNull().default(""),
    additionalNotes: text("additional_notes").notNull().default(""),

    // ---------------- Backlog Triage ----------------
    // it | security | hr | finance | operations | compliance |
    // customer_experience | other
    category: text("category").notNull().default(""),
    // low | medium | high
    initialPriority: text("initial_priority").notNull().default(""),
    // low | medium | high
    initialEffort: text("initial_effort").notNull().default(""),
    // yes | no | unsure
    businessAlignment: text("business_alignment").notNull().default(""),
    // investigate_further | do_not_investigate
    investigationDecision: text("investigation_decision")
      .notNull()
      .default(""),
    backlogNotes: text("backlog_notes").notNull().default(""),
    backlogReviewedById: integer("backlog_reviewed_by_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    backlogReviewedAt: timestamp("backlog_reviewed_at", {
      withTimezone: true,
    }),

    // ---------------- Under Review (light analysis) ----------------
    // New structured fields. The legacy text fields below are still
    // kept so old data doesn't disappear and so we can fall back when
    // a row hasn't been re-saved yet.
    benefits: text("benefits").notNull().default(""),
    tradeoffs: text("tradeoffs").notNull().default(""),
    // low | medium | high
    businessValueLevel: text("business_value_level").notNull().default(""),
    businessValueSummary: text("business_value_summary")
      .notNull()
      .default(""),
    // low | medium | high | unknown
    costLevel: text("cost_level").notNull().default(""),
    estimatedCost: text("estimated_cost").notNull().default(""),
    // low | medium | high
    riskLevel: text("risk_level").notNull().default(""),
    // not_reviewed | discussed | demoed | piloted
    validationStatus: text("validation_status").notNull().default(""),
    impactedTeams: text("impacted_teams").notNull().default(""),

    // ---------------- Legacy analysis fields (preserved) ----------------
    // tradeoffs (new) ← prosCons (legacy)
    // businessValueSummary (new) ← expectedBenefit (legacy)
    // estimatedCost (new) ← roughCost (legacy)
    // riskNotes is kept verbatim and used as Risk Notes.
    prosCons: text("pros_cons").notNull().default(""),
    roughCost: text("rough_cost").notNull().default(""),
    expectedBenefit: text("expected_benefit").notNull().default(""),
    riskNotes: text("risk_notes").notNull().default(""),

    // ---------------- Final Decision ----------------
    // approve | defer | reject (mirrors the chosen action)
    finalDecision: text("final_decision").notNull().default(""),
    // Required for approve/defer/reject in the API.
    decisionReason: text("decision_reason").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedById: integer("decided_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // Optional, only meaningful when finalDecision = defer.
    revisitDate: date("revisit_date"),
    // Set when status transitions to "approved" — the new project that
    // was atomically created. SET NULL on project deletion. Reopening
    // an approved initiative leaves this in place (project lives on).
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

// One row per status change. Inserted inside the same transaction as
// the corresponding initiative update so the audit trail can never
// drift from the underlying status history.
export const initiativeAuditEventsTable = pgTable(
  "initiative_audit_events",
  {
    id: serial("id").primaryKey(),
    initiativeId: integer("initiative_id")
      .notNull()
      .references(() => initiativesTable.id, { onDelete: "cascade" }),
    // Same status enum as `initiatives.status`. Stored as text so this
    // table doesn't need to learn about new statuses.
    oldStatus: text("old_status").notNull(),
    newStatus: text("new_status").notNull(),
    // High-level label: "transition" | "approve" | "defer" | "reject"
    // | "close" | "move_back" | "reopen"
    action: text("action").notNull(),
    reason: text("reason").notNull().default(""),
    changedById: integer("changed_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    initIdx: index("initiative_audit_initiative_idx").on(t.initiativeId),
    timeIdx: index("initiative_audit_time_idx").on(t.changedAt),
  }),
);

export type Initiative = typeof initiativesTable.$inferSelect;
export type NewInitiative = typeof initiativesTable.$inferInsert;
export type InitiativeAuditEvent =
  typeof initiativeAuditEventsTable.$inferSelect;
export type NewInitiativeAuditEvent =
  typeof initiativeAuditEventsTable.$inferInsert;
