import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  departmentBucketsTable,
  projectCommentsTable,
  projectAuditEventsTable,
  initiativesTable,
  departmentsTable,
  usersTable,
  type TaskLabel,
  type ChecklistItem,
} from "@workspace/db";
import {
  ListProjectsQueryParams,
  ListProjectsResponse,
  CreateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  UpdateProjectBody,
  DeleteProjectParams,
  GetDepartmentBoardParams,
  CreateDepartmentBucketParams,
  CreateDepartmentBucketBody,
  UpdateDepartmentBucketParams,
  UpdateDepartmentBucketBody,
  DeleteDepartmentBucketParams,
  ListProjectCommentsParams,
  CreateProjectCommentParams,
  CreateProjectCommentBody,
  DeleteProjectCommentParams,
  ChangeProjectPhaseBody,
  AddProjectChecklistItemBody,
  UpdateProjectChecklistItemBody,
  ReorderProjectChecklistBody,
} from "@workspace/api-zod";
import { getCurrentUser, type SessionUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";
import {
  getBoardRole,
  modifiableDepartmentIds,
  roleAtLeast,
  visibleDepartmentIds,
} from "../lib/board-access";

const router: IRouter = Router();

type ProjectStatus = "active" | "on_hold" | "completed" | "archived";
type ProjectPhase =
  | "backlog_needs_assignment"
  | "planning"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";
type TaskPriority = "low" | "medium" | "high" | "urgent";

// Allowed phase transitions (the source of truth for the phase
// state machine). Anything not present in this map → 409.
const PHASE_TRANSITIONS: Record<ProjectPhase, ReadonlyArray<ProjectPhase>> = {
  backlog_needs_assignment: ["planning", "cancelled"],
  planning: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["completed", "planning", "on_hold", "cancelled"],
  // Reopen / resume paths.
  completed: ["in_progress"],
  cancelled: ["backlog_needs_assignment"],
  // on_hold can resume to whatever phase it came from
  // (validated dynamically against `previousActivePhase`) or be
  // cancelled outright.
  on_hold: ["planning", "in_progress", "cancelled"],
};

// The seven phase columns every department starts with. Kept in sync with
// the data migration that bootstrapped existing departments.
const DEFAULT_PHASES: Array<{ name: string; color: string }> = [
  { name: "New Suggestions", color: "#94A3B8" },
  { name: "Future Roadmap", color: "#A78BFA" },
  { name: "Backlog", color: "#60A5FA" },
  { name: "Phase 1 - R&D (Go/No-Go)", color: "#F59E0B" },
  { name: "Phase 2 - Preparation & Planning", color: "#FB923C" },
  { name: "Phase 3 - Implementation", color: "#F472B6" },
  { name: "2026 Completed Initiatives", color: "#34D399" },
];

// ---------- Authorization helpers ----------
//
// Postgres SQLSTATE 23505 = unique_violation. Used to convert the
// (department_id, name) unique-index conflict on department_buckets into a
// 409 instead of a 500 when a phase create/rename collides with an existing
// phase in the same department. The unique index itself is required to make
// the GET /departments/:id/board default-bucket bootstrap idempotent under
// concurrent first-reads.
function isUniqueViolation(err: unknown): boolean {
  // node-pg sets `code` directly on its error. Drizzle 0.45 wraps that in a
  // DrizzleQueryError whose underlying pg error is exposed via `.cause`, so
  // we have to peek through one level of wrapping.
  for (
    let cur: unknown = err, depth = 0;
    cur != null && depth < 4;
    cur = (cur as { cause?: unknown }).cause, depth++
  ) {
    if (
      typeof cur === "object" &&
      cur !== null &&
      "code" in cur &&
      (cur as { code?: string }).code === "23505"
    ) {
      return true;
    }
  }
  return false;
}

// A project is an initiative card on a department board. We mirror the
// ticket board access model:
//   - end_user → no access (initiatives are an internal coordination tool).
//   - admin → full access to every project / department.
//   - agent →
//       • If the project has a departmentId, they need at least the
//         requested role on that board (read => any role, write =>
//         "modify"). Membership is resolved via getBoardRole.
//       • If the project has no departmentId (cross-functional work),
//         any agent may view; writes require that the agent has *some*
//         "modify" role on at least one board.
async function authorizeProjectAccess(
  user: SessionUser,
  project: { departmentId: number | null },
  min: "read" | "modify",
): Promise<boolean> {
  if (user.role === "end_user") return false;
  if (user.role === "admin") return true;
  if (user.role !== "agent") return false;

  if (project.departmentId == null) {
    if (min === "read") return true;
    const dept = await modifiableDepartmentIds(user, "modify");
    return dept === null || dept.length > 0;
  }

  const role = await getBoardRole(user, project.departmentId);
  if (min === "read") return role !== null;
  return roleAtLeast(role, "modify");
}

async function authorizeDepartmentAccess(
  user: SessionUser,
  departmentId: number,
  min: "read" | "modify",
): Promise<boolean> {
  if (user.role === "end_user") return false;
  if (user.role === "admin") return true;
  if (user.role !== "agent") return false;
  const role = await getBoardRole(user, departmentId);
  if (min === "read") return role !== null;
  return roleAtLeast(role, "modify");
}

// SQL where-clause that limits a project list to those the caller can read.
async function projectVisibilityWhere(user: SessionUser) {
  if (user.role === "admin") return undefined;
  if (user.role === "end_user") return eq(projectsTable.id, -1); // none
  const visible = await visibleDepartmentIds(user);
  if (visible === null) return undefined;
  if (visible.length === 0) return isNull(projectsTable.departmentId);
  return or(
    isNull(projectsTable.departmentId),
    inArray(projectsTable.departmentId, visible),
  );
}

async function loadProjectForBucket(bucketId: number) {
  const [row] = await db
    .select({
      id: departmentBucketsTable.id,
      departmentId: departmentBucketsTable.departmentId,
    })
    .from(departmentBucketsTable)
    .where(eq(departmentBucketsTable.id, bucketId));
  return row ?? null;
}

// True when a bucket name corresponds to the "completed" pipeline stage.
// Matches "Completed", "Year Completed", "2026 Completed Initiatives", etc.
function isCompletedBucketName(name: string): boolean {
  return /\bcompleted\b/i.test(name);
}

// Strip derived fields (assigneeName) and normalize assigneeId before
// persisting checklist items. Clients send the hydrated DTO back; we
// only store text/done/assigneeId.
function sanitizeChecklist(input: unknown): ChecklistItem[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): ChecklistItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text : "";
    const done = typeof r.done === "boolean" ? r.done : false;
    const rawAssignee = r.assigneeId;
    let assigneeId: number | null = null;
    if (typeof rawAssignee === "number" && Number.isFinite(rawAssignee)) {
      assigneeId = rawAssignee;
    }
    return [{ text, done, assigneeId }];
  });
}

