import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  workflowsTable,
  workflowRunsTable,
  workflowRunApproversTable,
  workflowAuditEventsTable,
  initiativesTable,
  initiativeAuditEventsTable,
  risksTable,
  riskAuditEventsTable,
  projectsTable,
  projectAuditEventsTable,
  usersTable,
  type Workflow as WorkflowRow,
  type WorkflowRun as WorkflowRunRow,
  type WorkflowRunApprover as WorkflowRunApproverRow,
  type WorkflowAuditEvent as WorkflowAuditEventRow,
} from "@workspace/db";
import {
  ListWorkflowsQueryParams,
  CreateWorkflowBody,
  UpdateWorkflowBody,
  GetWorkflowParams,
  UpdateWorkflowParams,
  DeleteWorkflowParams,
  ListWorkflowRunsParams,
  GetWorkflowRunParams,
  StartInitiativeWorkflowRunParams,
  StartInitiativeWorkflowRunBody,
  StartRiskWorkflowRunParams,
  StartRiskWorkflowRunBody,
  SubmitWorkflowRunDecisionParams,
  SubmitWorkflowRunDecisionBody,
  CancelWorkflowRunParams,
  CancelWorkflowRunBody,
} from "@workspace/api-zod";
import { getCurrentUser, type SessionUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";

const router: IRouter = Router();

// ----------------------------------------------------------------------
// Auth helpers
// ----------------------------------------------------------------------

function assertAgentOrAdmin(user: SessionUser): void {
  if (user.role !== "admin" && user.role !== "agent") {
    const err: Error & { status?: number } = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
}

function assertAdmin(user: SessionUser): void {
  if (user.role !== "admin") {
    const err: Error & { status?: number } = new Error("Forbidden — admin only");
    err.status = 403;
    throw err;
  }
}

// ----------------------------------------------------------------------
// Hydration
// ----------------------------------------------------------------------

function nameMap(users: { id: number; name: string }[]) {
  return new Map(users.map((u) => [u.id, u.name] as const));
}

async function hydrateWorkflows(rows: WorkflowRow[]) {
  if (rows.length === 0) return [];
  const userIds = Array.from(
    new Set(
      rows
        .map((r) => r.createdById)
        .filter((u): u is number => u != null),
    ),
  );
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const names = nameMap(users);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    module: r.module,
    workflowType: r.workflowType,
    trigger: r.trigger,
    conditions: (r.conditions as unknown[]) ?? [],
    actions: (r.actions as unknown[]) ?? [],
    approvalRequiredFromKind: r.approvalRequiredFromKind,
    approvalRequiredFromTargets:
      (r.approvalRequiredFromTargets as unknown[]) ?? [],
    approvalType: r.approvalType,
    requireDecisionRationale: r.requireDecisionRationale,
    notifications: (r.notifications as Record<string, unknown>) ?? {},
    status: r.status,
    createdById: r.createdById ?? null,
    createdByName: r.createdById ? names.get(r.createdById) ?? null : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

async function hydrateWorkflowRuns(runs: WorkflowRunRow[]) {
  if (runs.length === 0) return [];
  const runIds = runs.map((r) => r.id);
  const workflowIds = Array.from(new Set(runs.map((r) => r.workflowId)));
  const [approvers, workflows] = await Promise.all([
    db
      .select()
      .from(workflowRunApproversTable)
      .where(inArray(workflowRunApproversTable.runId, runIds))
      .orderBy(asc(workflowRunApproversTable.id)),
    db
      .select()
      .from(workflowsTable)
      .where(inArray(workflowsTable.id, workflowIds)),
  ]);
  const userIds = Array.from(
    new Set(
      [
        ...runs.flatMap((r) => [r.startedById, r.resolvedById]),
        ...approvers.map((a) => a.userId),
      ].filter((u): u is number => u != null),
    ),
  );
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const names = nameMap(users);
  const wfMap = new Map(workflows.map((w) => [w.id, w] as const));
  const approversByRun = new Map<number, WorkflowRunApproverRow[]>();
  for (const a of approvers) {
    const list = approversByRun.get(a.runId) ?? [];
    list.push(a);
    approversByRun.set(a.runId, list);
  }
  return runs.map((r) => {
    const wf = wfMap.get(r.workflowId);
    return {
      id: r.id,
      workflowId: r.workflowId,
      workflowName: wf?.name ?? null,
      module: r.module,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      status: r.status,
      startedById: r.startedById ?? null,
      startedByName: r.startedById ? names.get(r.startedById) ?? null : null,
      startedAt: r.startedAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      resolvedById: r.resolvedById ?? null,
      resolvedByName: r.resolvedById
        ? names.get(r.resolvedById) ?? null
        : null,
      outcomeReason: r.outcomeReason,
      // Read run-level snapshots so workflow edits made AFTER the run
      // started never alter the rules a decision is judged against.
      approvalType: r.approvalType,
      requireDecisionRationale: r.requireDecisionRationale,
      approvers: (approversByRun.get(r.id) ?? []).map((a) => ({
        id: a.id,
        userId: a.userId,
        userName: names.get(a.userId) ?? null,
        decision: a.decision,
        rationale: a.rationale,
        decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
      })),
    };
  });
}

async function hydrateAuditEvents(events: WorkflowAuditEventRow[]) {
  if (events.length === 0) return [];
  const userIds = Array.from(
    new Set(
      events.map((e) => e.changedById).filter((u): u is number => u != null),
    ),
  );
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const names = nameMap(users);
  return events.map((e) => ({
    id: e.id,
    workflowId: e.workflowId ?? null,
    runId: e.runId ?? null,
    action: e.action,
    detail: (e.detail as Record<string, unknown>) ?? {},
    changedById: e.changedById ?? null,
    changedByName: e.changedById ? names.get(e.changedById) ?? null : null,
    changedAt: e.changedAt.toISOString(),
  }));
}

// Public so initiatives.ts can hydrate runs onto the initiative response.
export async function fetchInitiativeWorkflowRuns(
  initiativeIds: number[],
): Promise<Map<number, Awaited<ReturnType<typeof hydrateWorkflowRuns>>>> {
  const out = new Map<
    number,
    Awaited<ReturnType<typeof hydrateWorkflowRuns>>
  >();
  if (initiativeIds.length === 0) return out;
  const runs = await db
    .select()
    .from(workflowRunsTable)
    .where(
      and(
        eq(workflowRunsTable.subjectType, "initiative"),
        inArray(workflowRunsTable.subjectId, initiativeIds),
      ),
    )
    .orderBy(desc(workflowRunsTable.startedAt));
  const hydrated = await hydrateWorkflowRuns(runs);
  for (const r of hydrated) {
    const list = out.get(r.subjectId) ?? [];
    list.push(r);
    out.set(r.subjectId, list);
  }
  return out;
}

// Public so risks.ts can hydrate runs onto the risk response.
export async function fetchRiskWorkflowRuns(
  riskIds: number[],
): Promise<Map<number, Awaited<ReturnType<typeof hydrateWorkflowRuns>>>> {
  const out = new Map<
    number,
    Awaited<ReturnType<typeof hydrateWorkflowRuns>>
  >();
  if (riskIds.length === 0) return out;
  const runs = await db
    .select()
    .from(workflowRunsTable)
    .where(
      and(
        eq(workflowRunsTable.subjectType, "risk"),
        inArray(workflowRunsTable.subjectId, riskIds),
      ),
    )
    .orderBy(desc(workflowRunsTable.startedAt));
  const hydrated = await hydrateWorkflowRuns(runs);
  for (const r of hydrated) {
    const list = out.get(r.subjectId) ?? [];
    list.push(r);
    out.set(r.subjectId, list);
  }
  return out;
}

// ----------------------------------------------------------------------
// Approver resolution
// ----------------------------------------------------------------------
//
// Phase 1: We resolve approvers as follows.
//   - specific_users: targets must include `[{userId}]`
//   - roles: targets must include `[{role}]`; we pull every user with
//     that role
//   - department_heads / finance / security / it_leadership /
//     executive_sponsor: fall back to "all admins" — these org roles
//     aren't modelled yet, but configuring the workflow with one of
//     these kinds at least lets the org pick a clean intent today.
async function resolveApproverUserIds(
  workflow: WorkflowRow,
): Promise<number[]> {
  const targets = (workflow.approvalRequiredFromTargets as Array<
    Record<string, unknown>
  >) ?? [];
  const kind = workflow.approvalRequiredFromKind;

  if (kind === "specific_users") {
    const ids = targets
      .map((t) => Number(t.userId))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return [];
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.id, ids));
    return rows.map((r) => r.id);
  }
  if (kind === "roles") {
    const roles = targets
      .map((t) => String(t.role ?? ""))
      .filter((r) => r === "admin" || r === "agent" || r === "end_user");
    if (roles.length === 0) return [];
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.role, roles));
    return rows.map((r) => r.id);
  }
  // Org-role kinds — fall back to admins for now.
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));
  return rows.map((r) => r.id);
}

