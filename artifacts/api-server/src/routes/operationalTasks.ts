import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  operationalTasksTable,
  departmentsTable,
  usersTable,
  type OperationalTaskRow,
  type OperationalTaskChecklistItem,
} from "@workspace/db";
import {
  ListOperationalTasksQueryParams,
  CreateOperationalTaskBody,
  GetOperationalTaskParams,
  UpdateOperationalTaskParams,
  UpdateOperationalTaskBody,
  DeleteOperationalTaskParams,
  CompleteOperationalTaskParams,
} from "@workspace/api-zod";
import { getCurrentUser, type SessionUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";
import {
  getBoardRole,
  roleAtLeast,
  sectionVisibleDepartmentIds,
  sectionModifiableDepartmentIds,
} from "../lib/board-access";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

// ---- Auth helpers --------------------------------------------------

// Operational Tasks are an internal coordination tool — end_users have
// no access at all. Agents go through the per-section RBAC layer.
function assertAgentOrAdmin(user: SessionUser): void {
  if (user.role !== "admin" && user.role !== "agent") {
    const err: Error & { status?: number } = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
}

// ---- Date / overdue / frequency helpers ---------------------------

// We treat `nextDueDate` as a calendar date (no time component). The
// "today" comparison uses the server's local date interpreted as YYYY-MM-DD.
function todayYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ymdToDate(ymd: string): Date {
  // Parse as UTC noon so DST math doesn't shift the calendar day.
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function dateToYmd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Advance a date by the frequency interval. Used when completing a
// recurring task to compute the next instance's due date.
function advanceDueDate(currentYmd: string, frequency: string): string {
  const d = ymdToDate(currentYmd);
  switch (frequency) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "bi_weekly":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "bi_annual":
      d.setUTCMonth(d.getUTCMonth() + 6);
      break;
    case "annual":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    case "multi_year":
      d.setUTCFullYear(d.getUTCFullYear() + 2);
      break;
    default:
      // Defensive: unknown frequency falls back to monthly. The zod
      // schema rejects unknown values before this point, so we should
      // never hit it under normal flow.
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
  }
  return dateToYmd(d);
}

function isOverdue(row: { nextDueDate: string; status: string }): boolean {
  if (row.status === "completed") return false;
  return row.nextDueDate < todayYmd();
}

// ---- Checklist normalization --------------------------------------

// Inputs from the client may omit `id` (new items). We back-fill
// stable UUIDs so the UI can address them on subsequent edits.
function normalizeChecklist(
  items: OperationalTaskChecklistItem[] | undefined,
): OperationalTaskChecklistItem[] {
  if (!items) return [];
  return items.map((it) => ({
    id: it.id && it.id.length > 0 ? it.id : randomUUID(),
    text: it.text ?? "",
    done: !!it.done,
    assigneeId: it.assigneeId ?? null,
    assigneeName: it.assigneeName ?? null,
    dueDate: it.dueDate ?? null,
  }));
}

// Reset checks for a new recurring instance — keeps structure +
// assignees + due dates, but clears `done` flags.
function resetChecks(
  items: OperationalTaskChecklistItem[],
): OperationalTaskChecklistItem[] {
  return items.map((it) => ({ ...it, done: false }));
}

// ---- Validation -----------------------------------------------------

// Recurring tasks require a frequency; one_time tasks must not carry one.
function validateTypeFrequency(type: string, frequency: string | null | undefined):
  | { ok: true; frequency: string | null }
  | { ok: false; error: string } {
  if (type === "recurring") {
    if (!frequency) {
      return { ok: false, error: "frequency is required for recurring tasks" };
    }
    return { ok: true, frequency };
  }
  if (type === "one_time") {
    return { ok: true, frequency: null };
  }
  return { ok: false, error: `unknown task type: ${type}` };
}

// ---- Read shape ----------------------------------------------------

type TaskWithRefs = OperationalTaskRow & {
  departmentName: string;
  ownerName: string | null;
  completedByName: string | null;
};

function shape(row: TaskWithRefs) {
  return {
    id: row.id,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    name: row.name,
    description: row.description,
    type: row.type,
    frequency: row.frequency,
    nextDueDate: row.nextDueDate,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    status: row.status,
    isOverdue: isOverdue(row),
    checklist: row.checklist ?? [],
    seriesId: row.seriesId,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completedById: row.completedById,
    completedByName: row.completedByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadTaskById(id: number): Promise<TaskWithRefs | null> {
  const owner = usersTable;
  const completer = usersTable;
  const rows = await db
    .select({
      id: operationalTasksTable.id,
      departmentId: operationalTasksTable.departmentId,
      name: operationalTasksTable.name,
      description: operationalTasksTable.description,
      type: operationalTasksTable.type,
      frequency: operationalTasksTable.frequency,
      nextDueDate: operationalTasksTable.nextDueDate,
      ownerId: operationalTasksTable.ownerId,
      status: operationalTasksTable.status,
      checklist: operationalTasksTable.checklist,
      seriesId: operationalTasksTable.seriesId,
      completedAt: operationalTasksTable.completedAt,
      completedById: operationalTasksTable.completedById,
      createdAt: operationalTasksTable.createdAt,
      updatedAt: operationalTasksTable.updatedAt,
      departmentName: departmentsTable.name,
    })
    .from(operationalTasksTable)
    .innerJoin(
      departmentsTable,
      eq(departmentsTable.id, operationalTasksTable.departmentId),
    )
    .where(eq(operationalTasksTable.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  // Fetch the two user-name lookups separately to keep the join simple
  // and avoid the dual-alias join cost — these are cheap point reads.
  const userIds = [r.ownerId, null].filter((v): v is number => v != null);
  const userMap = new Map<number, string>();
  if (userIds.length > 0) {
    const users = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));
    for (const u of users) userMap.set(u.id, u.name);
  }
  let completedByName: string | null = null;
  if (r.completedById != null) {
    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, r.completedById))
      .limit(1);
    completedByName = u?.name ?? null;
  }
  return {
    ...r,
    departmentName: r.departmentName,
    ownerName: r.ownerId != null ? userMap.get(r.ownerId) ?? null : null,
    completedByName,
  };
}

// ---- Routes --------------------------------------------------------

router.get("/operational-tasks", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);

    const parsed = ListOperationalTasksQueryParams.safeParse(
      coerceQuery(req.query),
    );
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const q = parsed.data;

    // Section-scoped visibility. Admins see all; agents see boards
    // where their effective `operational_tasks` role is anything other
    // than revoked.
    const visibleDepts = await sectionVisibleDepartmentIds(
      user,
      "operational_tasks",
    );

    const conds = [];
    if (visibleDepts !== null) {
      if (visibleDepts.length === 0) {
        res.json([]);
        return;
      }
      conds.push(inArray(operationalTasksTable.departmentId, visibleDepts));
    }
    if (q.departmentId != null) {
      conds.push(eq(operationalTasksTable.departmentId, q.departmentId));
    }
    if (q.ownerId != null) {
      conds.push(eq(operationalTasksTable.ownerId, q.ownerId));
    }
    if (q.frequency) {
      conds.push(eq(operationalTasksTable.frequency, q.frequency));
    }
    if (q.type) {
      conds.push(eq(operationalTasksTable.type, q.type));
    }
    if (q.status) {
      const statuses = q.status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length > 0) {
        conds.push(inArray(operationalTasksTable.status, statuses));
      }
    }
    if (q.search) {
      conds.push(
        or(
          ilike(operationalTasksTable.name, `%${q.search}%`),
          ilike(operationalTasksTable.description, `%${q.search}%`),
        )!,
      );
    }
    const today = todayYmd();
    if (q.dueWindow === "today") {
      conds.push(eq(operationalTasksTable.nextDueDate, today));
    } else if (q.dueWindow === "week") {
      const d = ymdToDate(today);
      d.setUTCDate(d.getUTCDate() + 7);
      const weekEnd = dateToYmd(d);
      conds.push(
        and(
          sql`${operationalTasksTable.nextDueDate} >= ${today}`,
          sql`${operationalTasksTable.nextDueDate} <= ${weekEnd}`,
        )!,
      );
    } else if (q.dueWindow === "overdue") {
      conds.push(sql`${operationalTasksTable.nextDueDate} < ${today}`);
      conds.push(sql`${operationalTasksTable.status} != 'completed'`);
    }

    const rows = await db
      .select({
        id: operationalTasksTable.id,
        departmentId: operationalTasksTable.departmentId,
        name: operationalTasksTable.name,
        description: operationalTasksTable.description,
        type: operationalTasksTable.type,
        frequency: operationalTasksTable.frequency,
        nextDueDate: operationalTasksTable.nextDueDate,
        ownerId: operationalTasksTable.ownerId,
        status: operationalTasksTable.status,
        checklist: operationalTasksTable.checklist,
        seriesId: operationalTasksTable.seriesId,
        completedAt: operationalTasksTable.completedAt,
        completedById: operationalTasksTable.completedById,
        createdAt: operationalTasksTable.createdAt,
        updatedAt: operationalTasksTable.updatedAt,
        departmentName: departmentsTable.name,
        ownerName: usersTable.name,
      })
      .from(operationalTasksTable)
      .innerJoin(
        departmentsTable,
        eq(departmentsTable.id, operationalTasksTable.departmentId),
      )
      // Left join for owner so unowned tasks still appear.
      .leftJoin(usersTable, eq(usersTable.id, operationalTasksTable.ownerId))
      .where(conds.length > 0 ? and(...conds) : undefined)
      // Default sort is "overdue first, then nextDueDate ascending".
      // We compute overdue inline so the sort honors the rule even when
      // the query doesn't filter by dueWindow.
      .orderBy(
        sql`CASE WHEN ${operationalTasksTable.status} != 'completed' AND ${operationalTasksTable.nextDueDate} < ${today} THEN 0 ELSE 1 END`,
        asc(operationalTasksTable.nextDueDate),
        asc(operationalTasksTable.id),
      );

    // completedByName is only useful in the detail view; for the list
    // we leave it null to keep the query cheap.
    res.json(
      rows.map((r) => shape({ ...r, completedByName: null })),
    );
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.get("/operational-tasks/:id", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);
    const params = GetOperationalTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const task = await loadTaskById(params.data.id);
    if (!task) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const role = await getBoardRole(
      user,
      task.departmentId,
      "operational_tasks",
    );
    if (!role) {
      res.status(403).json({ error: "No access to this board" });
      return;
    }
    res.json(shape(task));
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.post("/operational-tasks", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);
    const body = CreateOperationalTaskBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const role = await getBoardRole(
      user,
      body.data.departmentId,
      "operational_tasks",
    );
    if (!roleAtLeast(role, "modify")) {
      res
        .status(403)
        .json({ error: "Need modify+ on Operational Tasks for this team" });
      return;
    }
    const tf = validateTypeFrequency(body.data.type, body.data.frequency);
    if (!tf.ok) {
      res.status(400).json({ error: tf.error });
      return;
    }
    const checklist = normalizeChecklist(body.data.checklist);
    // Wrap the insert + seriesId backfill in a single transaction so a
    // recurring root row can never persist with a NULL seriesId if the
    // process dies between the two statements.
    const insertedId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(operationalTasksTable)
        .values({
          departmentId: body.data.departmentId,
          name: body.data.name,
          description: body.data.description ?? "",
          type: body.data.type,
          frequency: tf.frequency,
          nextDueDate: body.data.nextDueDate,
          ownerId: body.data.ownerId ?? null,
          status: "scheduled",
          checklist,
        })
        .returning({ id: operationalTasksTable.id });
      // For recurring tasks the original carries `seriesId = id` so the
      // chain is self-referential from the start.
      if (body.data.type === "recurring") {
        await tx
          .update(operationalTasksTable)
          .set({ seriesId: row.id })
          .where(eq(operationalTasksTable.id, row.id));
      }
      return row.id;
    });
    const task = await loadTaskById(insertedId);
    res.status(201).json(shape(task!));
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.patch("/operational-tasks/:id", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);
    const params = UpdateOperationalTaskParams.safeParse(req.params);
    const body = UpdateOperationalTaskBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const existing = await loadTaskById(params.data.id);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const role = await getBoardRole(
      user,
      existing.departmentId,
      "operational_tasks",
    );
    if (!roleAtLeast(role, "modify")) {
      res
        .status(403)
        .json({ error: "Need modify+ on Operational Tasks for this team" });
      return;
    }
    if (existing.status === "completed") {
      res
        .status(409)
        .json({ error: "Cannot edit a completed task — completion is final" });
      return;
    }

    // Determine the resulting type + frequency so we can validate the
    // pair holistically.
    const nextType = body.data.type ?? existing.type;
    const nextFreqRaw =
      "frequency" in body.data ? body.data.frequency : existing.frequency;
    const tf = validateTypeFrequency(nextType, nextFreqRaw);
    if (!tf.ok) {
      res.status(400).json({ error: tf.error });
      return;
    }

    const update: Partial<typeof operationalTasksTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.data.name != null) update.name = body.data.name;
    if (body.data.description != null) update.description = body.data.description;
    if (body.data.type != null) update.type = body.data.type;
    if ("frequency" in body.data) update.frequency = tf.frequency;
    if (body.data.nextDueDate != null)
      update.nextDueDate = body.data.nextDueDate;
    if ("ownerId" in body.data) update.ownerId = body.data.ownerId ?? null;
    if (body.data.status != null) update.status = body.data.status;
    if (body.data.checklist != null) {
      update.checklist = normalizeChecklist(body.data.checklist);
    }

    await db
      .update(operationalTasksTable)
      .set(update)
      .where(eq(operationalTasksTable.id, params.data.id));
    const task = await loadTaskById(params.data.id);
    res.json(shape(task!));
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.delete("/operational-tasks/:id", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);
    const params = DeleteOperationalTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const existing = await loadTaskById(params.data.id);
    if (!existing) {
      // Idempotent delete: 204 even if already gone.
      res.status(204).send();
      return;
    }
    const role = await getBoardRole(
      user,
      existing.departmentId,
      "operational_tasks",
    );
    if (!roleAtLeast(role, "manager")) {
      res
        .status(403)
        .json({ error: "Need manager+ to delete operational tasks" });
      return;
    }
    await db
      .delete(operationalTasksTable)
      .where(eq(operationalTasksTable.id, params.data.id));
    res.status(204).send();
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.post("/operational-tasks/:id/complete", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);
    const params = CompleteOperationalTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const existing = await loadTaskById(params.data.id);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const role = await getBoardRole(
      user,
      existing.departmentId,
      "operational_tasks",
    );
    if (!roleAtLeast(role, "modify")) {
      res
        .status(403)
        .json({ error: "Need modify+ on Operational Tasks for this team" });
      return;
    }
    if (existing.status === "completed") {
      res
        .status(409)
        .json({ error: "Task is already completed" });
      return;
    }

    // Concurrency-safe completion: do the status flip with a
    // conditional UPDATE that only fires if the row is still not
    // completed, then RETURNING tells us whether we won the race.
    // The successor insert only runs when our update actually moved
    // the row — so two concurrent /complete requests on the same task
    // result in exactly one success + one 409 + at most one new
    // instance.
    let nextInstanceId: number | null = null;
    let won = false;
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(operationalTasksTable)
        .set({
          status: "completed",
          completedAt: new Date(),
          completedById: user.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(operationalTasksTable.id, existing.id),
            ne(operationalTasksTable.status, "completed"),
          ),
        )
        .returning({ id: operationalTasksTable.id });
      if (updated.length === 0) {
        // Lost the race — somebody else already completed this task.
        // Bail out without inserting any successor.
        return;
      }
      won = true;

      if (existing.type === "recurring" && existing.frequency) {
        const nextDue = advanceDueDate(
          existing.nextDueDate,
          existing.frequency,
        );
        const [next] = await tx
          .insert(operationalTasksTable)
          .values({
            departmentId: existing.departmentId,
            name: existing.name,
            description: existing.description,
            type: "recurring",
            frequency: existing.frequency,
            nextDueDate: nextDue,
            ownerId: existing.ownerId,
            status: "scheduled",
            checklist: resetChecks(existing.checklist ?? []),
            seriesId: existing.seriesId ?? existing.id,
          })
          .returning({ id: operationalTasksTable.id });
        nextInstanceId = next.id;
      }
    });

    if (!won) {
      res
        .status(409)
        .json({ error: "Task is already completed" });
      return;
    }

    const completed = await loadTaskById(existing.id);
    const nextInstance =
      nextInstanceId != null ? await loadTaskById(nextInstanceId) : null;
    res.json({
      completed: shape(completed!),
      nextInstance: nextInstance ? shape(nextInstance) : null,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

export default router;