// ---------- DTO helpers ----------

type ProjectRow = typeof projectsTable.$inferSelect;
type BucketRow = typeof departmentBucketsTable.$inferSelect;

function bucketToDto(row: BucketRow) {
  return {
    id: row.id,
    departmentId: row.departmentId,
    name: row.name,
    color: row.color,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  };
}

// Drizzle's `date()` columns are stored as `string` in YYYY-MM-DD
// form, but the OpenAPI spec marks them as `format: date` which the
// generated zod parser hands back as a `Date` (or null/undefined).
// This shim accepts either shape so the route handlers can stay
// agnostic about the codegen output.
function toDateString(
  v: Date | string | null | undefined,
): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

// Convert a stored checklist (which may contain rows that pre-date the
// id+position migration) into a fully-populated, position-sorted array
// with stable ids. Pure: does NOT write back; the route handlers
// persist the normalized array on first mutation.
function normalizeChecklist(raw: ChecklistItem[]): ChecklistItem[] {
  const withMeta = raw.map((item, idx) => ({
    id: item.id ?? randomUUID(),
    position: typeof item.position === "number" ? item.position : idx,
    text: item.text,
    done: item.done,
    assigneeId: item.assigneeId ?? null,
  }));
  withMeta.sort((a, b) => a.position - b.position);
  return withMeta.map((item, idx) => ({ ...item, position: idx }));
}

async function summarizeProjects(rows: ProjectRow[]) {
  if (rows.length === 0) return [];
  const projectIds = rows.map((r) => r.id);
  const deptIdSet = new Set<number>();
  const userIdSet = new Set<number>();
  const bucketIdSet = new Set<number>();
  const initiativeIdSet = new Set<number>();
  for (const r of rows) {
    if (r.departmentId != null) deptIdSet.add(r.departmentId);
    if (r.bucketId != null) bucketIdSet.add(r.bucketId);
    if (r.ownerId != null) userIdSet.add(r.ownerId);
    if (r.suggestedById != null) userIdSet.add(r.suggestedById);
    if (r.linkedInitiativeId != null) initiativeIdSet.add(r.linkedInitiativeId);
    for (const d of (r.impactedDepartmentIds ?? []) as number[]) {
      deptIdSet.add(d);
    }
    for (const item of (r.checklist ?? []) as ChecklistItem[]) {
      if (item.assigneeId != null) userIdSet.add(item.assigneeId);
    }
  }
  const deptIds = Array.from(deptIdSet);
  const userIds = Array.from(userIdSet);
  const bucketIds = Array.from(bucketIdSet);
  const initiativeIds = Array.from(initiativeIdSet);

  const [buckets, depts, users, commentRows, initiatives] = await Promise.all([
    bucketIds.length
      ? db
          .select()
          .from(departmentBucketsTable)
          .where(inArray(departmentBucketsTable.id, bucketIds))
      : Promise.resolve([] as BucketRow[]),
    deptIds.length
      ? db
          .select()
          .from(departmentsTable)
          .where(inArray(departmentsTable.id, deptIds))
      : Promise.resolve([] as (typeof departmentsTable.$inferSelect)[]),
    userIds.length
      ? db.select().from(usersTable).where(inArray(usersTable.id, userIds))
      : Promise.resolve([] as (typeof usersTable.$inferSelect)[]),
    db
      .select({
        projectId: projectCommentsTable.projectId,
        count: sql<number>`count(*)::int`,
      })
      .from(projectCommentsTable)
      .where(inArray(projectCommentsTable.projectId, projectIds))
      .groupBy(projectCommentsTable.projectId),
    initiativeIds.length
      ? db
          .select({
            id: initiativesTable.id,
            title: initiativesTable.title,
          })
          .from(initiativesTable)
          .where(inArray(initiativesTable.id, initiativeIds))
      : Promise.resolve([] as Array<{ id: number; title: string }>),
  ]);

  const bucketMap = new Map(buckets.map((b) => [b.id, b]));
  const deptMap = new Map(depts.map((d) => [d.id, d]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const commentCounts = new Map(commentRows.map((r) => [r.projectId, r.count]));
  const initiativeMap = new Map(initiatives.map((i) => [i.id, i.title]));

  return rows.map((r) => {
    const impactedIds = (r.impactedDepartmentIds ?? []) as number[];
    const impactedNames = impactedIds
      .map((id) => deptMap.get(id)?.name)
      .filter((n): n is string => typeof n === "string");
    const normalized = normalizeChecklist(
      (r.checklist ?? []) as ChecklistItem[],
    );
    const checklist = normalized.map((item) => ({
      id: item.id ?? null,
      position: item.position ?? null,
      text: item.text,
      done: item.done,
      assigneeId: item.assigneeId ?? null,
      assigneeName:
        item.assigneeId != null
          ? (userMap.get(item.assigneeId)?.name ?? null)
          : null,
    }));
    const checklistDone = checklist.filter((c) => c.done).length;
    const bucket = r.bucketId != null ? bucketMap.get(r.bucketId) : null;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      color: r.color,
      phase: r.phase as ProjectPhase,
      previousActivePhase: r.previousActivePhase ?? null,
      status: r.status as ProjectStatus,
      departmentId: r.departmentId ?? null,
      departmentName: r.departmentId
        ? (deptMap.get(r.departmentId)?.name ?? null)
        : null,
      bucketId: r.bucketId ?? null,
      bucketName: bucket?.name ?? null,
      ownerId: r.ownerId ?? null,
      ownerName: r.ownerId ? (userMap.get(r.ownerId)?.name ?? null) : null,
      dueAt: r.dueAt ? r.dueAt.toISOString() : null,
      assignedTeam: r.assignedTeam,
      startDate: r.startDate ?? null,
      endDate: r.endDate ?? null,
      planningNotes: r.planningNotes,
      statusUpdate: r.statusUpdate,
      holdReason: r.holdReason,
      holdNotes: r.holdNotes,
      revisitDate: r.revisitDate ?? null,
      updatedCompletionDate: r.updatedCompletionDate ?? null,
      completionSummary: r.completionSummary,
      keyTakeaway: r.keyTakeaway,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      completedById: r.completedById ?? null,
      completedByName: r.completedById
        ? (userMap.get(r.completedById)?.name ?? null)
        : null,
      cancellationReason: r.cancellationReason,
      linkedInitiativeId: r.linkedInitiativeId ?? null,
      linkedInitiativeTitle:
        r.linkedInitiativeId != null
          ? (initiativeMap.get(r.linkedInitiativeId) ?? null)
          : null,
      suggestedById: r.suggestedById ?? null,
      suggestedByName: r.suggestedById
        ? (userMap.get(r.suggestedById)?.name ?? null)
        : null,
      goal: r.goal,
      implementation: r.implementation,
      rationale: r.rationale,
      impactedDepartmentIds: impactedIds,
      impactedDepartmentNames: impactedNames,
      additionalComments: r.additionalComments,
      completedYear: r.completedYear ?? null,
      labels: (r.labels ?? []) as TaskLabel[],
      priority: r.priority as TaskPriority,
      checklist,
      checklistTotal: checklist.length,
      checklistDone,
      commentCount: commentCounts.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

// Hydrate audit events with the changedBy display name. Used only by
// the project detail endpoint (list endpoint omits audit events to
// keep payloads small).
async function loadAuditEvents(projectId: number) {
  const rows = await db
    .select()
    .from(projectAuditEventsTable)
    .where(eq(projectAuditEventsTable.projectId, projectId))
    .orderBy(desc(projectAuditEventsTable.changedAt));
  if (rows.length === 0) return [];
  const userIds = Array.from(
    new Set(rows.map((r) => r.changedById).filter((v): v is number => v != null)),
  );
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    oldPhase: r.oldPhase ?? null,
    newPhase: r.newPhase ?? null,
    reason: r.reason,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    changedById: r.changedById ?? null,
    changedByName: r.changedById
      ? (userMap.get(r.changedById)?.name ?? null)
      : null,
    changedAt: r.changedAt.toISOString(),
  }));
}

async function detailProject(id: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));
  if (!project) return null;
  const [summary] = await summarizeProjects([project]);
  const auditEvents = await loadAuditEvents(id);
  return { ...summary, auditEvents };
}