// ----------------------------------------------------------------------
// Run resolution evaluator
// ----------------------------------------------------------------------
//
// Returns the run's resolved status given the current set of decisions
// and the approval type. Returns null when the run should stay pending.
type RunOutcome = "approved" | "rejected" | "deferred" | null;
function evaluateRunOutcome(
  decisions: (string | null)[],
  approvalType: string,
): RunOutcome {
  // Defer wins outright across all modes — it lets a single approver
  // park the decision regardless of quorum.
  if (decisions.includes("defer")) return "deferred";
  const approves = decisions.filter((d) => d === "approve").length;
  const rejects = decisions.filter((d) => d === "reject").length;
  const total = decisions.length;
  if (approvalType === "all") {
    if (rejects > 0) return "rejected";
    if (approves === total && total > 0) return "approved";
    return null;
  }
  if (approvalType === "any") {
    // Any-approver mode resolves only on a first APPROVE; rejects do
    // not block the run unless every approver has rejected (in which
    // case approval is no longer reachable).
    if (approves > 0) return "approved";
    if (total > 0 && rejects === total) return "rejected";
    return null;
  }
  // 'single' (default) — first decision wins (approve or reject).
  if (approves > 0) return "approved";
  if (rejects > 0) return "rejected";
  return null;
}

// ----------------------------------------------------------------------
// LIST workflows
// ----------------------------------------------------------------------
router.get("/workflows", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = ListWorkflowsQueryParams.safeParse(
    coerceQuery(req.query as Record<string, unknown>),
  );
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds = [];
  if (params.data.module)
    conds.push(eq(workflowsTable.module, params.data.module));
  if (params.data.status)
    conds.push(eq(workflowsTable.status, params.data.status));
  const baseQuery = db.select().from(workflowsTable);
  const rows = await (conds.length
    ? baseQuery.where(and(...conds))
    : baseQuery
  ).orderBy(desc(workflowsTable.updatedAt));
  res.json(await hydrateWorkflows(rows));
});

