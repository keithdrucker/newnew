import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectBucketsTable,
  projectTasksTable,
  projectTaskCommentsTable,
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
  CreateProjectBucketParams,
  CreateProjectBucketBody,
  UpdateProjectBucketParams,
  UpdateProjectBucketBody,
  DeleteProjectBucketParams,
  CreateProjectTaskParams,
  CreateProjectTaskBody,
  UpdateProjectTaskParams,
  UpdateProjectTaskBody,
  DeleteProjectTaskParams,
  ListProjectTaskCommentsParams,
  CreateProjectTaskCommentParams,
  CreateProjectTaskCommentBody,
  DeleteProjectTaskCommentParams,
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
type TaskPriority = "low" | "medium" | "high" | "urgent";

// ---------- Authorization helpers ----------
//
// A project is a board of work. We mirror the ticket board access model:
//   - end_user → no access (projects are an internal coordination tool).
//   - admin → full access to every project.
//   - agent →
//       • If the project has a departmentId, they need at least the
//         requested role on that board (read => any role, write =>
//         "modify"). Membership is resolved via getBoardRole.
//       • If the project has no departmentId (cross-functional work),
//         any agent may view; writes require that the agent has *some*
//         "modify" role on at least one board (so end_user-but-promoted
//         demo seats still can't sneak through).
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
      id: projectsTable.id,
      departmentId: projectsTable.departmentId,
      bucketProjectId: projectBucketsTable.projectId,
    })
    .from(projectBucketsTable)
    .innerJoin(projectsTable, eq(projectBucketsTable.projectId, projectsTable.id))
    .where(eq(projectBucketsTable.id, bucketId));
  return row ?? null;
}

async function loadProjectForTask(taskId: number) {
  const [row] = await db
    .select({
      id: projectsTable.id,
      departmentId: projectsTable.departmentId,
      taskBucketId: projectTasksTable.bucketId,
    })
    .from(projectTasksTable)
    .innerJoin(projectsTable, eq(projectTasksTable.projectId, projectsTable.id))
    .where(eq(projectTasksTable.id, taskId));
  return row ?? null;
}

// ---------- DTO helpers ----------