// Insert one audit event row. Pass the transaction handle (`tx`)
// when the audit row must be atomic with another write so the two
// rows succeed or fail together. When no `tx` is supplied the row
// is inserted using the default db connection.
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
async function writeAudit(
  executor: DbExecutor,
  projectId: number,
  action: string,
  opts: {
    oldPhase?: string | null;
    newPhase?: string | null;
    reason?: string;
    detail?: Record<string, unknown>;
    changedById: number | null;
  },
) {
  await executor.insert(projectAuditEventsTable).values({
    projectId,
    action,
    oldPhase: opts.oldPhase ?? null,
    newPhase: opts.newPhase ?? null,
    reason: opts.reason ?? "",
    detail: opts.detail ?? {},
    changedById: opts.changedById,
  });
}

// ---------- Routes: Projects ----------

router.get("/projects", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = ListProjectsQueryParams.safeParse(
    coerceQuery(req.query as Record<string, unknown>),
  );
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds: Array<ReturnType<typeof eq>> = [];
  if (params.data.status)
    conds.push(eq(projectsTable.status, params.data.status));
  if (params.data.departmentId != null)
    conds.push(eq(projectsTable.departmentId, params.data.departmentId));

  const visibility = await projectVisibilityWhere(user);
  const where = (() => {
    const all = [...conds];
    if (visibility !== undefined) all.push(visibility);
    if (all.length === 0) return undefined;
    if (all.length === 1) return all[0];
    return and(...all);
  })();

  const baseQuery = db.select().from(projectsTable);
  const rows = await (where ? baseQuery.where(where) : baseQuery).orderBy(
    desc(projectsTable.updatedAt),
  );
  let filtered = rows;
  if (params.data.q) {
    const needle = params.data.q.toLowerCase();
    filtered = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle),
    );
  }
  res.json(ListProjectsResponse.parse(await summarizeProjects(filtered)));
});