// ----------------------------------------------------------------------
// GET workflow detail (with audit log)
// ----------------------------------------------------------------------
router.get("/workflows/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = GetWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(workflowsTable)
    .where(eq(workflowsTable.id, params.data.id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [hydrated] = await hydrateWorkflows([row]);
  const auditRows = await db
    .select()
    .from(workflowAuditEventsTable)
    .where(eq(workflowAuditEventsTable.workflowId, row.id))
    .orderBy(asc(workflowAuditEventsTable.changedAt));
  const auditEvents = await hydrateAuditEvents(auditRows);
  res.json({ ...hydrated, auditEvents });
});

// ----------------------------------------------------------------------
// CREATE workflow (admin)
// ----------------------------------------------------------------------
router.post("/workflows", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAdmin(user);
  const body = CreateWorkflowBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workflowsTable)
      .values({
        name: body.data.name,
        module: body.data.module,
        workflowType: body.data.workflowType,
        trigger: body.data.trigger,
        conditions: body.data.conditions ?? [],
        actions: body.data.actions ?? [],
        approvalRequiredFromKind: body.data.approvalRequiredFromKind ?? "",
        approvalRequiredFromTargets:
          body.data.approvalRequiredFromTargets ?? [],
        approvalType: body.data.approvalType ?? "single",
        requireDecisionRationale: body.data.requireDecisionRationale ?? false,
        notifications: body.data.notifications ?? {},
        status: body.data.status ?? "draft",
        createdById: user.id,
      })
      .returning();
    await tx.insert(workflowAuditEventsTable).values({
      workflowId: row.id,
      action: "created",
      detail: { name: row.name, module: row.module, status: row.status },
      changedById: user.id,
    });
    return row;
  });
  const [hydrated] = await hydrateWorkflows([created]);
  res.status(201).json(hydrated);
});

// ----------------------------------------------------------------------
// UPDATE workflow (admin)
// ----------------------------------------------------------------------
router.patch("/workflows/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAdmin(user);
  const params = UpdateWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateWorkflowBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, params.data.id))
      .for("update")
      .limit(1);
    if (!existing) return null;
    const patch: Partial<typeof workflowsTable.$inferInsert> = {};
    const b = body.data;
    if (b.name !== undefined) patch.name = b.name;
    if (b.module !== undefined) patch.module = b.module;
    if (b.workflowType !== undefined) patch.workflowType = b.workflowType;
    if (b.trigger !== undefined) patch.trigger = b.trigger;
    if (b.conditions !== undefined) patch.conditions = b.conditions;
    if (b.actions !== undefined) patch.actions = b.actions;
    if (b.approvalRequiredFromKind !== undefined)
      patch.approvalRequiredFromKind = b.approvalRequiredFromKind;
    if (b.approvalRequiredFromTargets !== undefined)
      patch.approvalRequiredFromTargets = b.approvalRequiredFromTargets;
    if (b.approvalType !== undefined) patch.approvalType = b.approvalType;
    if (b.requireDecisionRationale !== undefined)
      patch.requireDecisionRationale = b.requireDecisionRationale;
    if (b.notifications !== undefined) patch.notifications = b.notifications;
    if (b.status !== undefined) patch.status = b.status;
    const [row] = await tx
      .update(workflowsTable)
      .set(patch)
      .where(eq(workflowsTable.id, existing.id))
      .returning();
    await tx.insert(workflowAuditEventsTable).values({
      workflowId: row.id,
      action: "updated",
      detail: { fields: Object.keys(patch) },
      changedById: user.id,
    });
    if (b.status !== undefined && b.status !== existing.status) {
      await tx.insert(workflowAuditEventsTable).values({
        workflowId: row.id,
        action:
          b.status === "active"
            ? "activated"
            : b.status === "inactive"
              ? "deactivated"
              : "updated",
        detail: { from: existing.status, to: b.status },
        changedById: user.id,
      });
    }
    return row;
  });
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [hydrated] = await hydrateWorkflows([updated]);
  res.json(hydrated);
});

