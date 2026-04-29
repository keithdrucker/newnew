import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  initiativesTable,
  projectsTable,
  departmentsTable,
  usersTable,
  type Initiative as InitiativeRow,
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

const router: IRouter = Router();

type InitiativeStatus =
  | "backlog"
  | "under_review"
  | "approved"
  | "rejected_deferred";

const TERMINAL_STATUSES: ReadonlySet<InitiativeStatus> = new Set([
  "approved",
  "rejected_deferred",
]);

// ---- Auth ----
//
// Mirrors the Projects route: end_users have no access (Initiatives are
// an internal coordination tool). Agents and admins both have full
// access. Specific to Initiatives: a write that would put a row into a
// terminal state is allowed for any agent/admin, but the actual project
// auto-creation always uses the *current* user as the new project's
// owner / suggester so the audit trail makes sense.
function assertAgentOrAdmin(user: SessionUser): void {
  if (user.role !== "admin" && user.role !== "agent") {
    const err: Error & { status?: number } = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
}

// ---- Hydration ----
//
// Resolves department / reporter / assignee / decidedBy names in a
// single query each so the API response shape matches the OpenAPI
// `Initiative` schema (which includes *Name fields).
async function hydrate(rows: InitiativeRow[]) {
  if (rows.length === 0) return [];
  const deptIds = Array.from(
    new Set(
      rows.map((r) => r.departmentId).filter((d): d is number => d != null),
    ),
  );
  const userIds = Array.from(
    new Set(
      [
        ...rows.map((r) => r.reporterId),
        ...rows.map((r) => r.assigneeId),
        ...rows.map((r) => r.decidedById),
      ].filter((u): u is number => u != null),
    ),
  );
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
    reporterName: r.reporterId
      ? userMap.get(r.reporterId)?.name ?? null
      : null,
    assigneeId: r.assigneeId ?? null,
    assigneeName: r.assigneeId
      ? userMap.get(r.assigneeId)?.name ?? null
      : null,
    prosCons: r.prosCons,
    roughCost: r.roughCost,
    expectedBenefit: r.expectedBenefit,
    riskNotes: r.riskNotes,
    decisionReason: r.decisionReason,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    decidedById: r.decidedById ?? null,
    decidedByName: r.decidedById
      ? userMap.get(r.decidedById)?.name ?? null
      : null,
    createdProjectId: r.createdProjectId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
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
  const [created] = await db
    .insert(initiativesTable)
    .values({
      title: body.data.title,
      description: body.data.description ?? "",
      status: "backlog",
      departmentId: body.data.departmentId ?? null,
      // Default reporter is the current user if none specified — keeps
      // the audit trail intact when the form omits it.
      reporterId: body.data.reporterId ?? user.id,
      assigneeId: body.data.assigneeId ?? null,
    })
    .returning();
  const [hydrated] = await hydrate([created]);
  res.status(201).json(hydrated);
});

// ---- UPDATE (incl. status transitions) ----
//
// The interesting logic: transitioning to "approved" must atomically
// create a Project and stamp createdProjectId. Transitions out of a
// terminal state are rejected with 409. Rejecting requires
// decisionReason.
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

  // We do EVERYTHING — read, terminal-state check, decision-reason
  // check, optional project insert, conditional update — inside a
  // single transaction with SELECT ... FOR UPDATE on the initiative
  // row. That serializes concurrent approvals so we can't end up with
  // two auto-created projects for the same initiative, and a stale
  // edit can't sneak past a row that just became terminal.
  type TxOutcome =
    | { kind: "ok"; row: InitiativeRow }
    | { kind: "not_found" }
    | { kind: "terminal"; status: InitiativeStatus }
    | { kind: "needs_reason" };

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

    if (TERMINAL_STATUSES.has(currentStatus)) {
      return { kind: "terminal", status: currentStatus };
    }

    const transitioningToReject =
      incomingStatus === "rejected_deferred" &&
      currentStatus !== "rejected_deferred";
    const newDecisionReason =
      body.data.decisionReason ?? existing.decisionReason;
    if (transitioningToReject && newDecisionReason.trim().length === 0) {
      return { kind: "needs_reason" };
    }

    // Build the patch — field updates first, then status transition
    // stamps. Done inside the tx so we read the freshest row.
    const patch: Partial<typeof initiativesTable.$inferInsert> = {};
    if (body.data.title !== undefined) patch.title = body.data.title;
    if (body.data.description !== undefined)
      patch.description = body.data.description;
    if (body.data.departmentId !== undefined)
      patch.departmentId = body.data.departmentId;
    if (body.data.assigneeId !== undefined)
      patch.assigneeId = body.data.assigneeId;
    if (body.data.prosCons !== undefined) patch.prosCons = body.data.prosCons;
    if (body.data.roughCost !== undefined)
      patch.roughCost = body.data.roughCost;
    if (body.data.expectedBenefit !== undefined)
      patch.expectedBenefit = body.data.expectedBenefit;
    if (body.data.riskNotes !== undefined)
      patch.riskNotes = body.data.riskNotes;
    if (body.data.decisionReason !== undefined)
      patch.decisionReason = body.data.decisionReason;

    let createdProjectId: number | null = null;
    if (
      incomingStatus === "approved" &&
      currentStatus !== "approved"
    ) {
      // Belt-and-suspenders: only ever auto-create if there's no
      // existing project link. We already hold the row lock, so this
      // is just defense-in-depth against a corrupted record.
      if (existing.createdProjectId == null) {
        const departmentId =
          patch.departmentId !== undefined
            ? patch.departmentId
            : existing.departmentId;
        const reasonForProject =
          body.data.decisionReason ?? existing.decisionReason;
        const projectDescription = [
          body.data.description ?? existing.description,
          reasonForProject
            ? `\n\nDecision notes:\n${reasonForProject}`
            : "",
        ]
          .join("")
          .trim();
        const [createdProject] = await tx
          .insert(projectsTable)
          .values({
            name: body.data.title ?? existing.title,
            description: projectDescription,
            status: "active",
            departmentId: departmentId ?? null,
            ownerId: existing.assigneeId ?? user.id,
            suggestedById: existing.reporterId ?? user.id,
            rationale: body.data.expectedBenefit ?? existing.expectedBenefit,
          })
          .returning();
        createdProjectId = createdProject.id;
      } else {
        createdProjectId = existing.createdProjectId;
      }
    }

    if (incomingStatus && incomingStatus !== currentStatus) {
      patch.status = incomingStatus;
      if (TERMINAL_STATUSES.has(incomingStatus)) {
        patch.decidedAt = new Date();
        patch.decidedById = user.id;
        if (createdProjectId !== null) {
          patch.createdProjectId = createdProjectId;
        }
      }
    }

    if (Object.keys(patch).length === 0) return { kind: "ok", row: existing };

    const [row] = await tx
      .update(initiativesTable)
      .set(patch)
      .where(eq(initiativesTable.id, existing.id))
      .returning();
    return { kind: "ok", row };
  });

  if (outcome.kind === "not_found") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (outcome.kind === "terminal") {
    res.status(409).json({
      error: `Initiative is in terminal state "${outcome.status}" and cannot be modified.`,
    });
    return;
  }
  if (outcome.kind === "needs_reason") {
    res.status(400).json({
      error: "decisionReason is required when rejecting/deferring.",
    });
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