router.post("/projects", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Agents can only create projects scoped to a board they can modify
  // (or cross-functional projects with no departmentId).
  if (user.role === "agent" && parsed.data.departmentId != null) {
    const role = await getBoardRole(user, parsed.data.departmentId);
    if (!roleAtLeast(role, "modify")) {
      res.status(403).json({ error: "Forbidden on this board" });
      return;
    }
  }
  // If a bucket is supplied, it must belong to the same department.
  // Cross-functional projects (departmentId == null) cannot live in any
  // department bucket — buckets are department-scoped, so allowing this
  // would let an agent pin a global card to any team's board column.
  let bucketId: number | null = parsed.data.bucketId ?? null;
  let bucketName: string | null = null;
  if (bucketId != null) {
    if (parsed.data.departmentId == null) {
      res.status(400).json({
        error: "Cross-functional projects cannot be assigned to a phase bucket",
      });
      return;
    }
    const bucket = await loadProjectForBucket(bucketId);
    if (!bucket) {
      res.status(400).json({ error: "Unknown phase bucket" });
      return;
    }
    if (bucket.departmentId !== parsed.data.departmentId) {
      res.status(400).json({
        error: "Phase bucket does not belong to this department",
      });
      return;
    }
    const [b] = await db
      .select({ name: departmentBucketsTable.name })
      .from(departmentBucketsTable)
      .where(eq(departmentBucketsTable.id, bucketId));
    bucketName = b?.name ?? null;
  }

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  // Auto-stamp completedYear when card is created in a "Completed" bucket.
  let completedYear = parsed.data.completedYear ?? null;
  if (
    completedYear == null &&
    bucketName != null &&
    isCompletedBucketName(bucketName)
  ) {
    completedYear = new Date().getUTCFullYear();
  }

  // Closeout invariant on direct-create-to-completed (the import flow):
  // a project that lands in "completed" must carry both a Completion
  // Summary and a Key Takeaway, and we auto-capture who/when. Without
  // this guard, importing a finished project would yield a Completed
  // card with no closeout data and no `completedById`.
  const incomingPhase =
    (parsed.data.phase as ProjectPhase | undefined) ??
    "backlog_needs_assignment";
  let completedAtForInsert: Date | null = null;
  let completedByIdForInsert: number | null = null;
  if (incomingPhase === "completed") {
    if (!parsed.data.completionSummary?.trim()) {
      res.status(400).json({
        error:
          "Importing a project as completed requires a completion summary.",
      });
      return;
    }
    if (!parsed.data.keyTakeaway?.trim()) {
      res
        .status(400)
        .json({ error: "Importing a project as completed requires a key takeaway." });
      return;
    }
    completedAtForInsert = new Date();
    completedByIdForInsert = user.id;
  }

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(projectsTable)
      .values({
        name: parsed.data.name,
        description: parsed.data.description ?? "",
        color: parsed.data.color ?? "#4B9CD3",
        phase: incomingPhase,
        status: parsed.data.status ?? "active",
        departmentId: parsed.data.departmentId ?? null,
        bucketId,
        ownerId: parsed.data.ownerId ?? user.id,
        assignedTeam: parsed.data.assignedTeam ?? "",
        startDate: toDateString(parsed.data.startDate) ?? null,
        endDate: toDateString(parsed.data.endDate) ?? null,
        dueAt,
        planningNotes: parsed.data.planningNotes ?? "",
        statusUpdate: parsed.data.statusUpdate ?? "",
        updatedCompletionDate:
          toDateString(parsed.data.updatedCompletionDate) ?? null,
        // Imported "completed" projects can ship a closeout summary &
        // takeaway up-front. Defaults to "" so the column NOT-NULL
        // invariant holds.
        completionSummary: parsed.data.completionSummary ?? "",
        keyTakeaway: parsed.data.keyTakeaway ?? "",
        completedAt: completedAtForInsert,
        completedById: completedByIdForInsert,
        linkedInitiativeId: parsed.data.linkedInitiativeId ?? null,
        suggestedById: parsed.data.suggestedById ?? user.id,
        goal: parsed.data.goal ?? "",
        implementation: parsed.data.implementation ?? "",
        rationale: parsed.data.rationale ?? "",
        impactedDepartmentIds: parsed.data.impactedDepartmentIds ?? [],
        additionalComments: parsed.data.additionalComments ?? "",
        completedYear,
        labels: parsed.data.labels ?? [],
        priority: parsed.data.priority ?? "medium",
        checklist: normalizeChecklist(sanitizeChecklist(parsed.data.checklist)),
      })
      .returning();
    await writeAudit(tx, inserted.id, "created", {
      newPhase: inserted.phase,
      changedById: user.id,
    });
    return inserted;
  });

  const detail = await detailProject(row.id);
  res.status(201).json(detail);
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [project] = await db
    .select({
      id: projectsTable.id,
      departmentId: projectsTable.departmentId,
    })
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, project, "read"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }
  const detail = await detailProject(params.data.id);
  res.json(detail);
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, existing, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }

  // Re-target departmentId? Caller must also have modify on the new dept.
  if (
    parsed.data.departmentId !== undefined &&
    parsed.data.departmentId !== existing.departmentId
  ) {
    if (!(await authorizeProjectAccess(
      user,
      { departmentId: parsed.data.departmentId ?? null },
      "modify",
    ))) {
      res.status(403).json({ error: "Forbidden on target board" });
      return;
    }
  }

  // Resolve the (post-update) department + bucket as a single invariant:
  //   bucketId == null  ||  (departmentId != null && bucket.departmentId === departmentId)
  // This catches every cross-edit:
  //   * caller supplies a bucket from a different dept
  //   * caller flips departmentId without touching bucketId (the existing
  //     bucket would now point at the wrong dept) — we auto-clear bucketId
  //     so the project re-lands in "Unassigned" instead of silently leaking
  //     across boards
  //   * caller pins a bucket on a cross-functional (deptId == null) project
  const departmentChanged =
    parsed.data.departmentId !== undefined &&
    parsed.data.departmentId !== existing.departmentId;
  const targetDeptId =
    parsed.data.departmentId !== undefined
      ? (parsed.data.departmentId ?? null)
      : existing.departmentId;

  let resolvedBucketId: number | null | undefined =
    parsed.data.bucketId !== undefined
      ? parsed.data.bucketId
      : departmentChanged
        ? null // dept moved → drop the now-stale bucket
        : undefined;

  let newBucketName: string | null = null;
  let bucketChanged = false;
  if (resolvedBucketId !== undefined) {
    bucketChanged = resolvedBucketId !== existing.bucketId;
    if (resolvedBucketId == null) {
      newBucketName = null;
    } else {
      if (targetDeptId == null) {
        res.status(400).json({
          error:
            "Cross-functional projects cannot be assigned to a phase bucket",
        });
        return;
      }
      const [bucket] = await db
        .select()
        .from(departmentBucketsTable)
        .where(eq(departmentBucketsTable.id, resolvedBucketId));
      if (!bucket) {
        res.status(400).json({ error: "Unknown phase bucket" });
        return;
      }
      if (bucket.departmentId !== targetDeptId) {
        res.status(400).json({
          error: "Phase bucket does not belong to this department",
        });
        return;
      }
      newBucketName = bucket.name;
    }
  }

  const updates: Partial<typeof projectsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.departmentId !== undefined)
    updates.departmentId = parsed.data.departmentId;
  // Use the resolved (possibly auto-cleared) bucketId, NOT the raw input,
  // so a department change without an explicit bucket reset does not leave
  // the project pinned to a bucket from its old department.
  if (resolvedBucketId !== undefined) updates.bucketId = resolvedBucketId;
  if (parsed.data.ownerId !== undefined) updates.ownerId = parsed.data.ownerId;
  if (parsed.data.assignedTeam !== undefined)
    updates.assignedTeam = parsed.data.assignedTeam;
  if (parsed.data.startDate !== undefined)
    updates.startDate = toDateString(parsed.data.startDate) ?? null;
  if (parsed.data.endDate !== undefined)
    updates.endDate = toDateString(parsed.data.endDate) ?? null;
  if (parsed.data.dueAt !== undefined)
    updates.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (parsed.data.planningNotes !== undefined)
    updates.planningNotes = parsed.data.planningNotes;
  if (parsed.data.statusUpdate !== undefined)
    updates.statusUpdate = parsed.data.statusUpdate;
  if (parsed.data.updatedCompletionDate !== undefined)
    updates.updatedCompletionDate =
      toDateString(parsed.data.updatedCompletionDate) ?? null;
  if (parsed.data.keyTakeaway !== undefined)
    updates.keyTakeaway = parsed.data.keyTakeaway;
  // Closeout integrity: once a project is completed, the closeout
  // Key Takeaway cannot be patched to empty. (Completion Summary
  // isn't part of UpdateProjectInput — it can only be set via
  // POST /phase — so it can't be cleared via PATCH at all.) Re-opening
  // (which goes through POST /phase) is how you intentionally clear
  // these fields.
  if (
    existing.phase === "completed" &&
    parsed.data.keyTakeaway !== undefined &&
    !parsed.data.keyTakeaway.trim()
  ) {
    res.status(400).json({
      error:
        "Key takeaway cannot be cleared on a completed project. " +
        "Reopen the project first.",
    });
    return;
  }
  if (parsed.data.suggestedById !== undefined)
    updates.suggestedById = parsed.data.suggestedById;
  if (parsed.data.goal !== undefined) updates.goal = parsed.data.goal;
  if (parsed.data.implementation !== undefined)
    updates.implementation = parsed.data.implementation;
  if (parsed.data.rationale !== undefined)
    updates.rationale = parsed.data.rationale;
  if (parsed.data.impactedDepartmentIds !== undefined)
    updates.impactedDepartmentIds = parsed.data.impactedDepartmentIds;
  if (parsed.data.additionalComments !== undefined)
    updates.additionalComments = parsed.data.additionalComments;
  if (parsed.data.completedYear !== undefined)
    updates.completedYear = parsed.data.completedYear;
  if (parsed.data.labels !== undefined) updates.labels = parsed.data.labels;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.checklist !== undefined)
    updates.checklist = normalizeChecklist(
      sanitizeChecklist(parsed.data.checklist),
    );
  // NOTE: `phase` is intentionally NOT applied here. All phase
  // transitions go through POST /projects/:id/phase so the audit
  // trail and side-state bookkeeping (previousActivePhase,
  // completedAt, holdReason, etc.) stay atomic.

  // Auto-stamp completedYear when card moves into a "Completed" bucket and
  // clear it when moving out — but only if the caller didn't explicitly set
  // completedYear in this same request.
  if (bucketChanged && parsed.data.completedYear === undefined) {
    if (newBucketName != null && isCompletedBucketName(newBucketName)) {
      if (!existing.completedYear) {
        updates.completedYear = new Date().getUTCFullYear();
      }
    } else {
      updates.completedYear = null;
    }
  }

  const [row] = await db
    .update(projectsTable)
    .set(updates)
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const detail = await detailProject(row.id);
  res.json(detail);
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // FK ON DELETE CASCADE on project_comments will tear those down too.
  const [row] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.sendStatus(204);
});