// ----------------------------------------------------------------------
// DELETE workflow (admin)
// ----------------------------------------------------------------------
router.delete("/workflows/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAdmin(user);
  const params = DeleteWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(workflowsTable)
    .where(eq(workflowsTable.id, params.data.id))
    .returning({ id: workflowsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

// ----------------------------------------------------------------------
// LIST runs for a workflow
// ----------------------------------------------------------------------
router.get("/workflows/:id/runs", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = ListWorkflowRunsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const runs = await db
    .select()
    .from(workflowRunsTable)
    .where(eq(workflowRunsTable.workflowId, params.data.id))
    .orderBy(desc(workflowRunsTable.startedAt));
  res.json(await hydrateWorkflowRuns(runs));
});

// ----------------------------------------------------------------------
// GET single run
// ----------------------------------------------------------------------
router.get("/workflow-runs/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAgentOrAdmin(user);
  const params = GetWorkflowRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(workflowRunsTable)
    .where(eq(workflowRunsTable.id, params.data.id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [hydrated] = await hydrateWorkflowRuns([row]);
  res.json(hydrated);
});

// ----------------------------------------------------------------------
// START a workflow run on an initiative (admin)
// ----------------------------------------------------------------------
router.post(
  "/initiatives/:id/workflow-runs",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    assertAdmin(user);
    const params = StartInitiativeWorkflowRunParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = StartInitiativeWorkflowRunBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const initiativeId = params.data.id;
    const workflowId = body.data.workflowId;

    // Validate the workflow once outside the tx (cheap, read-only).
    const [workflow] = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, workflowId))
      .limit(1);
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    if (workflow.module !== "initiatives") {
      res.status(400).json({
        error: `Workflow module is "${workflow.module}", expected "initiatives".`,
      });
      return;
    }
    if (workflow.workflowType !== "approval") {
      res.status(400).json({
        error: 'Only "approval" workflows can be started this way.',
      });
      return;
    }
    if (workflow.status !== "active") {
      res
        .status(409)
        .json({ error: "Workflow must be Active to start a run." });
      return;
    }

    const approverIds = await resolveApproverUserIds(workflow);
    if (approverIds.length === 0) {
      res.status(400).json({
        error:
          "Workflow has no resolvable approvers. Configure approvers and try again.",
      });
      return;
    }

    type StartOutcome =
      | { kind: "ok"; runId: number }
      | { kind: "not_found" }
      | { kind: "wrong_status" }
      | { kind: "already_pending" };

    const outcome: StartOutcome = await db.transaction(async (tx) => {
      // Lock the initiative row to serialize concurrent run-start
      // attempts against the same subject. The pending-uniqueness
      // index also defends at the DB layer.
      const [initiative] = await tx
        .select()
        .from(initiativesTable)
        .where(eq(initiativesTable.id, initiativeId))
        .for("update")
        .limit(1);
      if (!initiative) return { kind: "not_found" };
      if (initiative.status !== "under_review") {
        return { kind: "wrong_status" };
      }

      const existingPending = await tx
        .select({ id: workflowRunsTable.id })
        .from(workflowRunsTable)
        .where(
          and(
            eq(workflowRunsTable.subjectType, "initiative"),
            eq(workflowRunsTable.subjectId, initiativeId),
            eq(workflowRunsTable.status, "pending"),
          ),
        )
        .limit(1);
      if (existingPending.length > 0) return { kind: "already_pending" };

      const [run] = await tx
        .insert(workflowRunsTable)
        .values({
          workflowId: workflow.id,
          module: workflow.module,
          subjectType: "initiative",
          subjectId: initiativeId,
          status: "pending",
          // Snapshot the workflow's quorum policy onto the run so
          // future workflow edits cannot retroactively change the
          // rules a decision is judged against.
          approvalType: workflow.approvalType,
          requireDecisionRationale: workflow.requireDecisionRationale,
          startedById: user.id,
        })
        .returning();
      await tx.insert(workflowRunApproversTable).values(
        approverIds.map((uid) => ({
          runId: run.id,
          userId: uid,
        })),
      );
      await tx.insert(workflowAuditEventsTable).values({
        workflowId: workflow.id,
        runId: run.id,
        action: "triggered",
        detail: {
          subjectType: "initiative",
          subjectId: initiativeId,
          approverIds,
        },
        changedById: user.id,
      });
      return { kind: "ok", runId: run.id };
    });
    if (outcome.kind === "not_found") {
      res.status(404).json({ error: "Initiative not found" });
      return;
    }
    if (outcome.kind === "wrong_status") {
      res
        .status(409)
        .json({ error: "Initiative must be Under Review to start a workflow." });
      return;
    }
    if (outcome.kind === "already_pending") {
      res
        .status(409)
        .json({ error: "An approval run is already pending on this initiative." });
      return;
    }
    const [created] = await db
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.id, outcome.runId))
      .limit(1);
    const [hydrated] = await hydrateWorkflowRuns([created]);
    res.status(201).json(hydrated);
  },
);

