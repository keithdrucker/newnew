import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ----------------------------------------------------------------------
// Workflows
// ----------------------------------------------------------------------
//
// A "workflow" is an admin-authored rule that fires on events in a
// given module (tickets, initiatives, projects, changes, risks…). The
// shape is intentionally generic so we don't have to add new tables
// every time another module wants to participate.
//
//   WHEN <trigger>
//   IF   <conditions[]>
//   THEN <actions[]>
//
// `conditions` and `actions` are stored as jsonb arrays of typed
// records (see `WorkflowCondition` / `WorkflowAction` in the OpenAPI
// schema). The DB only enforces shape via the application layer; the
// admin UI is the single source of truth for which option lists apply
// to which `module`.
//
// Approval-type workflows additionally describe who has to sign off
// (`approvalRequiredFromKind` + `approvalRequiredFromTargets`) and the
// quorum rule (`approvalType`).
export const workflowsTable = pgTable(
  "workflows",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // tickets | initiatives | projects | changes | risks
    module: text("module").notNull(),
    // approval | routing | escalation | notification | status_change |
    // auto_assignment
    workflowType: text("workflow_type").notNull(),
    // Module-specific token (e.g. "ticket_created", "initiative_submitted").
    trigger: text("trigger").notNull(),
    // Array<{ field: string; op: string; value: unknown }>
    conditions: jsonb("conditions").notNull().default([]),
    // Array<{ kind: string; ...payload }>
    actions: jsonb("actions").notNull().default([]),
    // Approval config (only meaningful when workflowType = 'approval')
    // specific_users | roles | department_heads | finance | security |
    // it_leadership | executive_sponsor
    approvalRequiredFromKind: text("approval_required_from_kind")
      .notNull()
      .default(""),
    // For 'specific_users': [{ userId: number }]
    // For 'roles': [{ role: 'admin' | 'agent' | 'end_user' }]
    // Otherwise empty (resolved by kind).
    approvalRequiredFromTargets: jsonb("approval_required_from_targets")
      .notNull()
      .default([]),
    // single | all | any
    approvalType: text("approval_type").notNull().default("single"),
    requireDecisionRationale: boolean("require_decision_rationale")
      .notNull()
      .default(false),
    // { requester, owner, approvers, departmentHead, admins } booleans
    notifications: jsonb("notifications").notNull().default({}),
    // draft | active | inactive
    status: text("status").notNull().default("draft"),
    createdById: integer("created_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    nameByModule: uniqueIndex("workflows_module_name_uniq").on(
      t.module,
      t.name,
    ),
    moduleIdx: index("workflows_module_idx").on(t.module),
    statusIdx: index("workflows_status_idx").on(t.status),
  }),
);

// ----------------------------------------------------------------------
// Workflow runs (an instance of a workflow firing against a subject)
// ----------------------------------------------------------------------
//
// Phase 1: only Initiative *approval* workflows actually create runs
// (started by an admin from an Under Review initiative). Tickets and
// other modules will plug in here in a follow-up — the table is
// already generic enough to host them.
export const workflowRunsTable = pgTable(
  "workflow_runs",
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => workflowsTable.id, { onDelete: "cascade" }),
    // Mirrored from the workflow at run-start so the run is queryable
    // independently of any later workflow edits.
    module: text("module").notNull(),
    // 'initiative' | 'ticket' | … (singular form of module)
    subjectType: text("subject_type").notNull(),
    subjectId: integer("subject_id").notNull(),
    // pending | approved | rejected | deferred | cancelled
    status: text("status").notNull().default("pending"),
    // Snapshot of the workflow's quorum policy at run-start time. We
    // record these onto the run so editing the workflow definition
    // mid-run can never change quorum or the rationale requirement for
    // an in-flight or historical decision.
    approvalType: text("approval_type").notNull().default("single"),
    requireDecisionRationale: boolean("require_decision_rationale")
      .notNull()
      .default(false),
    startedById: integer("started_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedById: integer("resolved_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // Free-form note from the resolving decision (or cancellation).
    outcomeReason: text("outcome_reason").notNull().default(""),
  },
  (t) => ({
    subjectIdx: index("workflow_runs_subject_idx").on(
      t.subjectType,
      t.subjectId,
    ),
    workflowIdx: index("workflow_runs_workflow_idx").on(t.workflowId),
    statusIdx: index("workflow_runs_status_idx").on(t.status),
    // Belt-and-suspenders: only one pending run per (subjectType,
    // subjectId) is ever allowed. Backstops the application-level
    // "Refuse if a pending run exists" check against races.
    pendingSubjectUniq: uniqueIndex("workflow_runs_pending_subject_uniq")
      .on(t.subjectType, t.subjectId)
      .where(sql`status = 'pending'`),
  }),
);

// One row per approver assigned to a run. `decision` stays null until
// that approver acts.
export const workflowRunApproversTable = pgTable(
  "workflow_run_approvers",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => workflowRunsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // null | approve | reject | defer
    decision: text("decision"),
    rationale: text("rationale").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    runUserUniq: uniqueIndex("workflow_run_approvers_run_user_uniq").on(
      t.runId,
      t.userId,
    ),
    runIdx: index("workflow_run_approvers_run_idx").on(t.runId),
  }),
);

// One row per workflow- or run-level event. `workflowId` is set for
// definition-scoped events (created / updated / activated /
// deactivated). `runId` is set for run-scoped events (triggered /
// approver_decided / resolved / cancelled). Both can be set when the
// event is most naturally tagged with the run AND the workflow.
export const workflowAuditEventsTable = pgTable(
  "workflow_audit_events",
  {
    id: serial("id").primaryKey(),
    workflowId: integer("workflow_id").references(() => workflowsTable.id, {
      onDelete: "cascade",
    }),
    runId: integer("run_id").references(() => workflowRunsTable.id, {
      onDelete: "cascade",
    }),
    // created | updated | activated | deactivated | deleted |
    // triggered | approver_decided | resolved | cancelled
    action: text("action").notNull(),
    // Free-form structured payload (e.g. { from, to, decision, …})
    detail: jsonb("detail").notNull().default({}),
    changedById: integer("changed_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    workflowIdx: index("workflow_audit_workflow_idx").on(t.workflowId),
    runIdx: index("workflow_audit_run_idx").on(t.runId),
    timeIdx: index("workflow_audit_time_idx").on(t.changedAt),
  }),
);

export type Workflow = typeof workflowsTable.$inferSelect;
export type NewWorkflow = typeof workflowsTable.$inferInsert;
export type WorkflowRun = typeof workflowRunsTable.$inferSelect;
export type NewWorkflowRun = typeof workflowRunsTable.$inferInsert;
export type WorkflowRunApprover =
  typeof workflowRunApproversTable.$inferSelect;
export type NewWorkflowRunApprover =
  typeof workflowRunApproversTable.$inferInsert;
export type WorkflowAuditEvent =
  typeof workflowAuditEventsTable.$inferSelect;
export type NewWorkflowAuditEvent =
  typeof workflowAuditEventsTable.$inferInsert;