// ---------- Routes: Phase transitions ----------

// Helper used by every checklist mutation: parse params, authorize,
// load + normalize the checklist, then return everything the handler
// needs. Kept here so the four endpoints (add / patch / delete /
// reorder) stay short and focused.
async function loadProjectForChecklistMutation(
  req: import("express").Request,
  res: import("express").Response,
): Promise<{
  user: SessionUser;
  project: typeof projectsTable.$inferSelect;
  checklist: ChecklistItem[];
} | null> {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return null;
  }
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  if (!(await authorizeProjectAccess(user, project, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return null;
  }
  const checklist = normalizeChecklist((project.checklist ?? []) as ChecklistItem[]);
  return { user, project, checklist };
}

router.post("/projects/:id/phase", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const parsed = ChangeProjectPhaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, existing, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }

  const from = existing.phase as ProjectPhase;
  const to = parsed.data.to as ProjectPhase;
  if (from === to) {
    res.status(409).json({ error: `Project is already in phase ${to}` });
    return;
  }

  // Validate the legal transition. on_hold → resume requires the
  // target to match `previousActivePhase` (or fall back to `planning`
  // if the on-hold record was created before this field existed).
  const allowed = PHASE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    res.status(409).json({
      error: `Cannot move from ${from} to ${to}`,
    });
    return;
  }
  if (from === "on_hold" && to !== "cancelled") {
    const expected =
      (existing.previousActivePhase as ProjectPhase | null) ?? "planning";
    if (to !== expected) {
      res.status(409).json({
        error:
          `Resume from on_hold must return to ${expected} ` +
          `(was: previousActivePhase=${existing.previousActivePhase ?? "null"})`,
      });
      return;
    }
  }

  // ---- Backlog → Planning gate: require start + anticipated
  //      completion dates with anticipated > start. The dates live on
  //      the project itself (saved during Backlog edits), so we
  //      validate against `existing` rather than the request body. ----
  if (from === "backlog_needs_assignment" && to === "planning") {
    if (!existing.startDate || !existing.endDate) {
      res.status(400).json({
        error:
          "Start date and anticipated completion date are required " +
          "before moving to Planning.",
      });
      return;
    }
    if (existing.endDate <= existing.startDate) {
      res.status(400).json({
        error: "Anticipated completion date must be after start date.",
      });
      return;
    }
  }

  // ---- Closeout gate: require BOTH summary and key takeaway when
  //      moving into Completed. We accept either values from the
  //      request body OR pre-existing values on the row (so a project
  //      can be drafted in Backlog and re-promoted later). ----
  if (to === "completed") {
    const summary = (
      parsed.data.completionSummary ?? existing.completionSummary ?? ""
    ).trim();
    const takeaway = (
      parsed.data.keyTakeaway ?? existing.keyTakeaway ?? ""
    ).trim();
    if (!summary) {
      res.status(400).json({ error: "Completion summary is required." });
      return;
    }
    if (!takeaway) {
      res.status(400).json({
        error: "Key takeaway / lesson learned is required.",
      });
      return;
    }
  }

  const updates: Partial<typeof projectsTable.$inferInsert> = { phase: to };
  let action = "phase_changed";

  if (to === "on_hold") {
    // Going on hold from an active phase — remember where to come back to.
    updates.previousActivePhase = from;
    if (parsed.data.holdReason !== undefined)
      updates.holdReason = parsed.data.holdReason;
    if (parsed.data.holdNotes !== undefined)
      updates.holdNotes = parsed.data.holdNotes;
    if (parsed.data.revisitDate !== undefined)
      updates.revisitDate = toDateString(parsed.data.revisitDate) ?? null;
    action = "hold_started";
  } else if (from === "on_hold") {
    // Resuming or cancelling out of on_hold — clear the bookkeeping.
    updates.previousActivePhase = null;
    if (to !== "cancelled") action = "hold_resumed";
  }

  if (to === "completed") {
    updates.completedAt = new Date();
    updates.completedById = user.id;
    if (parsed.data.completionSummary !== undefined)
      updates.completionSummary = parsed.data.completionSummary;
    if (parsed.data.keyTakeaway !== undefined)
      updates.keyTakeaway = parsed.data.keyTakeaway;
    // Mirror to legacy status for back-compat.
    updates.status = "completed";
    action = "completed";
  } else if (to === "cancelled") {
    if (parsed.data.cancellationReason !== undefined)
      updates.cancellationReason = parsed.data.cancellationReason;
    updates.status = "archived";
    action = "cancelled";
  } else if (from === "completed" || from === "cancelled") {
    // Reopen → clear the closing-side fields and remap legacy status.
    if (from === "completed") updates.completedAt = null;
    updates.status = to === "in_progress" ? "active" : "active";
    action = "reopened";
  } else if (to === "in_progress") {
    updates.status = "active";
    if (parsed.data.statusUpdate !== undefined)
      updates.statusUpdate = parsed.data.statusUpdate;
  } else if (to === "planning") {
    updates.status = "active";
    if (parsed.data.planningNotes !== undefined)
      updates.planningNotes = parsed.data.planningNotes;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(projectsTable)
      .set(updates)
      .where(eq(projectsTable.id, id));
    await writeAudit(tx, id, action, {
      oldPhase: from,
      newPhase: to,
      reason: parsed.data.reason ?? "",
      changedById: user.id,
    });
  });

  const detail = await detailProject(id);
  res.json(detail);
});