// ----------------------------------------------------------------------
// START a workflow run on a risk (admin) — for treatment-decision approval
// ----------------------------------------------------------------------
router.post(
  "/risks/:id/workflow-runs",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    assertAdmin(user);
    const params = StartRiskWorkflowRunParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = StartRiskWorkflowRunBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const riskId = params.data.id;
    const workflowId = body.data.workflowId;

    const [workflow] = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, workflowId))
      .limit(1);
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    if (workflow.module !== "risks") {
      res.status(400).json({
        error: `Workflow module is "${workflow.module}", expected "risks".`,
      });
      return;
    }
    if (workflow.workflowType !== "approval") {
      res.status(400).json({
        error: 'Only "approval" workflows can be started this way.',
      });
      return;
    }
    if (workflow.status !== "active") {
      res
        .status(409)
        .json({ error: "Workflow must be Active to start a run." });
      return;
    }

    const approverIds = await resolveApproverUserIds(workflow);
    if (approverIds.length === 0) {
      res.status(400).json({
        error:
          "Workflow has no resolvable approvers. Configure approvers and try again.",
      });
      return;
    }

    type StartOutcome =
      | { kind: "ok"; runId: number }
      | { kind: "not_found" }
      | { kind: "wrong_status" }
      | { kind: "missing_decision" }
      | { kind: "missing_field"; message: string }
      | { kind: "already_pending" };

    const outcome: StartOutcome = await db.transaction(async (tx) => {
      const [risk] = await tx
        .select()
        .from(risksTable)
        .where(eq(risksTable.id, riskId))
        .for("update")
        .limit(1);
      if (!risk) return { kind: "not_found" };
      if (risk.status !== "under_treatment") {
        return { kind: "wrong_status" };
      }
      if (!risk.treatmentDecision) {
        return { kind: "missing_decision" };
      }
      // Outcome-specific required fields must be populated before
      // the approval run is opened — keeps approvers from voting on
      // an incomplete proposal.
      //
      // Approval is *only* required when the treatment has Financial
      // or Operational impact. If both are "no" (or unset), the
      // treatment must be finalized via POST /risks/:id/finalize-
      // treatment instead — keeping the two paths mutually exclusive
      // so the audit trail stays clean.
      if (
        risk.financialImpact !== "yes" &&
        risk.operationalImpact !== "yes"
      ) {
        return {
          kind: "missing_field",
          message:
            "Approval is not required for this risk (Financial and Operational impact are both 'No'). Use the Finalize Treatment action instead.",
        };
      }
      if (
        risk.treatmentDecision === "mitigation" &&
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
            "Mitigation summary, pros, cons, estimated cost, control type, and control description are required before approval.",
        };
      }
      if (
        risk.treatmentDecision === "acceptance" &&
        (!risk.acceptanceJustification ||
          risk.acceptanceJustification.trim().length === 0)
      ) {
        return {
          kind: "missing_field",
          message: "Acceptance justification is required before approval.",
        };
      }
      if (
        risk.treatmentDecision === "transfer" &&
        (!risk.transferMethod || !risk.transferResponsibleParty)
      ) {
        return {
          kind: "missing_field",
          message:
            "Transfer method and responsible party are required before approval.",
        };
      }
      if (
        risk.treatmentDecision === "avoidance" &&
        (!risk.avoidanceActionNotes ||
          risk.avoidanceActionNotes.trim().length === 0)
      ) {
        return {
          kind: "missing_field",
          message: "Avoidance action notes are required before approval.",
        };
      }

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
      if (existingPending.length > 0) return { kind: "already_pending" };

      const [run] = await tx
        .insert(workflowRunsTable)
        .values({
          workflowId: workflow.id,
          module: workflow.module,
          subjectType: "risk",
          subjectId: riskId,
          status: "pending",
          approvalType: workflow.approvalType,
          requireDecisionRationale: workflow.requireDecisionRationale,
          startedById: user.id,
        })
        .returning();
      await tx.insert(workflowRunApproversTable).values(
        approverIds.map((uid) => ({
          runId: run.id,
          userId: uid,
        })),
      );
      await tx.insert(workflowAuditEventsTable).values({
        workflowId: workflow.id,
        runId: run.id,
        action: "triggered",
        detail: {
          subjectType: "risk",
          subjectId: riskId,
          treatmentDecision: risk.treatmentDecision,
          approverIds,
        },
        changedById: user.id,
      });
      return { kind: "ok", runId: run.id };
    });

    if (outcome.kind === "not_found") {
      res.status(404).json({ error: "Risk not found" });
      return;
    }
    if (outcome.kind === "wrong_status") {
      res.status(409).json({
        error: "Risk must be Under Treatment to start an approval run.",
      });
      return;
    }
    if (outcome.kind === "missing_decision") {
      res.status(400).json({
        error:
          "Set a treatment decision (mitigation/acceptance/transfer/avoidance) before starting the approval run.",
      });
      return;
    }
    if (outcome.kind === "missing_field") {
      res.status(400).json({ error: outcome.message });
      return;
    }
    if (outcome.kind === "already_pending") {
      res
        .status(409)
        .json({ error: "An approval run is already pending on this risk." });
      return;
    }
    const [created] = await db
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.id, outcome.runId))
      .limit(1);
    const [hydrated] = await hydrateWorkflowRuns([created]);
    res.status(201).json(hydrated);
  },
);

