import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, isNull, max, or } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectBucketsTable,
  projectTasksTable,
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
) {
  return {
    id: row.id,
    projectId: row.projectId,
    bucketId: row.bucketId,
    title: row.title,
    description: row.description,
    labels: (row.labels ?? []) as TaskLabel[],
    checklist: (row.checklist ?? []) as ChecklistItem[],
    assigneeId: row.assigneeId ?? null,
    assigneeName: row.assigneeId
      ? (userMap.get(row.assigneeId)?.name ?? null)
      : null,
    priority: row.priority as TaskPriority,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    position: row.position,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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

  const assigneeIds = Array.from(
    new Set(
      tasks.map((t) => t.assigneeId).filter((d): d is number => d != null),
    ),
  );
  const users = assigneeIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, assigneeIds))
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

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
      tasks: (tasksByBucket.get(b.id) ?? []).map((t) => toTaskDto(t, userMap)),
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

  // Seed three default buckets so the board feels alive on first open.
  await db.insert(projectBucketsTable).values([
    { projectId: row.id, name: "To do", position: 0 },
    { projectId: row.id, name: "In progress", position: 1 },
    { projectId: row.id, name: "Done", position: 2 },
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
  const [row] = await db
    .update(projectBucketsTable)
    .set(updates)
    .where(eq(projectBucketsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Bucket not found" });
    return;
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

  const [row] = await db
    .insert(projectTasksTable)
    .values({
      projectId: params.data.id,
      bucketId: parsed.data.bucketId,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      labels: parsed.data.labels ?? [],
      checklist: parsed.data.checklist ?? [],
      assigneeId: parsed.data.assigneeId ?? null,
      priority: parsed.data.priority ?? "medium",
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      position: (maxPos ?? -1) + 1,
      completed: false,
    })
    .returning();

  const userMap = new Map<number, { id: number; name: string }>();
  if (row.assigneeId) {
    const [u] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, row.assigneeId));
    if (u) userMap.set(u.id, u);
  }
  res.status(201).json(toTaskDto(row, userMap));
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
  }

  const updates: Partial<typeof projectTasksTable.$inferInsert> = {};
  if (parsed.data.bucketId !== undefined) updates.bucketId = parsed.data.bucketId;
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description;
  if (parsed.data.labels !== undefined) updates.labels = parsed.data.labels;
  if (parsed.data.checklist !== undefined)
    updates.checklist = parsed.data.checklist;
  if (parsed.data.assigneeId !== undefined)
    updates.assigneeId = parsed.data.assigneeId;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.dueAt !== undefined)
    updates.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (parsed.data.position !== undefined) updates.position = parsed.data.position;
  if (parsed.data.completed !== undefined)
    updates.completed = parsed.data.completed;

  const [row] = await db
    .update(projectTasksTable)
    .set(updates)
    .where(eq(projectTasksTable.id, params.data.id))
    .returning();

  const userMap = new Map<number, { id: number; name: string }>();
  if (row.assigneeId) {
    const [u] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, row.assigneeId));
    if (u) userMap.set(u.id, u);
  }
  res.json(toTaskDto(row, userMap));
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

export default router;