// ---------- Routes: Checklist CRUD ----------

router.post("/projects/:id/checklist", async (req, res): Promise<void> => {
  const ctx = await loadProjectForChecklistMutation(req, res);
  if (!ctx) return;
  const parsed = AddProjectChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const text = parsed.data.text.trim();
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const newItem: ChecklistItem = {
    id: randomUUID(),
    position: ctx.checklist.length,
    text,
    done: false,
    assigneeId: parsed.data.assigneeId ?? null,
  };
  // Honour explicit position by inserting and renumbering.
  const next = [...ctx.checklist];
  if (
    typeof parsed.data.position === "number" &&
    parsed.data.position >= 0 &&
    parsed.data.position < next.length
  ) {
    next.splice(parsed.data.position, 0, newItem);
  } else {
    next.push(newItem);
  }
  const renumbered = next.map((item, idx) => ({ ...item, position: idx }));
  await db.transaction(async (tx) => {
    await tx
      .update(projectsTable)
      .set({ checklist: renumbered })
      .where(eq(projectsTable.id, ctx.project.id));
    await writeAudit(tx, ctx.project.id, "checklist_added", {
      detail: { itemId: newItem.id, text },
      changedById: ctx.user.id,
    });
  });
  const detail = await detailProject(ctx.project.id);
  res.json(detail);
});

router.patch(
  "/projects/:id/checklist/:itemId",
  async (req, res): Promise<void> => {
    const ctx = await loadProjectForChecklistMutation(req, res);
    if (!ctx) return;
    const itemId = req.params.itemId;
    const parsed = UpdateProjectChecklistItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const idx = ctx.checklist.findIndex((it) => it.id === itemId);
    if (idx < 0) {
      res.status(404).json({ error: "Checklist item not found" });
      return;
    }
    const before = ctx.checklist[idx];
    const next = [...ctx.checklist];
    const updated: ChecklistItem = {
      ...before,
      text: parsed.data.text !== undefined ? parsed.data.text : before.text,
      done: parsed.data.done !== undefined ? parsed.data.done : before.done,
      assigneeId:
        parsed.data.assigneeId !== undefined
          ? parsed.data.assigneeId
          : (before.assigneeId ?? null),
    };
    next[idx] = updated;

    // Optional reposition: pluck and re-insert, then renumber.
    let positioned = next;
    if (
      typeof parsed.data.position === "number" &&
      parsed.data.position !== idx
    ) {
      positioned = next.filter((_, i) => i !== idx);
      const target = Math.max(0, Math.min(positioned.length, parsed.data.position));
      positioned.splice(target, 0, updated);
    }
    const renumbered = positioned.map((item, i) => ({ ...item, position: i }));
    // Pick the most specific audit action so the History panel can
    // render a meaningful one-liner.
    let action = "checklist_edited";
    if (parsed.data.done !== undefined && parsed.data.done !== before.done) {
      action = parsed.data.done ? "checklist_checked" : "checklist_unchecked";
    }
    await db.transaction(async (tx) => {
      await tx
        .update(projectsTable)
        .set({ checklist: renumbered })
        .where(eq(projectsTable.id, ctx.project.id));
      await writeAudit(tx, ctx.project.id, action, {
        detail: { itemId, text: updated.text },
        changedById: ctx.user.id,
      });
    });

    const detail = await detailProject(ctx.project.id);
    res.json(detail);
  },
);

