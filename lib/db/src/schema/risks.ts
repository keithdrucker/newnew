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

// A "risk" is a record of something that COULD impact the business and
// requires an explicit treatment decision. Lifecycle:
//
//   identified ─► under_analysis ─► under_treatment ─┬─► mitigation ─► closed
//                                                    ├─► accepted    ─► closed
//                                                    ├─► transferred ─► closed
//                                                    └─► avoided     ─► closed
//
// "Close (Invalid / Duplicate)" is also reachable from `identified` and
// `under_analysis`. The transition into mitigation/accepted/transferred/
// avoided requires an approved workflow run (Team Manager of the
// owning team). Mitigation is the ONLY outcome that auto-creates a
// project; the link is captured in `createdProjectId`.
export const risksTable = pgTable(
  "risks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    // security | operational | compliance | financial | other
    riskType: text("risk_type").notNull().default("operational"),
    description: text("description").notNull().default(""),

    // Owning team = department in this codebase. Required so we know
    // who approves treatment decisions.
    owningDepartmentId: integer("owning_department_id")
      .notNull()
      .references(() => departmentsTable.id, { onDelete: "restrict" }),
    // Defaults to the team if not set.
    riskOwnerUserId: integer("risk_owner_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    // Person who logged the risk.
    reporterId: integer("reporter_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),

    // identified | under_analysis | under_treatment | mitigation |
    // accepted | transferred | avoided | closed
    status: text("status").notNull().default("identified"),

    // ---------------- Analysis (Under Analysis+) ----------------
    // low | medium | high | critical
    likelihood: text("likelihood").notNull().default(""),
    // low | medium | high | critical
    impact: text("impact").notNull().default(""),
    // **Legacy** unstructured impact fields kept for back-compat with
    // existing rows. The Analysis form no longer surfaces them — the
    // structured Impact Assessment fields below replace them.
    impactScope: text("impact_scope").notNull().default(""),
    businessImpact: text("business_impact").notNull().default(""),
    // Derived from likelihood × impact. Persisted so list views are
    // cheap and the value at-time-of-decision is preserved.
    // low | medium | high | critical
    riskRating: text("risk_rating").notNull().default(""),
    analysisNotes: text("analysis_notes").notNull().default(""),

    // -- Structured Impact Assessment (replaces free-text impactScope/biz)
    // All three are strict yes/no flags. The Treatment-tab approval
    // gate uses the financial + operational flags to decide whether
    // Team Manager approval is required: if either is "yes", the
    // treatment decision must go through the approval workflow; if
    // both are "no", the user can finalize the treatment directly
    // (see POST /risks/:id/finalize-treatment in routes/risks.ts).
    // Stored as text "" | "yes" | "no" so an unanswered field stays
    // empty rather than defaulting to a specific answer.
    financialImpact: text("financial_impact").notNull().default(""),
    operationalImpact: text("operational_impact").notNull().default(""),
    complianceImpact: text("compliance_impact").notNull().default(""),

    // -- Asset Context (optional)
    // physical | digital | process | vendor
    assetType: text("asset_type").notNull().default(""),
    // Optional numeric, stored as text for the same range/estimate
    // flexibility as financialImpact.
    assetValue: text("asset_value").notNull().default(""),
    // low | medium | high | very_high
    assetCriticality: text("asset_criticality").notNull().default(""),
    // Quantitative risk inputs. Stored as text for input flexibility
    // ("25%", "0.25", "2 per year"); parsed leniently on the client to
    // compute SLE = AssetValue × ExposureFactor and ALE = SLE × ARO.
    exposureFactor: text("exposure_factor").notNull().default(""),
    annualRateOfOccurrence: text("annual_rate_of_occurrence")
      .notNull()
      .default(""),

    // -- Risk Factors (one item per line, free-form short bullets)
    threats: text("threats").notNull().default(""),
    vulnerabilities: text("vulnerabilities").notNull().default(""),

    // ---------------- Treatment Decision (Under Treatment+) ---------
    // mitigation | acceptance | transfer | avoidance
    treatmentDecision: text("treatment_decision").notNull().default(""),
    // Outcome-specific required fields:
    acceptanceJustification: text("acceptance_justification")
      .notNull()
      .default(""),
    transferMethod: text("transfer_method").notNull().default(""),
    transferResponsibleParty: text("transfer_responsible_party")
      .notNull()
      .default(""),
    avoidanceActionNotes: text("avoidance_action_notes").notNull().default(""),
    // -- Mitigation-decision required fields. Required at approval-run-
    // start time when treatmentDecision === "mitigation".
    mitigationSummary: text("mitigation_summary").notNull().default(""),
    // Pros and Cons of the mitigation approach. Split into two columns
    // (instead of a single combined `mitigation_pros_cons`) so the UI
    // can render them as a side-by-side green/red comparison and so
    // each side can be required independently at approval time.
    mitigationPros: text("mitigation_pros").notNull().default(""),
    mitigationCons: text("mitigation_cons").notNull().default(""),
    // The estimated cost to *implement the mitigation* (i.e. the
    // expected spend on the controls/work), not the cost of the risk
    // itself. Stored as text so ranges like "$50K–$100K" are allowed.
    mitigationEstimatedCost: text("mitigation_estimated_cost")
      .notNull()
      .default(""),
    // Security control vs Compensating control. Stored as plain text:
    // "security_control" | "compensating_control" | "" (unset). Required
    // at mitigation approval time alongside summary/pros-cons/cost.
    mitigationControlType: text("mitigation_control_type")
      .notNull()
      .default(""),
    mitigationControlDescription: text("mitigation_control_description")
      .notNull()
      .default(""),

    // Set when treatment = mitigation is approved — the project that
    // was atomically created. SET NULL on project deletion (mirrors
    // the initiatives pattern).
    createdProjectId: integer("created_project_id").references(
      () => projectsTable.id,
      { onDelete: "set null" },
    ),

    // Planning Year — see replit.md "Planning Year filter".
    // For risks the axis is the year the risk is targeted for review /
    // treatment-decision rather than a "start" year. Active risks
    // (anything before mitigation/accepted/transferred/avoided/closed)
    // stay visible in the current-year view regardless of this value.
    reviewDecisionYear: integer("review_decision_year").notNull().default(2026),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    statusIdx: index("risks_status_idx").on(t.status),
    deptIdx: index("risks_owning_department_idx").on(t.owningDepartmentId),
    updatedIdx: index("risks_updated_idx").on(t.updatedAt),
  }),
);

// One row per status change. Inserted inside the same transaction as
// the risk update so the audit trail can never drift.
export const riskAuditEventsTable = pgTable(
  "risk_audit_events",
  {
    id: serial("id").primaryKey(),
    riskId: integer("risk_id")
      .notNull()
      .references(() => risksTable.id, { onDelete: "cascade" }),
    oldStatus: text("old_status").notNull(),
    newStatus: text("new_status").notNull(),
    // High-level label: "transition" | "analyze" | "treat" | "approve"
    // | "close" | "reopen"
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
    riskIdx: index("risk_audit_risk_idx").on(t.riskId),
    timeIdx: index("risk_audit_time_idx").on(t.changedAt),
  }),
);

export type Risk = typeof risksTable.$inferSelect;
export type NewRisk = typeof risksTable.$inferInsert;
export type RiskAuditEvent = typeof riskAuditEventsTable.$inferSelect;
export type NewRiskAuditEvent = typeof riskAuditEventsTable.$inferInsert;