// ----------------------------------------------------------------------
// SUBMIT a decision on a workflow run
// ----------------------------------------------------------------------
router.post("/workflow-runs/:id/decision", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  // Anyone listed as an approver can decide; we enforce membership below.
  assertAgentOrAdmin(user);
  const params = SubmitWorkflowRunDecisionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SubmitWorkflowRunDecisionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  type Outcome =
    | { kind: "ok"; runId: number }
    | { kind: "not_found" }
    | { kind: "not_pending" }
    | { kind: "not_approver" }
    | { kind: "rationale_required" }
    | { kind: "already_decided" }
    | { kind: "illegal_state"; message: string };

  // Sentinel: thrown from inside the transaction AFTER the approver
  // vote has been written, so that the tx rolls back the vote when the
  // subject can't be finalized (e.g. risk no longer Under Treatment).
  // Returning a value here would commit the partial work and leave the
  // run stuck (vote recorded but run still pending).
  class FinalizeError extends Error {
    constructor(public readonly userMessage: string) {
      super(userMessage);
    }
  }

  let outcome: Outcome;
  try {
    outcome = await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.id, params.data.id))
      .for("update")
      .limit(1);
    if (!run) return { kind: "not_found" };
    if (run.status !== "pending") return { kind: "not_pending" };

    const [workflow] = await tx
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, run.workflowId))
      .limit(1);
    if (!workflow) {
      return { kind: "illegal_state", message: "Workflow no longer exists" };
    }
    // Use the run's snapshot of policy fields, NOT the (possibly
    // edited) live workflow row, so quorum + rationale rules stay
    // stable for the lifetime of the run.
    if (
      run.requireDecisionRationale &&
      (!body.data.rationale || body.data.rationale.trim().length === 0)
    ) {
      return { kind: "rationale_required" };
    }

    const approvers = await tx
      .select()
      .from(workflowRunApproversTable)
      .where(eq(workflowRunApproversTable.runId, run.id));
    const mine = approvers.find((a) => a.userId === user.id);
    if (!mine) return { kind: "not_approver" };
    if (mine.decision) return { kind: "already_decided" };

    await tx
      .update(workflowRunApproversTable)
      .set({
        decision: body.data.decision,
        rationale: body.data.rationale ?? "",
        decidedAt: new Date(),
      })
      .where(eq(workflowRunApproversTable.id, mine.id));

    await tx.insert(workflowAuditEventsTable).values({
      workflowId: workflow.id,
      runId: run.id,
      action: "approver_decided",
      detail: {
        userId: user.id,
        decision: body.data.decision,
        rationale: body.data.rationale ?? "",
      },
      changedById: user.id,
    });

    // Re-read with our update applied.
    const updatedApprovers = approvers.map((a) =>
      a.id === mine.id
        ? { ...a, decision: body.data.decision, rationale: body.data.rationale ?? "" }
        : a,
    );
    const decisions = updatedApprovers.map((a) => a.decision);
    // Use the run-level snapshot of approvalType (not the live
    // workflow's), so quorum stays stable across edits.
    const outcomeStatus = evaluateRunOutcome(decisions, run.approvalType);
    if (!outcomeStatus) {
      return { kind: "ok", runId: run.id };
    }

    // Resolve the run + cascade to the subject. Initiatives go down
    // the existing approval-creates-project flow; risks branch by
    // treatmentDecision (mitigation also creates a project).
    if (
      run.subjectType !== "initiative" &&
      run.subjectType !== "risk"
    ) {
      throw new FinalizeError(
        `Subject type "${run.subjectType}" is not supported.`,
      );
    }

    // Build the resolution reason from the deciding approvers' notes.
    const decidingApprovers = updatedApprovers.filter(
      (a) =>
        a.decision === "approve" ||
        a.decision === "reject" ||
        a.decision === "defer",
    );
    const resolutionReason =
      decidingApprovers
        .map((a) => `${a.rationale}`.trim())
        .filter((s) => s.length > 0)
        .join(" \n ") ||
      `Auto-resolved via workflow "${workflow.name}".`;

    const now = new Date();

    if (run.subjectType === "risk") {
      const [risk] = await tx
        .select()
        .from(risksTable)
        .where(eq(risksTable.id, run.subjectId))
        .for("update")
        .limit(1);
      if (!risk) {
        throw new FinalizeError("Risk no longer exists");
      }
      if (risk.status !== "under_treatment") {
        throw new FinalizeError(
          "Risk is no longer Under Treatment — cannot finalize the workflow.",
        );
      }
      if (outcomeStatus === "approved") {
        // Map treatmentDecision → terminal lifecycle status.
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
        if (!nextStatus) {
          throw new FinalizeError(
            "Risk has no treatment decision recorded.",
          );
        }
        // Re-validate outcome-specific required fields at finalize
        // time. Even though we lock these fields in PATCH while a run
        // is pending, validate again so we never transition a risk
        // into a terminal state with missing data.
        if (
          decision === "acceptance" &&
          (!risk.acceptanceJustification ||
            risk.acceptanceJustification.trim().length === 0)
        ) {
          throw new FinalizeError(
            "Acceptance justification is required to approve this risk.",
          );
        }
        if (
          decision === "transfer" &&
          (!risk.transferMethod ||
            risk.transferMethod.trim().length === 0 ||
            !risk.transferResponsibleParty ||
            risk.transferResponsibleParty.trim().length === 0)
        ) {
          throw new FinalizeError(
            "Transfer method and responsible party are required to approve this risk.",
          );
        }
        if (
          decision === "avoidance" &&
          (!risk.avoidanceActionNotes ||
            risk.avoidanceActionNotes.trim().length === 0)
        ) {
          throw new FinalizeError(
            "Avoidance action notes are required to approve this risk.",
          );
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
          throw new FinalizeError(
            "Mitigation summary, pros, cons, estimated cost, control type, and control description are all required to approve this risk.",
          );
        }

        let createdProjectId = risk.createdProjectId;
        if (decision === "mitigation" && createdProjectId == null) {
          // Auto-create a Project for the mitigation work. Owner
          // falls back to the deciding admin when the risk has no
          // explicit owner; suggester is the original reporter. The
          // control selected on the risk is carried into the project
          // description so the project team can implement it.
          const controlTypeLabel =
            risk.mitigationControlType === "security_control"
              ? "Security Control"
              : risk.mitigationControlType === "compensating_control"
                ? "Compensating Control"
                : risk.mitigationControlType;
          const projectDescription = [
            risk.description || risk.title,
            `\n\nMitigation approved for risk: ${risk.title}.`,
            `\n\n${controlTypeLabel} to implement:\n${risk.mitigationControlDescription}`,
            resolutionReason
              ? `\n\nDecision notes:\n${resolutionReason}`
              : "",
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
                `Created from approved risk-mitigation decision. ` +
                `Risk rating at decision time: ${risk.riskRating || "—"}.`,
              // Carry the risk's planning year onto the new project
              // so it shows up in the same Planning Year view.
              plannedStartYear: risk.reviewDecisionYear,
            })
            .returning();
          createdProjectId = createdProject.id;
          await tx.insert(projectAuditEventsTable).values({
            projectId: createdProject.id,
            action: "created_from_risk",
            reason: `Created from approved risk-mitigation decision (risk #${risk.id}).`,
            detail: {
              riskId: risk.id,
              riskTitle: risk.title,
              mitigationControlType: risk.mitigationControlType,
              mitigationControlDescription:
                risk.mitigationControlDescription,
            },
            changedById: user.id,
          });
        }

        await tx
          .update(risksTable)
          .set({
            status: nextStatus,
            createdProjectId,
          })
          .where(eq(risksTable.id, risk.id));
        await tx.insert(riskAuditEventsTable).values({
          riskId: risk.id,
          oldStatus: "under_treatment",
          newStatus: nextStatus,
          action: "approve",
          reason: resolutionReason,
          changedById: user.id,
        });
      } else {
        // rejected / deferred → bounce risk back to under_analysis so
        // the team can revise the proposal.
        await tx
          .update(risksTable)
          .set({ status: "under_analysis" })
          .where(eq(risksTable.id, risk.id));
        await tx.insert(riskAuditEventsTable).values({
          riskId: risk.id,
          oldStatus: "under_treatment",
          newStatus: "under_analysis",
          action: outcomeStatus === "deferred" ? "transition" : "transition",
          reason:
            outcomeStatus === "deferred"
              ? `Treatment deferred. ${resolutionReason}`
              : `Treatment rejected. ${resolutionReason}`,
          changedById: user.id,
        });
      }

      await tx
        .update(workflowRunsTable)
        .set({
          status: outcomeStatus,
          resolvedAt: now,
          resolvedById: user.id,
          outcomeReason: resolutionReason,
        })
        .where(eq(workflowRunsTable.id, run.id));
      await tx.insert(workflowAuditEventsTable).values({
        workflowId: workflow.id,
        runId: run.id,
        action: "resolved",
        detail: { outcome: outcomeStatus, reason: resolutionReason },
        changedById: user.id,
      });
      return { kind: "ok", runId: run.id };
    }

    const [initiative] = await tx
      .select()
      .from(initiativesTable)
      .where(eq(initiativesTable.id, run.subjectId))
      .for("update")
      .limit(1);
    if (!initiative) {
      throw new FinalizeError("Initiative no longer exists");
    }
    if (initiative.status !== "under_review") {
      throw new FinalizeError(
        "Initiative is no longer Under Review — cannot finalize the workflow.",
      );
    }

    if (outcomeStatus === "approved") {
      // Cascade: under_review → approved + create project on first approval.
      const projectDescription = [
        initiative.problemOpportunity || initiative.description,
        resolutionReason
          ? `\n\nDecision notes:\n${resolutionReason}`
          : "",
      ]
        .join("")
        .trim();
      let createdProjectId = initiative.createdProjectId;
      if (createdProjectId == null) {
        const [createdProject] = await tx
          .insert(projectsTable)
          .values({
            name: initiative.title,
            description: projectDescription,
            status: "active",
            departmentId: initiative.departmentId ?? null,
            ownerId: initiative.assigneeId ?? user.id,
            suggestedById: initiative.reporterId ?? user.id,
            rationale:
              initiative.businessValueSummary ||
              initiative.expectedBenefit ||
              "",
            // Carry the initiative's planning year onto the new
            // project so it shows up in the same Planning Year view.
            plannedStartYear: initiative.plannedStartYear,
          })
          .returning();
        createdProjectId = createdProject.id;
      }
      await tx
        .update(initiativesTable)
        .set({
          status: "approved",
          finalDecision: "approve",
          decisionReason: resolutionReason,
          decidedAt: now,
          decidedById: user.id,
          createdProjectId,
        })
        .where(eq(initiativesTable.id, initiative.id));
      await tx.insert(initiativeAuditEventsTable).values({
        initiativeId: initiative.id,
        oldStatus: "under_review",
        newStatus: "approved",
        action: "approve",
        reason: resolutionReason,
        changedById: user.id,
      });
    } else {
      // rejected | deferred → both map to initiative status
      // "rejected_deferred" (with finalDecision differentiating).
      const finalDecision =
        outcomeStatus === "deferred" ? "defer" : "reject";
      await tx
        .update(initiativesTable)
        .set({
          status: "rejected_deferred",
          finalDecision,
          decisionReason: resolutionReason,
          decidedAt: now,
          decidedById: user.id,
        })
        .where(eq(initiativesTable.id, initiative.id));
      await tx.insert(initiativeAuditEventsTable).values({
        initiativeId: initiative.id,
        oldStatus: "under_review",
        newStatus: "rejected_deferred",
        action: finalDecision,
        reason: resolutionReason,
        changedById: user.id,
      });
    }

    await tx
      .update(workflowRunsTable)
      .set({
        status: outcomeStatus,
        resolvedAt: now,
        resolvedById: user.id,
        outcomeReason: resolutionReason,
      })
      .where(eq(workflowRunsTable.id, run.id));
    await tx.insert(workflowAuditEventsTable).values({
      workflowId: workflow.id,
      runId: run.id,
      action: "resolved",
      detail: { outcome: outcomeStatus, reason: resolutionReason },
      changedById: user.id,
    });

    return { kind: "ok", runId: run.id };
    });
  } catch (err) {
    if (err instanceof FinalizeError) {
      // Subject couldn't be finalized — the entire transaction
      // (including this approver's vote) was rolled back so the run
      // stays pending and the approver can re-decide once the issue
      // is fixed.
      res.status(409).json({ error: err.userMessage });
      return;
    }
    throw err;
  }

  if (outcome.kind === "not_found") {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  if (outcome.kind === "not_pending") {
    res.status(409).json({ error: "Run is no longer pending." });
    return;
  }
  if (outcome.kind === "not_approver") {
    res.status(403).json({ error: "You are not an approver on this run." });
    return;
  }
  if (outcome.kind === "rationale_required") {
    res
      .status(400)
      .json({ error: "Decision rationale is required for this workflow." });
    return;
  }
  if (outcome.kind === "already_decided") {
    res.status(409).json({ error: "You have already recorded a decision." });
    return;
  }
  if (outcome.kind === "illegal_state") {
    res.status(409).json({ error: outcome.message });
    return;
  }

  const [row] = await db
    .select()
    .from(workflowRunsTable)
    .where(eq(workflowRunsTable.id, outcome.runId))
    .limit(1);
  const [hydrated] = await hydrateWorkflowRuns([row!]);
  res.json(hydrated);
});