router.delete(
  "/projects/:id/checklist/:itemId",
  async (req, res): Promise<void> => {
    const ctx = await loadProjectForChecklistMutation(req, res);
    if (!ctx) return;
    const itemId = req.params.itemId;
    const idx = ctx.checklist.findIndex((it) => it.id === itemId);
    if (idx < 0) {
      res.status(404).json({ error: "Checklist item not found" });
      return;
    }
    const removed = ctx.checklist[idx];
    const next = ctx.checklist
      .filter((_, i) => i !== idx)
      .map((item, i) => ({ ...item, position: i }));
    await db.transaction(async (tx) => {
      await tx
        .update(projectsTable)
        .set({ checklist: next })
        .where(eq(projectsTable.id, ctx.project.id));
      await writeAudit(tx, ctx.project.id, "checklist_removed", {
        detail: { itemId, text: removed.text },
        changedById: ctx.user.id,
      });
    });
    const detail = await detailProject(ctx.project.id);
    res.json(detail);
  },
);

router.post(
  "/projects/:id/checklist/reorder",
  async (req, res): Promise<void> => {
    const ctx = await loadProjectForChecklistMutation(req, res);
    if (!ctx) return;
    const parsed = ReorderProjectChecklistBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const ids = parsed.data.itemIds;
    const knownIds = new Set(ctx.checklist.map((it) => it.id));
    if (
      ids.length !== ctx.checklist.length ||
      !ids.every((id) => knownIds.has(id))
    ) {
      res
        .status(400)
        .json({ error: "itemIds must be a permutation of this project's items" });
      return;
    }
    const byId = new Map(ctx.checklist.map((it) => [it.id, it]));
    const next = ids.map((id, i) => ({
      ...(byId.get(id) as ChecklistItem),
      position: i,
    }));
    await db.transaction(async (tx) => {
      await tx
        .update(projectsTable)
        .set({ checklist: next })
        .where(eq(projectsTable.id, ctx.project.id));
      await writeAudit(tx, ctx.project.id, "checklist_reordered", {
        detail: { itemIds: ids },
        changedById: ctx.user.id,
      });
    });
    const detail = await detailProject(ctx.project.id);
    res.json(detail);
  },
);

// ---------- Routes: Department board (Kanban) ----------

router.get("/departments/:id/board", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = GetDepartmentBoardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [dept] = await db
    .select()
    .from(departmentsTable)
    .where(eq(departmentsTable.id, params.data.id));
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  if (!(await authorizeDepartmentAccess(user, dept.id, "read"))) {
    res.status(403).json({ error: "Forbidden on this board" });
    return;
  }

  // Bootstrap default phases on first read so brand-new departments get the
  // standard pipeline without an extra admin step.
  let buckets = await db
    .select()
    .from(departmentBucketsTable)
    .where(eq(departmentBucketsTable.departmentId, dept.id))
    .orderBy(asc(departmentBucketsTable.position), asc(departmentBucketsTable.id));
  if (buckets.length === 0) {
    // Two concurrent first-reads can both hit the empty-buckets branch and
    // race to insert the default phases, producing duplicate columns. The
    // (department_id, name) unique index plus onConflictDoNothing makes the
    // seed idempotent so the loser of the race becomes a no-op.
    await db
      .insert(departmentBucketsTable)
      .values(
        DEFAULT_PHASES.map((p, idx) => ({
          departmentId: dept.id,
          name: p.name,
          color: p.color,
          position: idx,
        })),
      )
      .onConflictDoNothing({
        target: [
          departmentBucketsTable.departmentId,
          departmentBucketsTable.name,
        ],
      });
    buckets = await db
      .select()
      .from(departmentBucketsTable)
      .where(eq(departmentBucketsTable.departmentId, dept.id))
      .orderBy(asc(departmentBucketsTable.position), asc(departmentBucketsTable.id));
  }

  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.departmentId, dept.id))
    .orderBy(desc(projectsTable.updatedAt));

  const summaries = await summarizeProjects(projects);
  const byBucket = new Map<number, typeof summaries>();
  const unassigned: typeof summaries = [];
  for (const p of summaries) {
    if (p.bucketId == null) {
      unassigned.push(p);
    } else {
      const list = byBucket.get(p.bucketId) ?? [];
      list.push(p);
      byBucket.set(p.bucketId, list);
    }
  }

  res.json({
    departmentId: dept.id,
    departmentName: dept.name,
    columns: buckets.map((b) => ({
      ...bucketToDto(b),
      projects: byBucket.get(b.id) ?? [],
    })),
    unassigned,
  });
});

// ---------- Routes: Department-bucket CRUD ----------

router.post("/departments/:id/buckets", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = CreateDepartmentBucketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateDepartmentBucketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [dept] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.id, params.data.id));
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  if (!(await authorizeDepartmentAccess(user, dept.id, "modify"))) {
    res.status(403).json({ error: "Forbidden on this board" });
    return;
  }
  const [{ value: maxPos }] = await db
    .select({ value: max(departmentBucketsTable.position) })
    .from(departmentBucketsTable)
    .where(eq(departmentBucketsTable.departmentId, dept.id));
  // Translate the (department_id, name) unique-index violation that
  // backstops the bootstrap race into a clean 409 instead of a 500 when
  // an admin manually creates a bucket with a duplicate name.
  let row: BucketRow;
  try {
    [row] = await db
      .insert(departmentBucketsTable)
      .values({
        departmentId: dept.id,
        name: parsed.data.name,
        color: parsed.data.color ?? "#4B9CD3",
        position: (maxPos ?? -1) + 1,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({
        error: "A phase with this name already exists for this department",
      });
      return;
    }
    throw err;
  }
  res.status(201).json(bucketToDto(row));
});