function toTaskDto(
  row: typeof projectTasksTable.$inferSelect,
  userMap: Map<number, { id: number; name: string }>,
  deptMap?: Map<number, { id: number; name: string }>,
  commentCounts?: Map<number, number>,
) {
  const impactedIds = (row.impactedDepartmentIds ?? []) as number[];
  const impactedNames = deptMap
    ? impactedIds
        .map((id) => deptMap.get(id)?.name)
        .filter((n): n is string => typeof n === "string")
    : [];
  const rawChecklist = (row.checklist ?? []) as ChecklistItem[];
  const checklist = rawChecklist.map((item) => ({
    text: item.text,
    done: item.done,
    assigneeId: item.assigneeId ?? null,
    assigneeName:
      item.assigneeId != null
        ? (userMap.get(item.assigneeId)?.name ?? null)
        : null,
  }));
  return {
    id: row.id,
    projectId: row.projectId,
    bucketId: row.bucketId,
    title: row.title,
    description: row.description,
    labels: (row.labels ?? []) as TaskLabel[],
    checklist,
    assigneeId: row.assigneeId ?? null,
    assigneeName: row.assigneeId
      ? (userMap.get(row.assigneeId)?.name ?? null)
      : null,
    priority: row.priority as TaskPriority,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    position: row.position,
    completed: row.completed,
    suggestedById: row.suggestedById ?? null,
    suggestedByName: row.suggestedById
      ? (userMap.get(row.suggestedById)?.name ?? null)
      : null,
    goal: row.goal,
    implementation: row.implementation,
    rationale: row.rationale,
    impactedDepartmentIds: impactedIds,
    impactedDepartmentNames: impactedNames,
    additionalComments: row.additionalComments,
    completedYear: row.completedYear ?? null,
    commentCount: commentCounts?.get(row.id) ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// True when a bucket name corresponds to the "completed" pipeline stage.
// Matches "Completed", "Year Completed", "Year Completed 2025", etc., case-insensitive.
function isCompletedBucketName(name: string): boolean {
  return /\bcompleted\b/i.test(name);
}

// Strip derived fields (assigneeName) and normalize assigneeId before
// persisting checklist items. Clients may send the hydrated DTO back; we
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

async function summarizeProjects(
  rows: (typeof projectsTable.$inferSelect)[],
) {
  if (rows.length === 0) return [];
  const projectIds = rows.map((r) => r.id);
  const deptIds = Array.from(
    new Set(
      rows.map((r) => r.departmentId).filter((d): d is number => d != null),
    ),
  );
  const userIds = Array.from(
    new Set(rows.map((r) => r.ownerId).filter((d): d is number => d != null)),
  );

  const [buckets, tasks, depts, users] = await Promise.all([
    db
      .select()
      .from(projectBucketsTable)
      .where(inArray(projectBucketsTable.projectId, projectIds)),
    db
      .select()
      .from(projectTasksTable)
      .where(inArray(projectTasksTable.projectId, projectIds)),
    deptIds.length
      ? db
          .select()
          .from(departmentsTable)
          .where(inArray(departmentsTable.id, deptIds))
      : Promise.resolve([] as (typeof departmentsTable.$inferSelect)[]),
    userIds.length
      ? db.select().from(usersTable).where(inArray(usersTable.id, userIds))
      : Promise.resolve([] as (typeof usersTable.$inferSelect)[]),
  ]);

  const bucketCount = new Map<number, number>();
  for (const b of buckets) {
    bucketCount.set(b.projectId, (bucketCount.get(b.projectId) ?? 0) + 1);
  }
  const taskCount = new Map<number, number>();
  const completedCount = new Map<number, number>();
  for (const t of tasks) {
    taskCount.set(t.projectId, (taskCount.get(t.projectId) ?? 0) + 1);
    if (t.completed) {
      completedCount.set(
        t.projectId,
        (completedCount.get(t.projectId) ?? 0) + 1,
      );
    }
  }
  const deptMap = new Map(depts.map((d) => [d.id, d]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    status: r.status as ProjectStatus,
    departmentId: r.departmentId ?? null,
    departmentName: r.departmentId
      ? (deptMap.get(r.departmentId)?.name ?? null)
      : null,
    ownerId: r.ownerId ?? null,
    ownerName: r.ownerId ? (userMap.get(r.ownerId)?.name ?? null) : null,
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    bucketCount: bucketCount.get(r.id) ?? 0,
    taskCount: taskCount.get(r.id) ?? 0,
    completedTaskCount: completedCount.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

async function detailProject(id: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));
  if (!project) return null;

  const [summary] = await summarizeProjects([project]);

  const [buckets, tasks] = await Promise.all([
    db
      .select()
      .from(projectBucketsTable)
      .where(eq(projectBucketsTable.projectId, id))
      .orderBy(asc(projectBucketsTable.position), asc(projectBucketsTable.id)),
    db
      .select()
      .from(projectTasksTable)
      .where(eq(projectTasksTable.projectId, id))
      .orderBy(asc(projectTasksTable.position), asc(projectTasksTable.id)),
  ]);

  // Hydrate names for: assignees, suggesters, impacted departments,
  // plus comment counts per task.
  const userIds = new Set<number>();
  const deptIds = new Set<number>();
  for (const t of tasks) {
    if (t.assigneeId) userIds.add(t.assigneeId);
    if (t.suggestedById) userIds.add(t.suggestedById);
    for (const d of (t.impactedDepartmentIds ?? []) as number[]) deptIds.add(d);
    // Per-checklist-item assignees can differ from the task assignee.
    for (const item of (t.checklist ?? []) as ChecklistItem[]) {
      if (item.assigneeId != null) userIds.add(item.assigneeId);
    }
  }
  const taskIds = tasks.map((t) => t.id);

  const [users, depts, commentRows] = await Promise.all([
    userIds.size
      ? db
          .select()
          .from(usersTable)
          .where(inArray(usersTable.id, Array.from(userIds)))
      : Promise.resolve([] as (typeof usersTable.$inferSelect)[]),
    deptIds.size
      ? db
          .select()
          .from(departmentsTable)
          .where(inArray(departmentsTable.id, Array.from(deptIds)))
      : Promise.resolve([] as (typeof departmentsTable.$inferSelect)[]),
    taskIds.length
      ? db
          .select({
            taskId: projectTaskCommentsTable.taskId,
            count: sql<number>`count(*)::int`,
          })
          .from(projectTaskCommentsTable)
          .where(inArray(projectTaskCommentsTable.taskId, taskIds))
          .groupBy(projectTaskCommentsTable.taskId)
      : Promise.resolve([] as { taskId: number; count: number }[]),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const deptMap = new Map(depts.map((d) => [d.id, d]));
  const commentCounts = new Map(commentRows.map((r) => [r.taskId, r.count]));

  const tasksByBucket = new Map<number, typeof tasks>();
  for (const t of tasks) {
    const list = tasksByBucket.get(t.bucketId) ?? [];
    list.push(t);
    tasksByBucket.set(t.bucketId, list);
  }

  return {
    ...summary,
    buckets: buckets.map((b) => ({
      id: b.id,
      projectId: b.projectId,
      name: b.name,
      position: b.position,
      createdAt: b.createdAt.toISOString(),
      tasks: (tasksByBucket.get(b.id) ?? []).map((t) =>
        toTaskDto(t, userMap, deptMap, commentCounts),
      ),
    })),
  };
}

// ---------- Routes ----------

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
  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  const [row] = await db
    .insert(projectsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      color: parsed.data.color ?? "#4B9CD3",
      status: parsed.data.status ?? "active",
      departmentId: parsed.data.departmentId ?? null,
      ownerId: parsed.data.ownerId ?? user.id,
      dueAt,
    })
    .returning();

  // Seed default buckets to mirror the EW Howell initiative pipeline.
  await db.insert(projectBucketsTable).values([
    { projectId: row.id, name: "New Suggestions", position: 0 },
    { projectId: row.id, name: "Future Roadmap", position: 1 },
    { projectId: row.id, name: "Backlog", position: 2 },
    { projectId: row.id, name: "Phase 1 - R&D (Go/No-Go)", position: 3 },
    { projectId: row.id, name: "Phase 2 - Preparation & Planning", position: 4 },
    { projectId: row.id, name: "Phase 3 - Implementation", position: 5 },
    { projectId: row.id, name: "Completed", position: 6 },
  ]);

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
    .select({
      id: projectsTable.id,
      departmentId: projectsTable.departmentId,
    })
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

  const updates: Partial<typeof projectsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.departmentId !== undefined)
    updates.departmentId = parsed.data.departmentId;
  if (parsed.data.ownerId !== undefined) updates.ownerId = parsed.data.ownerId;
  if (parsed.data.dueAt !== undefined)
    updates.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;

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
  // FK ON DELETE CASCADE will tear down buckets and tasks.
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

router.post("/projects/:id/buckets", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = CreateProjectBucketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateProjectBucketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
  if (!(await authorizeProjectAccess(user, project, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }
  const [{ value: maxPos }] = await db
    .select({ value: max(projectBucketsTable.position) })
    .from(projectBucketsTable)
    .where(eq(projectBucketsTable.projectId, params.data.id));
  const [row] = await db
    .insert(projectBucketsTable)
    .values({
      projectId: params.data.id,
      name: parsed.data.name,
      position: (maxPos ?? -1) + 1,
    })
    .returning();
  res.status(201).json({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/project-buckets/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateProjectBucketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProjectBucketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const project = await loadProjectForBucket(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Bucket not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, project, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }
  const updates: Partial<typeof projectBucketsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.position !== undefined) updates.position = parsed.data.position;

  // Capture pre-update name so we can detect a transition across the
  // "completed" boundary and reconcile completedYear on tasks in this bucket.
  const [existingBucket] = await db
    .select({ name: projectBucketsTable.name })
    .from(projectBucketsTable)
    .where(eq(projectBucketsTable.id, params.data.id));

  const [row] = await db
    .update(projectBucketsTable)
    .set(updates)
    .where(eq(projectBucketsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Bucket not found" });
    return;
  }

  if (existingBucket && parsed.data.name !== undefined) {
    const wasCompleted = isCompletedBucketName(existingBucket.name);
    const isCompleted = isCompletedBucketName(row.name);
    if (!wasCompleted && isCompleted) {
      // Stamp current year on every task in this bucket that's missing one.
      await db
        .update(projectTasksTable)
        .set({ completedYear: new Date().getUTCFullYear() })
        .where(
          and(
            eq(projectTasksTable.bucketId, row.id),
            isNull(projectTasksTable.completedYear),
          ),
        );
    } else if (wasCompleted && !isCompleted) {
      // Clear completedYear on tasks now back in an in-flight phase.
      await db
        .update(projectTasksTable)
        .set({ completedYear: null })
        .where(eq(projectTasksTable.bucketId, row.id));
    }
  }

  res.json({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/project-buckets/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = DeleteProjectBucketParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await loadProjectForBucket(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Bucket not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, project, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }
  // FK ON DELETE CASCADE handles tasks.
  const [row] = await db
    .delete(projectBucketsTable)
    .where(eq(projectBucketsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Bucket not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/projects/:id/tasks", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = CreateProjectTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateProjectTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
  if (!(await authorizeProjectAccess(user, project, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }

  // Verify the bucket belongs to this project so we don't end up with
  // orphaned cards floating across boards.
  const [bucket] = await db
    .select()
    .from(projectBucketsTable)
    .where(eq(projectBucketsTable.id, parsed.data.bucketId));
  if (!bucket || bucket.projectId !== params.data.id) {
    res.status(400).json({ error: "Bucket does not belong to this project" });
    return;
  }

  const [{ value: maxPos }] = await db
    .select({ value: max(projectTasksTable.position) })
    .from(projectTasksTable)
    .where(eq(projectTasksTable.bucketId, parsed.data.bucketId));

  const initialCompletedYear = isCompletedBucketName(bucket.name)
    ? new Date().getUTCFullYear()
    : null;

  const [row] = await db
    .insert(projectTasksTable)
    .values({
      projectId: params.data.id,
      bucketId: parsed.data.bucketId,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      labels: parsed.data.labels ?? [],
      checklist: sanitizeChecklist(parsed.data.checklist),
      assigneeId: parsed.data.assigneeId ?? null,
      priority: parsed.data.priority ?? "medium",
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      position: (maxPos ?? -1) + 1,
      completed: false,
      suggestedById: parsed.data.suggestedById ?? null,
      goal: parsed.data.goal ?? "",
      implementation: parsed.data.implementation ?? "",
      rationale: parsed.data.rationale ?? "",
      impactedDepartmentIds: parsed.data.impactedDepartmentIds ?? [],
      additionalComments: parsed.data.additionalComments ?? "",
      completedYear: initialCompletedYear,
    })
    .returning();

  const userMap = new Map<number, { id: number; name: string }>();
  const userIdSet = new Set<number>();
  if (row.assigneeId != null) userIdSet.add(row.assigneeId);
  if (row.suggestedById != null) userIdSet.add(row.suggestedById);
  for (const item of (row.checklist ?? []) as ChecklistItem[]) {
    if (item.assigneeId != null) userIdSet.add(item.assigneeId);
  }
  const userIdsToFetch = Array.from(userIdSet);
  if (userIdsToFetch.length) {
    const us = await db
      .select()
      .from(usersTable)
      .where(inArray(usersTable.id, userIdsToFetch));
    for (const u of us) userMap.set(u.id, u);
  }
  const deptMap = new Map<number, { id: number; name: string }>();
  const impacted = (row.impactedDepartmentIds ?? []) as number[];
  if (impacted.length) {
    const ds = await db
      .select()
      .from(departmentsTable)
      .where(inArray(departmentsTable.id, impacted));
    for (const d of ds) deptMap.set(d.id, d);
  }
  res.status(201).json(toTaskDto(row, userMap, deptMap, new Map()));
});

router.patch("/project-tasks/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateProjectTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProjectTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const project = await loadProjectForTask(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, project, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }

  const [existing] = await db
    .select()
    .from(projectTasksTable)
    .where(eq(projectTasksTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // If the bucket changed, validate it and remember its new name so we can
  // auto-stamp / clear completedYear when entering or leaving a "Completed"
  // pipeline stage.
  let newBucketName: string | null = null;
  if (
    parsed.data.bucketId !== undefined &&
    parsed.data.bucketId !== existing.bucketId
  ) {
    const [bucket] = await db
      .select()
      .from(projectBucketsTable)
      .where(eq(projectBucketsTable.id, parsed.data.bucketId));
    if (!bucket || bucket.projectId !== existing.projectId) {
      res.status(400).json({ error: "Bucket does not belong to this project" });
      return;
    }
    newBucketName = bucket.name;
  }

  const updates: Partial<typeof projectTasksTable.$inferInsert> = {};
  if (parsed.data.bucketId !== undefined) updates.bucketId = parsed.data.bucketId;
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description;
  if (parsed.data.labels !== undefined) updates.labels = parsed.data.labels;
  if (parsed.data.checklist !== undefined)
    updates.checklist = sanitizeChecklist(parsed.data.checklist);
  if (parsed.data.assigneeId !== undefined)
    updates.assigneeId = parsed.data.assigneeId;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.dueAt !== undefined)
    updates.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (parsed.data.position !== undefined) updates.position = parsed.data.position;
  if (parsed.data.completed !== undefined)
    updates.completed = parsed.data.completed;
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

  // Auto-stamp completedYear when card moves into a "Completed" bucket,
  // and clear it when moving out. Only triggered on bucket changes so we
  // don't clobber a manually-set year on other edits.
  if (newBucketName !== null) {
    if (isCompletedBucketName(newBucketName) && !existing.completedYear) {
      updates.completedYear = new Date().getUTCFullYear();
    } else if (!isCompletedBucketName(newBucketName)) {
      updates.completedYear = null;
    }
  }

  const [row] = await db
    .update(projectTasksTable)
    .set(updates)
    .where(eq(projectTasksTable.id, params.data.id))
    .returning();

  const userMap = new Map<number, { id: number; name: string }>();
  const userIdSet = new Set<number>();
  if (row.assigneeId != null) userIdSet.add(row.assigneeId);
  if (row.suggestedById != null) userIdSet.add(row.suggestedById);
  for (const item of (row.checklist ?? []) as ChecklistItem[]) {
    if (item.assigneeId != null) userIdSet.add(item.assigneeId);
  }
  const userIdsToFetch = Array.from(userIdSet);
  if (userIdsToFetch.length) {
    const us = await db
      .select()
      .from(usersTable)
      .where(inArray(usersTable.id, userIdsToFetch));
    for (const u of us) userMap.set(u.id, u);
  }
  const deptMap = new Map<number, { id: number; name: string }>();
  const impacted = (row.impactedDepartmentIds ?? []) as number[];
  if (impacted.length) {
    const ds = await db
      .select()
      .from(departmentsTable)
      .where(inArray(departmentsTable.id, impacted));
    for (const d of ds) deptMap.set(d.id, d);
  }
  const [{ count: cc } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectTaskCommentsTable)
    .where(eq(projectTaskCommentsTable.taskId, row.id));
  res.json(
    toTaskDto(row, userMap, deptMap, new Map([[row.id, cc ?? 0]])),
  );
});

router.delete("/project-tasks/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = DeleteProjectTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await loadProjectForTask(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, project, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }
  const [row] = await db
    .delete(projectTasksTable)
    .where(eq(projectTasksTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.sendStatus(204);
});

// ---------- Task comments (activity log) ----------

function commentToDto(
  row: typeof projectTaskCommentsTable.$inferSelect,
  authorMap: Map<number, { id: number; name: string }>,
) {
  return {
    id: row.id,
    taskId: row.taskId,
    authorId: row.authorId ?? null,
    authorName: row.authorId
      ? (authorMap.get(row.authorId)?.name ?? null)
      : null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/project-tasks/:id/comments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = ListProjectTaskCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await loadProjectForTask(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, project, "read"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }
  const rows = await db
    .select()
    .from(projectTaskCommentsTable)
    .where(eq(projectTaskCommentsTable.taskId, params.data.id))
    .orderBy(asc(projectTaskCommentsTable.createdAt), asc(projectTaskCommentsTable.id));

  const authorIds = Array.from(
    new Set(rows.map((r) => r.authorId).filter((d): d is number => d != null)),
  );
  const authors = authorIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, authorIds))
    : [];
  const authorMap = new Map(authors.map((u) => [u.id, u]));

  res.json(rows.map((r) => commentToDto(r, authorMap)));
});

router.post("/project-tasks/:id/comments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = CreateProjectTaskCommentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateProjectTaskCommentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data.body.trim();
  if (!body) {
    res.status(400).json({ error: "Comment body is required" });
    return;
  }
  const project = await loadProjectForTask(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!(await authorizeProjectAccess(user, project, "modify"))) {
    res.status(403).json({ error: "Forbidden on this project" });
    return;
  }
  const [row] = await db
    .insert(projectTaskCommentsTable)
    .values({
      taskId: params.data.id,
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
  "/project-tasks/:id/comments/:commentId",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    if (user.role === "end_user") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const params = DeleteProjectTaskCommentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await loadProjectForTask(params.data.id);
    if (!project) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const [comment] = await db
      .select()
      .from(projectTaskCommentsTable)
      .where(eq(projectTaskCommentsTable.id, params.data.commentId));
    if (!comment || comment.taskId !== params.data.id) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    // Author can always delete their own; otherwise need modify access.
    const isAuthor = comment.authorId === user.id;
    if (!isAuthor) {
      if (!(await authorizeProjectAccess(user, project, "modify"))) {
        res.status(403).json({ error: "Forbidden on this project" });
        return;
      }
    }
    await db
      .delete(projectTaskCommentsTable)
      .where(eq(projectTaskCommentsTable.id, params.data.commentId));
    res.sendStatus(204);
  },
);

export default router;