// ----------------------------------------------------------------------
// CANCEL a pending run (admin starter only)
// ----------------------------------------------------------------------
router.post("/workflow-runs/:id/cancel", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  assertAdmin(user);
  const params = CancelWorkflowRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CancelWorkflowRunBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const updated = await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.id, params.data.id))
      .for("update")
      .limit(1);
    if (!run) return null;
    if (run.status !== "pending") {
      const err: Error & { status?: number } = new Error(
        "Run is no longer pending.",
      );
      err.status = 409;
      throw err;
    }
    if (run.startedById !== user.id) {
      const err: Error & { status?: number } = new Error(
        "Only the admin who started the run may cancel it.",
      );
      err.status = 403;
      throw err;
    }
    const reason = body.data.reason ?? "";
    const [row] = await tx
      .update(workflowRunsTable)
      .set({
        status: "cancelled",
        resolvedAt: new Date(),
        resolvedById: user.id,
        outcomeReason: reason,
      })
      .where(eq(workflowRunsTable.id, run.id))
      .returning();
    await tx.insert(workflowAuditEventsTable).values({
      workflowId: run.workflowId,
      runId: run.id,
      action: "cancelled",
      detail: { reason },
      changedById: user.id,
    });
    return row;
  });
  if (!updated) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const [hydrated] = await hydrateWorkflowRuns([updated]);
  res.json(hydrated);
});

export default router;
