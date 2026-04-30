import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  initiativesTable,
  initiativeAuditEventsTable,
  projectsTable,
  projectAuditEventsTable,
  departmentsTable,
  usersTable,
  type Initiative as InitiativeRow,
  type InitiativeAuditEvent as InitiativeAuditEventRow,
} from "@workspace/db";
import {
  ListInitiativesQueryParams,
  CreateInitiativeBody,
  UpdateInitiativeBody,
  GetInitiativeParams,
  UpdateInitiativeParams,
  DeleteInitiativeParams,
} from "@workspace/api-zod";
import { getCurrentUser, type SessionUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";
import { fetchInitiativeWorkflowRuns } from "./workflows";

const router: IRouter = Router();

type InitiativeStatus =
  | "backlog"
  | "under_review"
  | "approved"
  | "rejected_deferred";

// ---- Auth ----
//
// End_users have no access (Initiatives are an internal coordination
// tool). Agents and admins both have full access.
function assertAgentOrAdmin(user: SessionUser): void {
  if (user.role !== "admin" && user.role !== "agent") {
    const err: Error & { status?: number } = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
}

// ---- Allowed transitions ----
//
// Each entry describes one legal status change. The PATCH handler
// looks up the (current, incoming) pair and validates the required
// inputs in this table. Unknown pairs are rejected with 409.
type TransitionRule = {
  // Which body field must be a non-empty string for this transition
  // to be allowed. `decisionReason` covers approve/defer/reject;
  // `transitionReason` covers reopen / move-back / close.
  reasonField: "decisionReason" | "transitionReason" | "backlogNotes" | null;
  // Audit-log action label.
  action:
    | "transition"
    | "approve"
    | "defer"
    | "reject"
    | "close"
    | "move_back"
    | "reopen";
  // Extra preconditions on body / existing-row state.
  preconditions?: (
    body: Record<string, unknown>,
    existing: InitiativeRow,
  ) => string | null;
};

const TRANSITIONS: Record<string, Record<string, TransitionRule>> = {
  backlog: {
    under_review: {
      reasonField: null,
      action: "transition",
      preconditions: (body, existing) => {
        const decision =
          (body["investigationDecision"] as string | undefined) ??
          existing.investigationDecision;
        if (decision !== "investigate_further") {
          return 'investigationDecision must be "investigate_further" to move from Backlog to Under Review.';
        }
        return null;
      },
    },
    rejected_deferred: {
      // "Close / Do Not Pursue" path from Backlog. We ask for
      // backlogNotes (matches the spec) and use that as the audit
      // reason. decisionReason is also auto-populated from it.
      reasonField: "backlogNotes",
      action: "close",
      preconditions: (body, existing) => {
        const decision =
          (body["investigationDecision"] as string | undefined) ??
          existing.investigationDecision;
        if (decision !== "do_not_investigate") {
          return 'investigationDecision must be "do_not_investigate" to close from Backlog.';
        }
        return null;
      },
    },
  },
  under_review: {
    backlog: {
      reasonField: "transitionReason",
      action: "move_back",
    },
    approved: {
      reasonField: "decisionReason",
      action: "approve",
    },
    rejected_deferred: {
      reasonField: "decisionReason",
      action: (() => "reject")() as TransitionRule["action"],
      // Action is dynamically refined to "defer" below if
      // finalDecision === "defer".
    },
  },
  approved: {
    under_review: {
      reasonField: "transitionReason",
      action: "reopen",
    },
  },
  rejected_deferred: {
    backlog: {
      reasonField: "transitionReason",
      action: "reopen",
    },
    under_review: {
      reasonField: "transitionReason",
      action: "reopen",
    },
  },
};

// ---- Hydration ----
async function hydrate(rows: InitiativeRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const audit: InitiativeAuditEventRow[] = await db
    .select()
    .from(initiativeAuditEventsTable)
    .where(inArray(initiativeAuditEventsTable.initiativeId, ids))
    .orderBy(asc(initiativeAuditEventsTable.changedAt));
  const auditByInit = new Map<number, InitiativeAuditEventRow[]>();
  for (const e of audit) {
    const list = auditByInit.get(e.initiativeId) ?? [];
    list.push(e);
    auditByInit.set(e.initiativeId, list);
  }
  const deptIds = Array.from(
    new Set(
      rows.map((r) => r.departmentId).filter((d): d is number => d != null),
    ),
  );
  const userIds = Array.from(
    new Set(
      [
        ...rows.flatMap((r) => [
          r.reporterId,
          r.assigneeId,
          r.decidedById,
          r.backlogReviewedById,
        ]),
        ...audit.map((a) => a.changedById),
      ].filter((u): u is number => u != null),
    ),
  );
  const workflowRunsByInit = await fetchInitiativeWorkflowRuns(ids);
  const depts = deptIds.length
    ? await db
        .select()
        .from(departmentsTable)
        .where(inArray(departmentsTable.id, deptIds))
    : [];
  const users = userIds.length
    ? await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const deptMap = new Map(depts.map((d) => [d.id, d]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const nameOf = (id: number | null) =>
    id != null ? userMap.get(id)?.name ?? null : null;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status as InitiativeStatus,
    departmentId: r.departmentId ?? null,
    departmentName: r.departmentId
      ? deptMap.get(r.departmentId)?.name ?? null
      : null,
    reporterId: r.reporterId ?? null,
    reporterName: nameOf(r.reporterId),
    assigneeId: r.assigneeId ?? null,
    assigneeName: nameOf(r.assigneeId),
    // Intake
    problemOpportunity: r.problemOpportunity,
    impactScope: r.impactScope,
    additionalNotes: r.additionalNotes,
    // Backlog triage
    category: r.category,
    initialPriority: r.initialPriority,
    initialEffort: r.initialEffort,
    businessAlignment: r.businessAlignment,
    investigationDecision: r.investigationDecision,
    backlogNotes: r.backlogNotes,
    backlogReviewedById: r.backlogReviewedById ?? null,
    backlogReviewedByName: nameOf(r.backlogReviewedById),
    backlogReviewedAt: r.backlogReviewedAt
      ? r.backlogReviewedAt.toISOString()
      : null,
    reviewStartDate: r.reviewStartDate ?? null,
    anticipatedApprovalDate: r.anticipatedApprovalDate ?? null,
    // Under review (structured)
    benefits: r.benefits,
    tradeoffs: r.tradeoffs,
    businessValueLevel: r.businessValueLevel,
    businessValueSummary: r.businessValueSummary,
    costLevel: r.costLevel,
    estimatedCost: r.estimatedCost,
    riskLevel: r.riskLevel,
    validationStatus: r.validationStatus,
    impactedTeams: r.impactedTeams,
    // Legacy
    prosCons: r.prosCons,
    roughCost: r.roughCost,
    expectedBenefit: r.expectedBenefit,
    riskNotes: r.riskNotes,
    // Decision
    finalDecision: r.finalDecision,
    decisionReason: r.decisionReason,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    decidedById: r.decidedById ?? null,
    decidedByName: nameOf(r.decidedById),
    revisitDate: r.revisitDate ?? null,
    createdProjectId: r.createdProjectId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    auditEvents: (auditByInit.get(r.id) ?? []).map((e) => ({
      id: e.id,
      oldStatus: e.oldStatus as InitiativeStatus,
      newStatus: e.newStatus as InitiativeStatus,
      action: e.action,
      reason: e.reason,
      changedById: e.changedById ?? null,
      changedByName: nameOf(e.changedById),
      changedAt: e.changedAt.toISOString(),
    })),
    workflowRuns: workflowRunsByInit.get(r.id) ?? [],
  }));
}

// ---- LIST ----
router.get("/initiatives", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = ListInitiativesQueryParams.safeParse(
    coerceQuery(req.query as Record<string, unknown>),
  );
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds = [];
  if (params.data.status)
    conds.push(eq(initiativesTable.status, params.data.status));
  if (params.data.departmentId != null)
    conds.push(eq(initiativesTable.departmentId, params.data.departmentId));
  const baseQuery = db.select().from(initiativesTable);
  const rows = await (conds.length
    ? baseQuery.where(and(...conds))
    : baseQuery
  ).orderBy(desc(initiativesTable.createdAt), asc(initiativesTable.id));
  res.json(await hydrate(rows));
});

