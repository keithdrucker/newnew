import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  risksTable,
  riskAuditEventsTable,
  projectsTable,
  projectAuditEventsTable,
  departmentsTable,
  usersTable,
  workflowRunsTable,
  type Risk as RiskRow,
  type RiskAuditEvent as RiskAuditEventRow,
} from "@workspace/db";
import {
  ListRisksQueryParams,
  CreateRiskBody,
  UpdateRiskBody,
  GetRiskParams,
  UpdateRiskParams,
  DeleteRiskParams,
} from "@workspace/api-zod";
import { getCurrentUser, type SessionUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";
import { fetchRiskWorkflowRuns } from "./workflows";

const router: IRouter = Router();

type RiskStatus =
  | "identified"
  | "under_analysis"
  | "under_treatment"
  | "mitigation"
  | "accepted"
  | "transferred"
  | "avoided"
  | "closed";

// Agents and admins both have access; end_users do not.
function assertAgentOrAdmin(user: SessionUser): void {
  if (user.role !== "admin" && user.role !== "agent") {
    const err: Error & { status?: number } = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
}

// ---- Allowed transitions ----
//
// Treatment-outcome transitions (under_treatment → mitigation/
// accepted/transferred/avoided) require an APPROVED workflow run on
// this risk PLUS the outcome-specific fields. The workflow-run
// decision endpoint (in workflows.ts) is the only path that performs
// those transitions today; PATCH cannot bypass approval.
type TransitionRule = {
  reasonField: "transitionReason" | null;
  action: "transition" | "analyze" | "treat" | "approve" | "close" | "reopen";
  preconditions?: (
    body: Record<string, unknown>,
    existing: RiskRow,
  ) => string | null;
  // Whether the PATCH endpoint may execute this transition directly.
  // Treatment outcomes are gated to workflow-decision only.
  allowedViaPatch: boolean;
};

const TRANSITIONS: Record<string, Record<string, TransitionRule>> = {
  identified: {
    under_analysis: {
      reasonField: null,
      action: "analyze",
      allowedViaPatch: true,
    },
    closed: {
      reasonField: "transitionReason",
      action: "close",
      allowedViaPatch: true,
    },
  },
  under_analysis: {
    under_treatment: {
      reasonField: null,
      action: "treat",
      allowedViaPatch: true,
      preconditions: (body, existing) => {
        // Per spec, only Likelihood + Impact gate the move to Treatment.
        // The richer Impact-Assessment / Asset-Context / Risk-Factor fields
        // are encouraged but not required, so users aren't blocked from
        // progressing while still gathering detail.
        const lik = (body["likelihood"] as string) ?? existing.likelihood;
        const imp = (body["impact"] as string) ?? existing.impact;
        if (!lik || !imp) {
          return "likelihood and impact must be set before moving to Under Treatment.";
        }
        return null;
      },
    },
    closed: {
      reasonField: "transitionReason",
      action: "close",
      allowedViaPatch: true,
    },
  },
  under_treatment: {
    // Treatment-outcome transitions are workflow-gated. They are
    // listed here so the audit-log action labels and outcome-specific
    // precondition checks live in one place; the workflows.ts decision
    // handler is what actually flips the status.
    mitigation: {
      reasonField: null,
      action: "approve",
      allowedViaPatch: false,
      preconditions: (_body, existing) => {
        if (existing.treatmentDecision !== "mitigation") {
          return 'treatmentDecision must be "mitigation" for this outcome.';
        }
        return null;
      },
    },
    accepted: {
      reasonField: null,
      action: "approve",
      allowedViaPatch: false,
      preconditions: (body, existing) => {
        if (existing.treatmentDecision !== "acceptance") {
          return 'treatmentDecision must be "acceptance" for this outcome.';
        }
        const j =
          (body["acceptanceJustification"] as string) ??
          existing.acceptanceJustification;
        if (!j || j.trim().length === 0) {
          return "acceptanceJustification is required for Risk Acceptance.";
        }
        return null;
      },
    },
    transferred: {
      reasonField: null,
      action: "approve",
      allowedViaPatch: false,
      preconditions: (body, existing) => {
        if (existing.treatmentDecision !== "transfer") {
          return 'treatmentDecision must be "transfer" for this outcome.';
        }
        const m =
          (body["transferMethod"] as string) ?? existing.transferMethod;
        const p =
          (body["transferResponsibleParty"] as string) ??
          existing.transferResponsibleParty;
        if (!m || !p) {
          return "transferMethod and transferResponsibleParty are required for Risk Transfer.";
        }
        return null;
      },
    },
    avoided: {
      reasonField: null,
      action: "approve",
      allowedViaPatch: false,
      preconditions: (body, existing) => {
        if (existing.treatmentDecision !== "avoidance") {
          return 'treatmentDecision must be "avoidance" for this outcome.';
        }
        const n =
          (body["avoidanceActionNotes"] as string) ??
          existing.avoidanceActionNotes;
        if (!n || n.trim().length === 0) {
          return "avoidanceActionNotes is required for Risk Avoidance.";
        }
        return null;
      },
    },
  },
  mitigation: {
    closed: {
      reasonField: "transitionReason",
      action: "close",
      allowedViaPatch: true,
    },
  },
  accepted: {
    closed: {
      reasonField: "transitionReason",
      action: "close",
      allowedViaPatch: true,
    },
  },
  transferred: {
    closed: {
      reasonField: "transitionReason",
      action: "close",
      allowedViaPatch: true,
    },
  },
  avoided: {
    closed: {
      reasonField: "transitionReason",
      action: "close",
      allowedViaPatch: true,
    },
  },
};

// Risk rating from likelihood × impact. Both axes are
// low | medium | high | critical. Persisted on the risk row at
// analysis-save time so list/index queries stay cheap and the
// at-time-of-decision rating is preserved.
const LEVEL: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
function computeRiskRating(likelihood: string, impact: string): string {
  const a = LEVEL[likelihood] ?? 0;
  const b = LEVEL[impact] ?? 0;
  if (a === 0 || b === 0) return "";
  const score = a * b;
  if (score >= 12) return "critical";
  if (score >= 8) return "high";
  if (score >= 4) return "medium";
  return "low";
}

// ---- Hydrate helper ----
async function hydrate(rows: RiskRow[]): Promise<unknown[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const auditRows = await db
    .select()
    .from(riskAuditEventsTable)
    .where(inArray(riskAuditEventsTable.riskId, ids))
    .orderBy(desc(riskAuditEventsTable.changedAt));
  const auditByRisk = new Map<number, RiskAuditEventRow[]>();
  for (const e of auditRows) {
    const list = auditByRisk.get(e.riskId) ?? [];
    list.push(e);
    auditByRisk.set(e.riskId, list);
  }

  const userIdSet = new Set<number>();
  for (const r of rows) {
    if (r.riskOwnerUserId) userIdSet.add(r.riskOwnerUserId);
    if (r.reporterId) userIdSet.add(r.reporterId);
  }
  for (const e of auditRows) {
    if (e.changedById) userIdSet.add(e.changedById);
  }
  const userIds = [...userIdSet];
  const users = userIds.length
    ? await db
        .select({
          id: usersTable.id,
          name: usersTable.name,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const userNameMap = new Map(users.map((u) => [u.id, u.name.trim()]));
  const nameOf = (id: number | null): string | null =>
    id == null ? null : userNameMap.get(id) ?? null;

  const deptIds = [
    ...new Set(rows.map((r) => r.owningDepartmentId).filter(Boolean)),
  ] as number[];
  const depts = deptIds.length
    ? await db
        .select({ id: departmentsTable.id, name: departmentsTable.name })
        .from(departmentsTable)
        .where(inArray(departmentsTable.id, deptIds))
    : [];
  const deptNameMap = new Map(depts.map((d) => [d.id, d.name]));

  const workflowRunsByRisk = await fetchRiskWorkflowRuns(ids);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    riskType: r.riskType,
    description: r.description,
    status: r.status as RiskStatus,
    owningDepartmentId: r.owningDepartmentId,
    owningDepartmentName: deptNameMap.get(r.owningDepartmentId) ?? null,
    riskOwnerUserId: r.riskOwnerUserId ?? null,
    riskOwnerName: nameOf(r.riskOwnerUserId ?? null),
    reporterId: r.reporterId ?? null,
    reporterName: nameOf(r.reporterId ?? null),
    likelihood: r.likelihood,
    impact: r.impact,
    impactScope: r.impactScope,
    businessImpact: r.businessImpact,
    riskRating: r.riskRating,
    analysisNotes: r.analysisNotes,
    financialImpact: r.financialImpact,
    operationalImpact: r.operationalImpact,
    complianceImpact: r.complianceImpact,
    assetType: r.assetType,
    assetValue: r.assetValue,
    assetCriticality: r.assetCriticality,
    exposureFactor: r.exposureFactor,
    annualRateOfOccurrence: r.annualRateOfOccurrence,
    threats: r.threats,
    vulnerabilities: r.vulnerabilities,
    treatmentDecision: r.treatmentDecision,
    acceptanceJustification: r.acceptanceJustification,
    transferMethod: r.transferMethod,
    transferResponsibleParty: r.transferResponsibleParty,
    avoidanceActionNotes: r.avoidanceActionNotes,
    mitigationSummary: r.mitigationSummary,
    mitigationPros: r.mitigationPros,
    mitigationCons: r.mitigationCons,
    mitigationEstimatedCost: r.mitigationEstimatedCost,
    mitigationControlType: r.mitigationControlType,
    mitigationControlDescription: r.mitigationControlDescription,
    createdProjectId: r.createdProjectId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    auditEvents: (auditByRisk.get(r.id) ?? []).map((e) => ({
      id: e.id,
      oldStatus: e.oldStatus as RiskStatus,
      newStatus: e.newStatus as RiskStatus,
      action: e.action,
      reason: e.reason,
      changedById: e.changedById ?? null,
      changedByName: nameOf(e.changedById ?? null),
      changedAt: e.changedAt.toISOString(),
    })),
    workflowRuns: workflowRunsByRisk.get(r.id) ?? [],
  }));
}

// ---- LIST ----
router.get("/risks", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = ListRisksQueryParams.safeParse(
    coerceQuery(req.query as Record<string, unknown>),
  );
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds = [];
  if (params.data.status)
    conds.push(eq(risksTable.status, params.data.status));
  if (params.data.owningDepartmentId != null)
    conds.push(
      eq(risksTable.owningDepartmentId, params.data.owningDepartmentId),
    );
  const baseQuery = db.select().from(risksTable);
  const rows = await (conds.length
    ? baseQuery.where(and(...conds))
    : baseQuery
  ).orderBy(desc(risksTable.createdAt), asc(risksTable.id));
  res.json(await hydrate(rows));
});

