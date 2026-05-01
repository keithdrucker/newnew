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
        const lik = (body["likelihood"] as string) ?? existing.likelihood;
        const imp = (body["impact"] as string) ?? existing.impact;
        const scope =
          (body["impactScope"] as string) ?? existing.impactScope;
        const biz =
          (body["businessImpact"] as string) ?? existing.businessImpact;
        if (!lik || !imp || !scope || !biz) {
          return "likelihood, impact, impactScope, and businessImpact must be set before moving to Under Treatment.";
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
    treatmentDecision: r.treatmentDecision,
    acceptanceJustification: r.acceptanceJustification,
    transferMethod: r.transferMethod,
    transferResponsibleParty: r.transferResponsibleParty,
    avoidanceActionNotes: r.avoidanceActionNotes,
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
    | { kind: "needs_field"; field: string; message: string };

  const outcome: TxOutcome = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(risksTable)
      .where(eq(risksTable.id, params.data.id))
      .for("update")
      .limit(1);
    if (!existing) return { kind: "not_found" };

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

  const [hydrated] = await hydrate([outcome.row]);
  res.json(hydrated);
});

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
void workflowRunsTable;

export default router;