// ---- GET ----
router.get("/initiatives/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = GetInitiativeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(initiativesTable)
    .where(eq(initiativesTable.id, params.data.id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [hydrated] = await hydrate([row]);
  res.json(hydrated);
});

// ---- CREATE ----
router.post("/initiatives", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const body = CreateInitiativeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  // Map intake → both new + legacy mirror so older readers still see
  // the data. Initial businessValueSummary mirrors expectedBenefit.
  const [created] = await db
    .insert(initiativesTable)
    .values({
      title: body.data.title,
      description: body.data.description ?? "",
      problemOpportunity: body.data.problemOpportunity ?? "",
      impactScope: body.data.impactScope ?? "",
      additionalNotes: body.data.additionalNotes ?? "",
      businessValueSummary: body.data.expectedBenefit ?? "",
      expectedBenefit: body.data.expectedBenefit ?? "",
      status: "backlog",
      departmentId: body.data.departmentId ?? null,
      reporterId: body.data.reporterId ?? user.id,
      assigneeId: body.data.assigneeId ?? null,
    })
    .returning();
  const [hydrated] = await hydrate([created]);
  res.status(201).json(hydrated);
});

// ---- UPDATE (incl. status transitions) ----
router.patch("/initiatives/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = UpdateInitiativeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateInitiativeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  type TxOutcome =
    | { kind: "ok"; row: InitiativeRow }
    | { kind: "not_found" }
    | { kind: "illegal_transition"; from: string; to: string }
    | { kind: "needs_field"; field: string; message: string };

  const outcome: TxOutcome = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(initiativesTable)
      .where(eq(initiativesTable.id, params.data.id))
      .for("update")
      .limit(1);
    if (!existing) return { kind: "not_found" };

    const currentStatus = existing.status as InitiativeStatus;
    const incomingStatus = body.data.status as
      | InitiativeStatus
      | undefined;

    // Validate the transition (if any) before touching anything else.
    let rule: TransitionRule | undefined;
    let actionLabel: TransitionRule["action"] | null = null;
    if (incomingStatus && incomingStatus !== currentStatus) {
      rule = TRANSITIONS[currentStatus]?.[incomingStatus];
      if (!rule) {
        return {
          kind: "illegal_transition",
          from: currentStatus,
          to: incomingStatus,
        };
      }
      actionLabel = rule.action;
      // Refine action label for the under_review→rejected_deferred
      // case so the audit log distinguishes Defer from Reject.
      if (
        currentStatus === "under_review" &&
        incomingStatus === "rejected_deferred"
      ) {
        actionLabel =
          body.data.finalDecision === "defer" ? "defer" : "reject";
      }
      const preErr = rule.preconditions?.(
        body.data as Record<string, unknown>,
        existing,
      );
      if (preErr) {
        return {
          kind: "needs_field",
          field: "preconditions",
          message: preErr,
        };
      }
      if (rule.reasonField) {
        const fieldName = rule.reasonField;
        const incomingValue = (
          (body.data as Record<string, unknown>)[fieldName] as
            | string
            | undefined) ?? "";
        const existingValue = (existing as unknown as Record<string, string>)[
          fieldName
        ] ?? "";
        // For one-way decision transitions (approve / defer / reject) the
        // caller MUST supply a fresh decisionReason on this request — we
        // never satisfy the requirement with a stale value left on the
        // row from a prior cycle. Same rule for the reopen/move-back
        // `transitionReason`: it describes *this* movement and must be
        // newly typed every time. backlogNotes can persist on the row
        // and is allowed to be reused on close.
        const requireFresh =
          fieldName === "decisionReason" || fieldName === "transitionReason";
        const finalValue = (
          requireFresh ? incomingValue : incomingValue || existingValue
        ).trim();
        if (finalValue.length === 0) {
          return {
            kind: "needs_field",
            field: fieldName,
            message: `${fieldName} is required for this transition.`,
          };
        }
      }
    }

    // Build the field patch.
    const patch: Partial<typeof initiativesTable.$inferInsert> = {};
    const b = body.data;
    if (b.title !== undefined) patch.title = b.title;
    if (b.description !== undefined) patch.description = b.description;
    if (b.departmentId !== undefined) patch.departmentId = b.departmentId;
    if (b.assigneeId !== undefined) patch.assigneeId = b.assigneeId;
    // Intake
    if (b.problemOpportunity !== undefined)
      patch.problemOpportunity = b.problemOpportunity;
    if (b.impactScope !== undefined) patch.impactScope = b.impactScope;
    if (b.additionalNotes !== undefined)
      patch.additionalNotes = b.additionalNotes;
    // Backlog triage
    if (b.category !== undefined) patch.category = b.category;
    if (b.initialPriority !== undefined)
      patch.initialPriority = b.initialPriority;
    if (b.initialEffort !== undefined) patch.initialEffort = b.initialEffort;
    if (b.businessAlignment !== undefined)
      patch.businessAlignment = b.businessAlignment;
    if (b.investigationDecision !== undefined)
      patch.investigationDecision = b.investigationDecision;
    if (b.backlogNotes !== undefined) patch.backlogNotes = b.backlogNotes;
    // Backlog accountability dates. Same coercion shape as `revisitDate`
    // below — Drizzle `date()` wants YYYY-MM-DD strings, the generated
    // zod parser may give us a Date.
    if (b.reviewStartDate !== undefined) {
      patch.reviewStartDate =
        b.reviewStartDate instanceof Date
          ? b.reviewStartDate.toISOString().slice(0, 10)
          : b.reviewStartDate;
    }
    if (b.anticipatedApprovalDate !== undefined) {
      patch.anticipatedApprovalDate =
        b.anticipatedApprovalDate instanceof Date
          ? b.anticipatedApprovalDate.toISOString().slice(0, 10)
          : b.anticipatedApprovalDate;
    }
    // Under review
    if (b.benefits !== undefined) patch.benefits = b.benefits;
    if (b.tradeoffs !== undefined) patch.tradeoffs = b.tradeoffs;
    if (b.businessValueLevel !== undefined)
      patch.businessValueLevel = b.businessValueLevel;
    if (b.businessValueSummary !== undefined)
      patch.businessValueSummary = b.businessValueSummary;
    if (b.costLevel !== undefined) patch.costLevel = b.costLevel;
    if (b.estimatedCost !== undefined) patch.estimatedCost = b.estimatedCost;
    if (b.riskLevel !== undefined) patch.riskLevel = b.riskLevel;
    if (b.validationStatus !== undefined)
      patch.validationStatus = b.validationStatus;
    if (b.impactedTeams !== undefined) patch.impactedTeams = b.impactedTeams;
    // Legacy
    if (b.prosCons !== undefined) patch.prosCons = b.prosCons;
    if (b.roughCost !== undefined) patch.roughCost = b.roughCost;
    if (b.expectedBenefit !== undefined)
      patch.expectedBenefit = b.expectedBenefit;
    if (b.riskNotes !== undefined) patch.riskNotes = b.riskNotes;
    // Decision
    if (b.finalDecision !== undefined) patch.finalDecision = b.finalDecision;
    if (b.decisionReason !== undefined)
      patch.decisionReason = b.decisionReason;
    if (b.revisitDate !== undefined) {
      // Drizzle's `date()` column wants an ISO date string
      // (YYYY-MM-DD), but the generated zod parser coerces to Date.
      patch.revisitDate =
        b.revisitDate instanceof Date
          ? b.revisitDate.toISOString().slice(0, 10)
          : b.revisitDate;
    }

    // Status-transition side effects.
    let createdProjectId: number | null = null;
    let auditReason = "";
    if (incomingStatus && incomingStatus !== currentStatus && rule) {
      patch.status = incomingStatus;

      // Stamp Backlog Triage reviewer once when leaving Backlog.
      if (currentStatus === "backlog") {
        patch.backlogReviewedById = user.id;
        patch.backlogReviewedAt = new Date();
      }

      // If we're closing from Backlog, mirror backlogNotes into
      // decisionReason so the rejection record is self-contained.
      if (
        currentStatus === "backlog" &&
        incomingStatus === "rejected_deferred"
      ) {
        const closingNotes =
          (b.backlogNotes ?? existing.backlogNotes ?? "").trim();
        if (closingNotes && !patch.decisionReason) {
          patch.decisionReason = closingNotes;
        }
        if (!patch.finalDecision) patch.finalDecision = "do_not_pursue";
      }

      // Decision stamping when ENTERING a decision state.
      if (
        incomingStatus === "approved" ||
        incomingStatus === "rejected_deferred"
      ) {
        patch.decidedAt = new Date();
        patch.decidedById = user.id;
      }

      // Reopens out of approved / rejected_deferred clear the
      // decision stamps so the new phase starts fresh. The linked
      // project is preserved (it lives on in its own lifecycle).
      if (
        currentStatus === "approved" ||
        currentStatus === "rejected_deferred"
      ) {
        patch.decidedAt = null;
        patch.decidedById = null;
        patch.finalDecision = "";
        // Keep prior decisionReason text on the row for history; the
        // audit log captures the reopen reason separately.
      }

      // Auto-create project on first approval.
      if (
        incomingStatus === "approved" &&
        existing.createdProjectId == null
      ) {
        const departmentId =
          patch.departmentId !== undefined
            ? patch.departmentId
            : existing.departmentId;
        const newRationale =
          patch.businessValueSummary ??
          existing.businessValueSummary ??
          patch.expectedBenefit ??
          existing.expectedBenefit;
        const reasonForProject =
          patch.decisionReason ?? existing.decisionReason;
        const projectDescription = [
          patch.problemOpportunity ??
            existing.problemOpportunity ??
            patch.description ??
            existing.description,
          reasonForProject
            ? `\n\nDecision notes:\n${reasonForProject}`
            : "",
        ]
          .join("")
          .trim();
        const [createdProject] = await tx
          .insert(projectsTable)
          .values({
            name: patch.title ?? existing.title,
            description: projectDescription,
            // Lifecycle: auto-created projects land at the start of
            // the new phase board. `status` is kept as "active" for
            // back-compat with downstream consumers that still read it.
            phase: "backlog_needs_assignment",
            status: "active",
            departmentId: departmentId ?? null,
            ownerId: existing.assigneeId ?? user.id,
            suggestedById: existing.reporterId ?? user.id,
            rationale: newRationale,
            // Carry the initiative-triage axes onto the project so
            // the Projects board exposes the same filters
            // (Risk / Category / Business Alignment / Priority /
            // Effort). Prefer pending patch values so a single PATCH
            // that updates triage AND transitions to approved still
            // hands the freshest data to the new project.
            riskLevel: patch.riskLevel ?? existing.riskLevel ?? "",
            category: patch.category ?? existing.category ?? "",
            businessAlignment:
              patch.businessAlignment ?? existing.businessAlignment ?? "",
            initialPriority:
              patch.initialPriority ?? existing.initialPriority ?? "",
            initialEffort:
              patch.initialEffort ?? existing.initialEffort ?? "",
            // Reverse link so the project's History panel shows where
            // it came from.
            linkedInitiativeId: existing.id,
          })
          .returning();
        createdProjectId = createdProject.id;
        patch.createdProjectId = createdProjectId;

        // First entry in the project's History — same transaction
        // so the trail can never drift from the project row.
        await tx.insert(projectAuditEventsTable).values({
          projectId: createdProject.id,
          action: "created_from_initiative",
          newPhase: "backlog_needs_assignment",
          reason: "",
          detail: { initiativeId: existing.id, title: existing.title },
          changedById: user.id,
        });
      }

      // Audit reason for the log entry: prefer the explicit field
      // tied to this transition, else any reasonable fallback.
      if (rule.reasonField) {
        const reasonField = rule.reasonField;
        const incoming = (b as Record<string, unknown>)[reasonField] as
          | string
          | undefined;
        const fallback = (existing as unknown as Record<string, string>)[
          reasonField
        ];
        auditReason = (incoming ?? fallback ?? "").trim();
      }
    }

    const haveFieldChanges = Object.keys(patch).length > 0;
    let updated: InitiativeRow = existing;
    if (haveFieldChanges) {
      const [row] = await tx
        .update(initiativesTable)
        .set(patch)
        .where(eq(initiativesTable.id, existing.id))
        .returning();
      updated = row;
    }

    // Audit log entry — only on actual status changes.
    if (incomingStatus && incomingStatus !== currentStatus && actionLabel) {
      await tx.insert(initiativeAuditEventsTable).values({
        initiativeId: existing.id,
        oldStatus: currentStatus,
        newStatus: incomingStatus,
        action: actionLabel,
        reason: auditReason,
        changedById: user.id,
      });
    }

    return { kind: "ok", row: updated };
  });

  if (outcome.kind === "not_found") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (outcome.kind === "illegal_transition") {
    res.status(409).json({
      error: `Transition "${outcome.from}" → "${outcome.to}" is not allowed.`,
    });
    return;
  }
  if (outcome.kind === "needs_field") {
    res.status(400).json({ error: outcome.message });
    return;
  }

  const [hydrated] = await hydrate([outcome.row]);
  res.json(hydrated);
});

// ---- DELETE ----
router.delete("/initiatives/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = DeleteInitiativeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(initiativesTable)
    .where(eq(initiativesTable.id, params.data.id))
    .returning({ id: initiativesTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

export default router;