router.patch("/department-buckets/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateDepartmentBucketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDepartmentBucketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const bucket = await loadProjectForBucket(params.data.id);
  if (!bucket) {
    res.status(404).json({ error: "Bucket not found" });
    return;
  }
  if (!(await authorizeDepartmentAccess(user, bucket.departmentId, "modify"))) {
    res.status(403).json({ error: "Forbidden on this board" });
    return;
  }

  // Capture the current name to detect transitions across the "completed"
  // boundary so we can reconcile completedYear on every project sitting
  // in this bucket.
  const [existingBucket] = await db
    .select({ name: departmentBucketsTable.name })
    .from(departmentBucketsTable)
    .where(eq(departmentBucketsTable.id, params.data.id));

  const updates: Partial<typeof departmentBucketsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.position !== undefined) updates.position = parsed.data.position;

  // Same unique-violation translation as the create path: a rename that
  // collides with another phase in the same department becomes 409, not 500.
  let row: BucketRow | undefined;
  try {
    [row] = await db
      .update(departmentBucketsTable)
      .set(updates)
      .where(eq(departmentBucketsTable.id, params.data.id))
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({
        error: "A phase with this name already exists for this department",
      });
      return;
    }
    throw err;
  }
  if (!row) {
    res.status(404).json({ error: "Bucket not found" });
    return;
  }

  if (existingBucket && parsed.data.name !== undefined) {
    const wasCompleted = isCompletedBucketName(existingBucket.name);
    const isCompleted = isCompletedBucketName(row.name);
    if (!wasCompleted && isCompleted) {
      await db
        .update(projectsTable)
        .set({ completedYear: new Date().getUTCFullYear() })
        .where(
          and(
            eq(projectsTable.bucketId, row.id),
            isNull(projectsTable.completedYear),
          ),
        );
    } else if (wasCompleted && !isCompleted) {
      await db
        .update(projectsTable)
        .set({ completedYear: null })
        .where(eq(projectsTable.bucketId, row.id));
    }
  }

  res.json(bucketToDto(row));
});

router.delete("/department-buckets/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = DeleteDepartmentBucketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const bucket = await loadProjectForBucket(params.data.id);
  if (!bucket) {
    res.status(404).json({ error: "Bucket not found" });
    return;
  }
  if (!(await authorizeDepartmentAccess(user, bucket.departmentId, "modify"))) {
    res.status(403).json({ error: "Forbidden on this board" });
    return;
  }
  // FK is set null, so projects that lived in this bucket simply move to
  // the "Unassigned" lane on the board.
  const [row] = await db
    .delete(departmentBucketsTable)
    .where(eq(departmentBucketsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Bucket not found" });
    return;
  }
  res.sendStatus(204);
});

// ---------- Routes: Project comments (activity log) ----------

function commentToDto(
  row: typeof projectCommentsTable.$inferSelect,
  authorMap: Map<number, { id: number; name: string }>,
) {
  return {
    id: row.id,
    projectId: row.projectId,
    authorId: row.authorId ?? null,
    authorName: row.authorId
      ? (authorMap.get(row.authorId)?.name ?? null)
      : null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadProjectForRoute(id: number) {
  const [row] = await db
    .select({
      id: projectsTable.id,
      departmentId: projectsTable.departmentId,
    })
    .from(projectsTable)
    .where(eq(projectsTable.id, id));
  return row ?? null;
}

router.get("/projects/:id/comments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = ListProjectCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await loadProjectForRoute(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, project, "read"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }
  const rows = await db
    .select()
    .from(projectCommentsTable)
    .where(eq(projectCommentsTable.projectId, params.data.id))
    .orderBy(asc(projectCommentsTable.createdAt), asc(projectCommentsTable.id));

  const authorIds = Array.from(
    new Set(rows.map((r) => r.authorId).filter((d): d is number => d != null)),
  );
  const authors = authorIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, authorIds))
    : [];
  const authorMap = new Map(authors.map((u) => [u.id, u]));
  res.json(rows.map((r) => commentToDto(r, authorMap)));
});

router.post("/projects/:id/comments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = CreateProjectCommentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateProjectCommentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data.body.trim();
  if (!body) {
    res.status(400).json({ error: "Comment body is required" });
    return;
  }
  const project = await loadProjectForRoute(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, project, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }
  const [row] = await db
    .insert(projectCommentsTable)
    .values({
      projectId: params.data.id,
      authorId: user.id,
      body,
    })
    .returning();
  const authorMap = new Map<number, { id: number; name: string }>([
    [user.id, { id: user.id, name: user.name }],
  ]);
  res.status(201).json(commentToDto(row, authorMap));
});

router.delete(
  "/projects/:id/comments/:commentId",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    if (user.role === "end_user") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const params = DeleteProjectCommentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await loadProjectForRoute(params.data.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const [comment] = await db
      .select()
      .from(projectCommentsTable)
      .where(eq(projectCommentsTable.id, params.data.commentId));
    if (!comment || comment.projectId !== params.data.id) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    // Authorization model: every caller — including the comment's own
    // author — must at minimum be able to READ the project (so an end-user
    // who lost board access can no longer reach back to scrub their old
    // comments, and a stranger can never delete other people's). On top of
    // read access, deleting someone else's comment additionally requires
    // modify access on the project.
    if (!(await authorizeProjectAccess(user, project, "read"))) {
      res.status(403).json({ error: "Forbidden on this project" });
      return;
    }
    const isAuthor = comment.authorId === user.id;
    if (!isAuthor) {
      if (!(await authorizeProjectAccess(user, project, "modify"))) {
        res.status(403).json({ error: "Forbidden on this project" });
        return;
      }
    }
    await db
      .delete(projectCommentsTable)
      .where(eq(projectCommentsTable.id, params.data.commentId));
    res.sendStatus(204);
  },
);

export default router;