// ---- GET ----
router.get("/risks/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = GetRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(risksTable)
    .where(eq(risksTable.id, params.data.id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [hydrated] = await hydrate([row]);
  res.json(hydrated);
});

// ---- CREATE ----
router.post("/risks", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const body = CreateRiskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [created] = await db
    .insert(risksTable)
    .values({
      title: body.data.title,
      riskType: body.data.riskType,
      description: body.data.description ?? "",
      owningDepartmentId: body.data.owningDepartmentId,
      riskOwnerUserId: body.data.riskOwnerUserId ?? null,
      reporterId: user.id,
      status: "identified",
    })
    .returning();
  await db.insert(riskAuditEventsTable).values({
    riskId: created.id,
    oldStatus: "identified",
    newStatus: "identified",
    action: "transition",
    reason: "Risk created.",
    changedById: user.id,
  });
  const [hydrated] = await hydrate([created]);
  res.status(201).json(hydrated);
});

// ---- UPDATE (incl. status transitions) ----
router.patch("/risks/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = UpdateRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateRiskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  type TxOutcome =
    | { kind: "ok"; row: RiskRow }
    | { kind: "not_found" }
    | { kind: "illegal_transition"; from: string; to: string }
    | { kind: "needs_field"; field: string; message: string }
    | { kind: "locked"; message: string };

  const outcome: TxOutcome = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(risksTable)
      .where(eq(risksTable.id, params.data.id))
      .for("update")
      .limit(1);
    if (!existing) return { kind: "not_found" };

    // Lock the treatment-decision proposal while an approval run is
    // pending. Approvers must vote on the SAME proposal that was
    // submitted; allowing the proposer to silently rewrite the
    // treatment fields mid-run would let an "approve mitigation"
    // vote actually authorize a transfer/acceptance/avoidance
    // outcome (or invalid state). If the proposal needs changes,
    // the pending run must be cancelled first.
    const treatmentLockFields = [
      "treatmentDecision",
      "acceptanceJustification",
      "transferMethod",
      "transferResponsibleParty",
      "avoidanceActionNotes",
      "mitigationSummary",
      "mitigationPros",
      "mitigationCons",
      "mitigationEstimatedCost",
      "mitigationControlType",
      "mitigationControlDescription",
    ] as const;
    const wantsTreatmentEdit = treatmentLockFields.some((f) => {
      const v = (body.data as Record<string, unknown>)[f];
      if (v === undefined) return false;
      const current = (existing as Record<string, unknown>)[f] ?? "";
      return v !== current;
    });
    if (wantsTreatmentEdit) {
      const [pendingRun] = await tx
        .select({ id: workflowRunsTable.id })
        .from(workflowRunsTable)
        .where(
          and(
            eq(workflowRunsTable.subjectType, "risk"),
            eq(workflowRunsTable.subjectId, existing.id),
            eq(workflowRunsTable.status, "pending"),
          ),
        )
        .limit(1);
      if (pendingRun) {
        return {
          kind: "locked",
          message:
            "Treatment proposal is locked while an approval is pending. Cancel the pending run before editing the treatment decision or its required fields.",
        };
      }
    }

    const currentStatus = existing.status as RiskStatus;
    const incomingStatus = body.data.status as RiskStatus | undefined;

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
      if (!rule.allowedViaPatch) {
        return {
          kind: "needs_field",
          field: "status",
          message:
            "This transition requires an approved workflow run; submit the treatment decision through the approval workflow instead.",
        };
      }
      actionLabel = rule.action;
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
        const incomingValue =
          ((body.data as Record<string, unknown>)[fieldName] as
            | string
            | undefined) ?? "";
        const finalValue = incomingValue.trim();
        if (finalValue.length === 0) {
          return {
            kind: "needs_field",
            field: fieldName,
            message: `${fieldName} is required for this transition.`,
          };
        }
      }
    }

    // Build patch
    const patch: Partial<typeof risksTable.$inferInsert> = {};
    const b = body.data;
    if (b.title !== undefined) patch.title = b.title;
    if (b.riskType !== undefined) patch.riskType = b.riskType;
    if (b.description !== undefined) patch.description = b.description;
    if (b.owningDepartmentId !== undefined)
      patch.owningDepartmentId = b.owningDepartmentId;
    if (b.riskOwnerUserId !== undefined)
      patch.riskOwnerUserId = b.riskOwnerUserId;
    // Analysis
    if (b.likelihood !== undefined) patch.likelihood = b.likelihood;
    if (b.impact !== undefined) patch.impact = b.impact;
    if (b.impactScope !== undefined) patch.impactScope = b.impactScope;
    if (b.businessImpact !== undefined) patch.businessImpact = b.businessImpact;
    if (b.analysisNotes !== undefined) patch.analysisNotes = b.analysisNotes;
    // Structured Impact Assessment — three strict yes/no flags. The
    // OpenAPI contract enforces the enum at the contract layer, but
    // we re-validate here so the DB can never end up holding values
    // outside the allow-list (which would break the approval-gating
    // helper and the treatment-tab two-path branch).
    const ALLOWED_YN = ["", "yes", "no"] as const;
    function assertYn(field: string, value: unknown): void {
      if (!ALLOWED_YN.includes(value as (typeof ALLOWED_YN)[number])) {
        const err: Error & { status?: number } = new Error(
          `${field} must be 'yes' or 'no'.`,
        );
        err.status = 400;
        throw err;
      }
    }
    if (b.financialImpact !== undefined) {
      assertYn("financialImpact", b.financialImpact);
      patch.financialImpact = b.financialImpact;
    }
    if (b.operationalImpact !== undefined) {
      assertYn("operationalImpact", b.operationalImpact);
      patch.operationalImpact = b.operationalImpact;
    }
    if (b.complianceImpact !== undefined) {
      assertYn("complianceImpact", b.complianceImpact);
      patch.complianceImpact = b.complianceImpact;
    }
    // Asset Context
    if (b.assetType !== undefined) patch.assetType = b.assetType;
    if (b.assetValue !== undefined) patch.assetValue = b.assetValue;
    if (b.assetCriticality !== undefined)
      patch.assetCriticality = b.assetCriticality;
    if (b.exposureFactor !== undefined)
      patch.exposureFactor = b.exposureFactor;
    if (b.annualRateOfOccurrence !== undefined)
      patch.annualRateOfOccurrence = b.annualRateOfOccurrence;
    // Risk Factors
    if (b.threats !== undefined) patch.threats = b.threats;
    if (b.vulnerabilities !== undefined)
      patch.vulnerabilities = b.vulnerabilities;
    // Recompute risk rating whenever either axis changes (or both are set
    // by the request); keeps the persisted value consistent with inputs.
    {
      const nextLik = patch.likelihood ?? existing.likelihood;
      const nextImp = patch.impact ?? existing.impact;
      if (
        patch.likelihood !== undefined ||
        patch.impact !== undefined
      ) {
        patch.riskRating = computeRiskRating(nextLik, nextImp);
      }
    }
    // Treatment
    if (b.treatmentDecision !== undefined)
      patch.treatmentDecision = b.treatmentDecision;
    if (b.acceptanceJustification !== undefined)
      patch.acceptanceJustification = b.acceptanceJustification;
    if (b.transferMethod !== undefined) patch.transferMethod = b.transferMethod;
    if (b.transferResponsibleParty !== undefined)
      patch.transferResponsibleParty = b.transferResponsibleParty;
    if (b.avoidanceActionNotes !== undefined)
      patch.avoidanceActionNotes = b.avoidanceActionNotes;
    if (b.mitigationSummary !== undefined)
      patch.mitigationSummary = b.mitigationSummary;
    if (b.mitigationPros !== undefined) patch.mitigationPros = b.mitigationPros;
    if (b.mitigationCons !== undefined) patch.mitigationCons = b.mitigationCons;
    if (b.mitigationEstimatedCost !== undefined)
      patch.mitigationEstimatedCost = b.mitigationEstimatedCost;
    if (b.mitigationControlType !== undefined) {
      // Defense-in-depth: even though the OpenAPI contract enforces the
      // enum, the server independently rejects unknown values so the DB
      // can never end up with junk control labels that break downstream
      // filters/reports or the project-description rendering.
      const ALLOWED_CONTROL_TYPES = [
        "",
        "security_control",
        "compensating_control",
      ] as const;
      if (
        !ALLOWED_CONTROL_TYPES.includes(
          b.mitigationControlType as (typeof ALLOWED_CONTROL_TYPES)[number],
        )
      ) {
        const err: Error & { status?: number } = new Error(
          "mitigationControlType must be 'security_control' or 'compensating_control'.",
        );
        err.status = 400;
        throw err;
      }
      patch.mitigationControlType = b.mitigationControlType;
    }
    if (b.mitigationControlDescription !== undefined)
      patch.mitigationControlDescription = b.mitigationControlDescription;

    let auditReason = "";
    if (incomingStatus && incomingStatus !== currentStatus && rule) {
      patch.status = incomingStatus;
      if (rule.reasonField) {
        const reasonField = rule.reasonField;
        const incoming = (b as Record<string, unknown>)[reasonField] as
          | string
          | undefined;
        auditReason = (incoming ?? "").trim();
      }
    }

    const haveFieldChanges = Object.keys(patch).length > 0;
    let updated: RiskRow = existing;
    if (haveFieldChanges) {
      const [row] = await tx
        .update(risksTable)
        .set(patch)
        .where(eq(risksTable.id, existing.id))
        .returning();
      updated = row;
    }

    if (incomingStatus && incomingStatus !== currentStatus && actionLabel) {
      await tx.insert(riskAuditEventsTable).values({
        riskId: existing.id,
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
  if (outcome.kind === "locked") {
    res.status(409).json({ error: outcome.message });
    return;
  }

  const [hydrated] = await hydrate([outcome.row]);
  res.json(hydrated);
});

// ---- POST /risks/:id/finalize-treatment ----
//
// Direct (no-approval) finalization path. Used when the risk has no
// Financial OR Operational impact — the spec says approval is only
// required for risks that actually impact those areas. This endpoint
// performs the same under_treatment → terminal status transition as
// the workflow-decision approval handler in workflows.ts, including
// auto-creating the mitigation Project and writing the same audit
// events, so the "no approval needed" path is observably identical
// to the approved path apart from skipping the workflow run itself.
router.post(
  "/risks/:id/finalize-treatment",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);
    const params = GetRiskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const riskId = params.data.id;

    type Outcome =
      | { kind: "not_found" }
      | { kind: "wrong_status" }
      | { kind: "approval_required"; message: string }
      | { kind: "missing_decision" }
      | { kind: "missing_field"; message: string }
      | { kind: "pending_run" }
      | { kind: "ok"; row: RiskRow };

    const outcome: Outcome = await db.transaction(async (tx) => {
      const [risk] = await tx
        .select()
        .from(risksTable)
        .where(eq(risksTable.id, riskId))
        .for("update")
        .limit(1);
      if (!risk) return { kind: "not_found" };
      if (risk.status !== "under_treatment") return { kind: "wrong_status" };
      if (
        risk.financialImpact === "yes" ||
        risk.operationalImpact === "yes"
      ) {
        return {
          kind: "approval_required",
          message:
            "This treatment has Financial or Operational impact and requires Team Manager approval. Start an approval workflow instead.",
        };
      }
      if (!risk.treatmentDecision) return { kind: "missing_decision" };

      // Refuse if there is already a pending approval run, just in
      // case the impact flags were edited mid-flight.
      const existingPending = await tx
        .select({ id: workflowRunsTable.id })
        .from(workflowRunsTable)
        .where(
          and(
            eq(workflowRunsTable.subjectType, "risk"),
            eq(workflowRunsTable.subjectId, riskId),
            eq(workflowRunsTable.status, "pending"),
          ),
        )
        .limit(1);
      if (existingPending.length > 0) return { kind: "pending_run" };

      const decision = risk.treatmentDecision;
      let nextStatus:
        | "mitigation"
        | "accepted"
        | "transferred"
        | "avoided"
        | null = null;
      if (decision === "mitigation") nextStatus = "mitigation";
      else if (decision === "acceptance") nextStatus = "accepted";
      else if (decision === "transfer") nextStatus = "transferred";
      else if (decision === "avoidance") nextStatus = "avoided";
      if (!nextStatus) return { kind: "missing_decision" };

      // Same per-decision required-field set the workflow finalize
      // handler enforces. Keeps the two paths in lockstep.
      if (
        decision === "acceptance" &&
        (!risk.acceptanceJustification ||
          risk.acceptanceJustification.trim().length === 0)
      ) {
        return {
          kind: "missing_field",
          message:
            "Acceptance justification is required to finalize this risk.",
        };
      }
      if (
        decision === "transfer" &&
        (!risk.transferMethod ||
          risk.transferMethod.trim().length === 0 ||
          !risk.transferResponsibleParty ||
          risk.transferResponsibleParty.trim().length === 0)
      ) {
        return {
          kind: "missing_field",
          message:
            "Transfer method and responsible party are required to finalize this risk.",
        };
      }
      if (
        decision === "avoidance" &&
        (!risk.avoidanceActionNotes ||
          risk.avoidanceActionNotes.trim().length === 0)
      ) {
        return {
          kind: "missing_field",
          message:
            "Avoidance action notes are required to finalize this risk.",
        };
      }
      if (
        decision === "mitigation" &&
        (!risk.mitigationSummary ||
          risk.mitigationSummary.trim().length === 0 ||
          !risk.mitigationPros ||
          risk.mitigationPros.trim().length === 0 ||
          !risk.mitigationCons ||
          risk.mitigationCons.trim().length === 0 ||
          !risk.mitigationEstimatedCost ||
          risk.mitigationEstimatedCost.trim().length === 0 ||
          !risk.mitigationControlType ||
          risk.mitigationControlType.trim().length === 0 ||
          !risk.mitigationControlDescription ||
          risk.mitigationControlDescription.trim().length === 0)
      ) {
        return {
          kind: "missing_field",
          message:
            "Mitigation summary, pros, cons, estimated cost, control type, and control description are all required to finalize this risk.",
        };
      }

      let createdProjectId = risk.createdProjectId;
      if (decision === "mitigation" && createdProjectId == null) {
        const controlTypeLabel =
          risk.mitigationControlType === "security_control"
            ? "Security Control"
            : risk.mitigationControlType === "compensating_control"
              ? "Compensating Control"
              : risk.mitigationControlType;
        const projectDescription = [
          risk.description || risk.title,
          `\n\nMitigation finalized for risk: ${risk.title}.`,
          `\n\n${controlTypeLabel} to implement:\n${risk.mitigationControlDescription}`,
        ]
          .join("")
          .trim();
        const [createdProject] = await tx
          .insert(projectsTable)
          .values({
            name: `Risk Mitigation: ${risk.title}`,
            description: projectDescription,
            status: "active",
            departmentId: risk.owningDepartmentId ?? null,
            ownerId: risk.riskOwnerUserId ?? user.id,
            suggestedById: risk.reporterId ?? user.id,
            rationale:
              `Created from finalized risk-mitigation decision (no approval required — ` +
              `Financial and Operational impact are both 'No'). Risk rating at decision ` +
              `time: ${risk.riskRating || "—"}.`,
          })
          .returning();
        createdProjectId = createdProject.id;
        await tx.insert(projectAuditEventsTable).values({
          projectId: createdProject.id,
          action: "created_from_risk",
          reason: `Created from finalized risk-mitigation decision (risk #${risk.id}, no approval required).`,
          detail: {
            riskId: risk.id,
            riskTitle: risk.title,
            mitigationControlType: risk.mitigationControlType,
            mitigationControlDescription: risk.mitigationControlDescription,
            approvalRequired: false,
          },
          changedById: user.id,
        });
      }

      const [updated] = await tx
        .update(risksTable)
        .set({ status: nextStatus, createdProjectId })
        .where(eq(risksTable.id, risk.id))
        .returning();
      await tx.insert(riskAuditEventsTable).values({
        riskId: risk.id,
        oldStatus: "under_treatment",
        newStatus: nextStatus,
        action: "approve",
        reason:
          "Finalized without approval (Financial and Operational impact are both 'No').",
        changedById: user.id,
      });
      return { kind: "ok", row: updated };
    });

    if (outcome.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (outcome.kind === "wrong_status") {
      res.status(409).json({
        error:
          "Risk is not Under Treatment — cannot finalize the treatment.",
      });
      return;
    }
    if (outcome.kind === "approval_required") {
      res.status(409).json({ error: outcome.message });
      return;
    }
    if (outcome.kind === "missing_decision") {
      res.status(400).json({
        error: "A treatment decision must be selected before finalizing.",
      });
      return;
    }
    if (outcome.kind === "pending_run") {
      res.status(409).json({
        error:
          "An approval workflow run is already pending on this risk. Cancel it before finalizing directly.",
      });
      return;
    }
    if (outcome.kind === "missing_field") {
      res.status(400).json({ error: outcome.message });
      return;
    }
    const [hydrated] = await hydrate([outcome.row]);
    res.json(hydrated);
  },
);

// ---- DELETE ----
router.delete("/risks/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = DeleteRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(risksTable)
    .where(eq(risksTable.id, params.data.id))
    .returning({ id: risksTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

// Suppress unused-import warnings for symbols we keep available for the
// workflows decision cascade (project creation lives there).
void projectsTable;
void projectAuditEventsTable;

export default router;
