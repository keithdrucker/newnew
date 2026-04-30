import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  operationalTasksTable,
  operationalTaskTimeEntriesTable,
  operationalTaskActivityTable,
  departmentsTable,
  usersTable,
  type OperationalTaskRow,
  type OperationalTaskChecklistItem,
  type OperationalTaskTimeEntryRow,
  type OperationalTaskActivityRow,
} from "@workspace/db";
import {
  ListOperationalTasksQueryParams,
  CreateOperationalTaskBody,
  GetOperationalTaskParams,
  UpdateOperationalTaskParams,
  UpdateOperationalTaskBody,
  DeleteOperationalTaskParams,
  CompleteOperationalTaskParams,
  ListOperationalTaskActivityParams,
  ListOperationalTaskTimeEntriesParams,
  CreateOperationalTaskTimeEntryParams,
  CreateOperationalTaskTimeEntryBody,
  UpdateOperationalTaskTimeEntryParams,
  UpdateOperationalTaskTimeEntryBody,
  DeleteOperationalTaskTimeEntryParams,
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

// Minimal structural type so `recordActivity` can accept either the
// top-level db handle or a Drizzle transaction without dragging in
// the full PgTransaction generic. We only ever call `.insert()` on it.
type DbOrTx = { insert: typeof db.insert };

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
  // Completed and closed tasks are terminal — they can't be overdue
  // even if their original due date is in the past.
  if (row.status === "completed" || row.status === "closed") return false;
  return row.nextDueDate < todayYmd();
}

// ---- Activity log -------------------------------------------------

// Centralised helper. Every state-changing route appends one row so
// the audit trail is uniform. `userId` is null for system actions
// (lazy auto-close after 24h).
async function recordActivity(
  tx: DbOrTx,
  taskId: number,
  userId: number | null,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(operationalTaskActivityTable).values({
    taskId,
    userId,
    action,
    details,
  });
}

// ---- Lazy auto-close (one-time, 24h after completion) -------------

// Per spec: a one_time task that has been `completed` for >24h is
// automatically transitioned to `closed`. We do this lazily on read
// rather than via a cron — the moment any user touches the task or
// the list, we promote eligible rows in a single UPDATE and write a
// system activity entry. This keeps the read path correct without a
// separate background process.
async function lazyCloseEligible(taskIds: number[]): Promise<void> {
  if (taskIds.length === 0) return;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const promoted = await db
    .update(operationalTasksTable)
    .set({ status: "closed", updatedAt: new Date() })
    .where(
      and(
        inArray(operationalTasksTable.id, taskIds),
        eq(operationalTasksTable.type, "one_time"),
        eq(operationalTasksTable.status, "completed"),
        sql`${operationalTasksTable.completedAt} <= ${cutoff}`,
      ),
    )
    .returning({ id: operationalTasksTable.id });
  for (const p of promoted) {
    await recordActivity(db, p.id, null, "closed", {
      reason: "auto_close_after_24h",
    });
  }
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
    completedAt: it.completedAt ?? null,
  }));
}

// Diff old vs new checklist arrays. Stamps `completedAt` the moment
// `done` flips false → true; clears it when un-checked. Returns the
// reconciled array PLUS a list of activity entries to write so the
// audit log captures who ticked what and when.
function reconcileChecklistTicks(
  oldItems: OperationalTaskChecklistItem[],
  incoming: OperationalTaskChecklistItem[],
): {
  next: OperationalTaskChecklistItem[];
  ticked: Array<{ id: string; text: string }>;
  unticked: Array<{ id: string; text: string }>;
} {
  const oldById = new Map<string, OperationalTaskChecklistItem>();
  for (const o of oldItems) oldById.set(o.id, o);
  const now = new Date().toISOString();
  const ticked: Array<{ id: string; text: string }> = [];
  const unticked: Array<{ id: string; text: string }> = [];
  const next = incoming.map((it) => {
    const id = it.id && it.id.length > 0 ? it.id : randomUUID();
    const prev = oldById.get(id);
    let completedAt = it.completedAt ?? null;
    if (prev) {
      if (!prev.done && it.done) {
        completedAt = now;
        ticked.push({ id, text: it.text ?? "" });
      } else if (prev.done && !it.done) {
        completedAt = null;
        unticked.push({ id, text: it.text ?? "" });
      } else if (it.done && !completedAt) {
        // Already done coming in but no timestamp — preserve the prev one.
        completedAt = prev.completedAt ?? now;
      } else if (!it.done) {
        completedAt = null;
      }
    } else if (it.done) {
      completedAt = now;
      ticked.push({ id, text: it.text ?? "" });
    }
    return {
      id,
      text: it.text ?? "",
      done: !!it.done,
      assigneeId: it.assigneeId ?? null,
      assigneeName: it.assigneeName ?? null,
      dueDate: it.dueDate ?? null,
      completedAt,
    };
  });
  return { next, ticked, unticked };
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
    controlCategory: row.controlCategory,
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
  // Lazy auto-close eligible candidates before reading. The promote
  // is a no-op if the row isn't eligible (wrong type/status/age).
  await lazyCloseEligible([id]);
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
      controlCategory: operationalTasksTable.controlCategory,
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
    } else if (!q.includeClosed) {
      // Closed tasks are hidden by default (Tickets-style "Show closed"
      // toggle). When the caller explicitly filters by status they
      // already control which buckets they see, so we honour that.
      conds.push(ne(operationalTasksTable.status, "closed"));
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

    // First-pass: figure out which IDs are visible so we can lazy
    // auto-close eligible candidates BEFORE the read. We then
    // re-query (with the same filters) so the response reflects
    // the post-promotion state.
    const idsToCheck = await db
      .select({ id: operationalTasksTable.id })
      .from(operationalTasksTable)
      .where(
        and(
          conds.length > 0 ? and(...conds) : undefined,
          eq(operationalTasksTable.type, "one_time"),
          eq(operationalTasksTable.status, "completed"),
        )!,
      );
    if (idsToCheck.length > 0) {
      await lazyCloseEligible(idsToCheck.map((r) => r.id));
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
        controlCategory: operationalTasksTable.controlCategory,
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
      // the query doesn't filter by dueWindow. Closed and completed
      // are terminal so they fall to the bottom of the overdue bucket.
      .orderBy(
        sql`CASE WHEN ${operationalTasksTable.status} NOT IN ('completed', 'closed') AND ${operationalTasksTable.nextDueDate} < ${today} THEN 0 ELSE 1 END`,
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
    // Wrap the insert + seriesId backfill + initial activity row in a
    // single transaction so a recurring root row can never persist
    // with a NULL seriesId — and the audit trail always starts with a
    // `created` entry — if the process dies between statements.
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
          controlCategory: body.data.controlCategory ?? null,
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
      await recordActivity(tx, row.id, user.id, "created", {
        name: body.data.name,
        type: body.data.type,
        frequency: tf.frequency,
        nextDueDate: body.data.nextDueDate,
        ownerId: body.data.ownerId ?? null,
        controlCategory: body.data.controlCategory ?? null,
      });
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
    if (existing.status === "closed") {
      res
        .status(409)
        .json({
          error: "Cannot edit a closed task — closed tasks are read-only",
        });
      return;
    }
    // `completed` is a softer state: descriptive metadata stays
    // editable so people can correct typos / re-categorize work after
    // the fact, but the fields that *describe the completed instance*
    // (due date, owner, status, checklist) are pinned. We enforce the
    // restriction by stripping those fields from the patch body — that
    // way callers using the dedicated `/complete` endpoint (and the
    // lazy auto-close path) keep working without race conditions.
    if (existing.status === "completed") {
      const restrictedKeys: Array<keyof typeof body.data> = [
        "nextDueDate",
        "ownerId",
        "status",
        "checklist",
      ];
      const offenders = restrictedKeys.filter((k) => k in body.data);
      if (offenders.length > 0) {
        res.status(409).json({
          error: `Cannot change ${offenders.join(", ")} on a completed task — these fields describe the completed instance.`,
        });
        return;
      }
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

    // Build the SQL update + the activity entries side-by-side. We
    // diff every field that's present in the body so the audit log
    // captures *what actually changed* rather than the whole payload.
    const update: Partial<typeof operationalTasksTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    type Activity = { action: string; details: Record<string, unknown> };
    const activities: Activity[] = [];

    if (body.data.name != null && body.data.name !== existing.name) {
      update.name = body.data.name;
      activities.push({
        action: "name_changed",
        details: { from: existing.name, to: body.data.name },
      });
    }
    if (
      body.data.description != null &&
      body.data.description !== existing.description
    ) {
      update.description = body.data.description;
      activities.push({ action: "description_changed", details: {} });
    }
    if (body.data.type != null && body.data.type !== existing.type) {
      update.type = body.data.type;
      activities.push({
        action: "type_changed",
        details: { from: existing.type, to: body.data.type },
      });
    }
    if ("frequency" in body.data && tf.frequency !== existing.frequency) {
      update.frequency = tf.frequency;
      activities.push({
        action: "frequency_changed",
        details: { from: existing.frequency, to: tf.frequency },
      });
    }
    if (
      body.data.nextDueDate != null &&
      body.data.nextDueDate !== existing.nextDueDate
    ) {
      update.nextDueDate = body.data.nextDueDate;
      activities.push({
        action: "due_date_changed",
        details: { from: existing.nextDueDate, to: body.data.nextDueDate },
      });
    }
    if ("ownerId" in body.data) {
      const nextOwner = body.data.ownerId ?? null;
      if (nextOwner !== existing.ownerId) {
        update.ownerId = nextOwner;
        activities.push({
          action: "owner_reassigned",
          details: { from: existing.ownerId, to: nextOwner },
        });
      }
    }
    if (body.data.status != null && body.data.status !== existing.status) {
      // The PATCH zod schema only allows `scheduled` and `in_progress`
      // — `completed` and `closed` are reached through their dedicated
      // endpoints (POST /complete and the lazy auto-close). So no
      // extra guard is needed here.
      update.status = body.data.status;
      activities.push({
        action: "status_changed",
        details: { from: existing.status, to: body.data.status },
      });
    }
    if ("controlCategory" in body.data) {
      const nextCC = body.data.controlCategory ?? null;
      if (nextCC !== existing.controlCategory) {
        update.controlCategory = nextCC;
        activities.push({
          action: "control_category_changed",
          details: { from: existing.controlCategory, to: nextCC },
        });
      }
    }
    if (body.data.checklist != null) {
      const reconciled = reconcileChecklistTicks(
        existing.checklist ?? [],
        body.data.checklist,
      );
      update.checklist = reconciled.next;
      for (const t of reconciled.ticked) {
        activities.push({
          action: "checklist_item_completed",
          details: { itemId: t.id, text: t.text },
        });
      }
      for (const u of reconciled.unticked) {
        activities.push({
          action: "checklist_item_unchecked",
          details: { itemId: u.id, text: u.text },
        });
      }
      // Capture pure structural changes (add/remove/edit) too so the
      // audit log isn't silent when somebody rewords a row.
      const oldIds = new Set((existing.checklist ?? []).map((c) => c.id));
      const newIds = new Set(reconciled.next.map((c) => c.id));
      const added = reconciled.next.filter((c) => !oldIds.has(c.id));
      const removed = (existing.checklist ?? []).filter(
        (c) => !newIds.has(c.id),
      );
      for (const a of added) {
        activities.push({
          action: "checklist_item_added",
          details: { itemId: a.id, text: a.text },
        });
      }
      for (const r of removed) {
        activities.push({
          action: "checklist_item_removed",
          details: { itemId: r.id, text: r.text },
        });
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(operationalTasksTable)
        .set(update)
        .where(eq(operationalTasksTable.id, params.data.id));
      for (const a of activities) {
        await recordActivity(tx, params.data.id, user.id, a.action, a.details);
      }
    });
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
    // Activity rows cascade out with the task, so logging "deleted"
    // here is mostly informational — but we keep the audit footprint
    // consistent by emitting one event before the delete in case
    // future callers (e.g. a separate audit-export pipeline) snapshot
    // activity rows ahead of the cascade.
    await recordActivity(db, params.data.id, user.id, "deleted", {
      name: existing.name,
    });
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
    // `closed` is terminal — it must never be transitioned back to
    // completed (which would rewrite completedAt and break the
    // immutable closure invariant). The lazy auto-close path is the
    // only thing that can promote completed → closed, never the
    // reverse.
    if (existing.status === "closed") {
      res
        .status(409)
        .json({ error: "Task is closed and cannot be re-completed" });
      return;
    }

    // Concurrency-safe completion: do the status flip with a
    // conditional UPDATE that only fires if the row is still
    // open (scheduled or in_progress), then RETURNING tells us
    // whether we won the race. Restricting the predicate to the
    // open states (rather than just `!= completed`) also blocks
    // closed → completed regressions if a row is closed mid-flight.
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
            inArray(operationalTasksTable.status, ["scheduled", "in_progress"]),
          ),
        )
        .returning({ id: operationalTasksTable.id });
      if (updated.length === 0) {
        // Lost the race — somebody else already completed this task.
        // Bail out without inserting any successor.
        return;
      }
      won = true;
      await recordActivity(tx, existing.id, user.id, "completed", {
        wasRecurring: existing.type === "recurring",
      });

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
            controlCategory: existing.controlCategory,
            checklist: resetChecks(existing.checklist ?? []),
            seriesId: existing.seriesId ?? existing.id,
          })
          .returning({ id: operationalTasksTable.id });
        nextInstanceId = next.id;
        await recordActivity(tx, next.id, user.id, "created", {
          fromCompletion: existing.id,
          nextDueDate: nextDue,
        });
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

// ---- Activity log -------------------------------------------------

router.get("/operational-tasks/:id/activity", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);
    const params = ListOperationalTaskActivityParams.safeParse(req.params);
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
    const rows = await db
      .select({
        id: operationalTaskActivityTable.id,
        taskId: operationalTaskActivityTable.taskId,
        userId: operationalTaskActivityTable.userId,
        userName: usersTable.name,
        action: operationalTaskActivityTable.action,
        details: operationalTaskActivityTable.details,
        createdAt: operationalTaskActivityTable.createdAt,
      })
      .from(operationalTaskActivityTable)
      .leftJoin(
        usersTable,
        eq(usersTable.id, operationalTaskActivityTable.userId),
      )
      .where(eq(operationalTaskActivityTable.taskId, params.data.id))
      .orderBy(asc(operationalTaskActivityTable.createdAt));
    res.json(
      rows.map((r) => ({
        id: r.id,
        taskId: r.taskId,
        userId: r.userId,
        userName: r.userName,
        action: r.action,
        details: (r.details ?? {}) as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

// ---- Time entries -------------------------------------------------

// Round any duration to the nearest 15 minutes (matches the ticket
// time-entry behaviour for consistent billing rollups). We always
// round UP so partial increments don't get dropped — agents prefer
// to over-account by a few minutes than under-account.
function round15Up(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 15) * 15;
}

function shapeTimeEntry(
  row: OperationalTaskTimeEntryRow & { userName: string | null },
) {
  return {
    id: row.id,
    taskId: row.taskId,
    userId: row.userId,
    userName: row.userName,
    departmentId: row.departmentId,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    durationMinutes: row.durationMinutes,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/operational-tasks/:id/time-entries", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);
    const params = ListOperationalTaskTimeEntriesParams.safeParse(req.params);
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
    const rows = await db
      .select({
        id: operationalTaskTimeEntriesTable.id,
        taskId: operationalTaskTimeEntriesTable.taskId,
        userId: operationalTaskTimeEntriesTable.userId,
        departmentId: operationalTaskTimeEntriesTable.departmentId,
        startAt: operationalTaskTimeEntriesTable.startAt,
        endAt: operationalTaskTimeEntriesTable.endAt,
        durationMinutes: operationalTaskTimeEntriesTable.durationMinutes,
        note: operationalTaskTimeEntriesTable.note,
        createdAt: operationalTaskTimeEntriesTable.createdAt,
        userName: usersTable.name,
      })
      .from(operationalTaskTimeEntriesTable)
      .leftJoin(
        usersTable,
        eq(usersTable.id, operationalTaskTimeEntriesTable.userId),
      )
      .where(eq(operationalTaskTimeEntriesTable.taskId, params.data.id))
      .orderBy(desc(operationalTaskTimeEntriesTable.startAt));
    res.json(rows.map((r) => shapeTimeEntry(r)));
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.post("/operational-tasks/:id/time-entries", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    assertAgentOrAdmin(user);
    const params = CreateOperationalTaskTimeEntryParams.safeParse(req.params);
    const body = CreateOperationalTaskTimeEntryBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
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
    if (!roleAtLeast(role, "modify")) {
      res
        .status(403)
        .json({ error: "Need modify+ on Operational Tasks for this team" });
      return;
    }
    if (task.status === "closed") {
      res
        .status(409)
        .json({ error: "Cannot log time on a closed task" });
      return;
    }

    const startAt = new Date(body.data.startAt);
    const endAt = new Date(body.data.endAt);
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      endAt <= startAt
    ) {
      res
        .status(400)
        .json({ error: "endAt must be a valid time after startAt" });
      return;
    }
    const rawMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
    const durationMinutes = round15Up(rawMinutes);

    const insertedId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(operationalTaskTimeEntriesTable)
        .values({
          taskId: task.id,
          userId: user.id,
          departmentId: task.departmentId,
          startAt,
          endAt,
          durationMinutes,
          note: body.data.note ?? "",
        })
        .returning({ id: operationalTaskTimeEntriesTable.id });
      await recordActivity(tx, task.id, user.id, "time_logged", {
        entryId: row.id,
        durationMinutes,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
      return row.id;
    });

    const [created] = await db
      .select({
        id: operationalTaskTimeEntriesTable.id,
        taskId: operationalTaskTimeEntriesTable.taskId,
        userId: operationalTaskTimeEntriesTable.userId,
        departmentId: operationalTaskTimeEntriesTable.departmentId,
        startAt: operationalTaskTimeEntriesTable.startAt,
        endAt: operationalTaskTimeEntriesTable.endAt,
        durationMinutes: operationalTaskTimeEntriesTable.durationMinutes,
        note: operationalTaskTimeEntriesTable.note,
        createdAt: operationalTaskTimeEntriesTable.createdAt,
        userName: usersTable.name,
      })
      .from(operationalTaskTimeEntriesTable)
      .leftJoin(
        usersTable,
        eq(usersTable.id, operationalTaskTimeEntriesTable.userId),
      )
      .where(eq(operationalTaskTimeEntriesTable.id, insertedId))
      .limit(1);
    res.status(201).json(shapeTimeEntry(created));
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

router.patch(
  "/operational-tasks/:id/time-entries/:entryId",
  async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      assertAgentOrAdmin(user);
      const params = UpdateOperationalTaskTimeEntryParams.safeParse(req.params);
      const body = UpdateOperationalTaskTimeEntryBody.safeParse(req.body);
      if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
      }
      if (!body.success) {
        res.status(400).json({ error: body.error.message });
        return;
      }
      const [existing] = await db
        .select()
        .from(operationalTaskTimeEntriesTable)
        .where(
          and(
            eq(operationalTaskTimeEntriesTable.id, params.data.entryId),
            eq(operationalTaskTimeEntriesTable.taskId, params.data.id),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
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
      // Owner of the entry can edit their own; managers+ can edit anyone's.
      const isOwn = existing.userId === user.id;
      if (!isOwn && !roleAtLeast(role, "manager")) {
        res.status(403).json({
          error:
            "Can only edit your own time entries (or be a manager on this team)",
        });
        return;
      }
      if (task.status === "closed") {
        res
          .status(409)
          .json({ error: "Cannot edit time on a closed task" });
        return;
      }

      const startAt =
        body.data.startAt != null ? new Date(body.data.startAt) : existing.startAt;
      const endAt =
        body.data.endAt != null ? new Date(body.data.endAt) : existing.endAt;
      if (
        Number.isNaN(startAt.getTime()) ||
        Number.isNaN(endAt.getTime()) ||
        endAt <= startAt
      ) {
        res
          .status(400)
          .json({ error: "endAt must be a valid time after startAt" });
        return;
      }
      const rawMinutes = Math.round(
        (endAt.getTime() - startAt.getTime()) / 60000,
      );
      const durationMinutes = round15Up(rawMinutes);

      // `note` is NOT NULL in the schema (defaults to empty string),
      // so coerce nulls/undefined into "".
      const nextNote: string =
        "note" in body.data
          ? body.data.note ?? ""
          : existing.note;
      await db.transaction(async (tx) => {
        await tx
          .update(operationalTaskTimeEntriesTable)
          .set({
            startAt,
            endAt,
            durationMinutes,
            note: nextNote,
          })
          .where(eq(operationalTaskTimeEntriesTable.id, params.data.entryId));
        await recordActivity(tx, task.id, user.id, "time_edited", {
          entryId: params.data.entryId,
          durationMinutes,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });
      });

      const [updated] = await db
        .select({
          id: operationalTaskTimeEntriesTable.id,
          taskId: operationalTaskTimeEntriesTable.taskId,
          userId: operationalTaskTimeEntriesTable.userId,
          departmentId: operationalTaskTimeEntriesTable.departmentId,
          startAt: operationalTaskTimeEntriesTable.startAt,
          endAt: operationalTaskTimeEntriesTable.endAt,
          durationMinutes: operationalTaskTimeEntriesTable.durationMinutes,
          note: operationalTaskTimeEntriesTable.note,
          createdAt: operationalTaskTimeEntriesTable.createdAt,
          userName: usersTable.name,
        })
        .from(operationalTaskTimeEntriesTable)
        .leftJoin(
          usersTable,
          eq(usersTable.id, operationalTaskTimeEntriesTable.userId),
        )
        .where(eq(operationalTaskTimeEntriesTable.id, params.data.entryId))
        .limit(1);
      res.json(shapeTimeEntry(updated));
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      res.status(status).json({ error: (err as Error).message });
    }
  },
);

router.delete(
  "/operational-tasks/:id/time-entries/:entryId",
  async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      assertAgentOrAdmin(user);
      const params = DeleteOperationalTaskTimeEntryParams.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
      }
      const [existing] = await db
        .select()
        .from(operationalTaskTimeEntriesTable)
        .where(
          and(
            eq(operationalTaskTimeEntriesTable.id, params.data.entryId),
            eq(operationalTaskTimeEntriesTable.taskId, params.data.id),
          ),
        )
        .limit(1);
      if (!existing) {
        // Idempotent: 204 if already gone.
        res.status(204).send();
        return;
      }
      const task = await loadTaskById(params.data.id);
      if (!task) {
        res.status(204).send();
        return;
      }
      const role = await getBoardRole(
        user,
        task.departmentId,
        "operational_tasks",
      );
      const isOwn = existing.userId === user.id;
      if (!isOwn && !roleAtLeast(role, "manager")) {
        res.status(403).json({
          error:
            "Can only delete your own time entries (or be a manager on this team)",
        });
        return;
      }
      if (task.status === "closed") {
        res
          .status(409)
          .json({ error: "Cannot remove time entries on a closed task" });
        return;
      }
      await db.transaction(async (tx) => {
        await tx
          .delete(operationalTaskTimeEntriesTable)
          .where(eq(operationalTaskTimeEntriesTable.id, params.data.entryId));
        await recordActivity(tx, task.id, user.id, "time_deleted", {
          entryId: params.data.entryId,
          durationMinutes: existing.durationMinutes,
        });
      });
      res.status(204).send();
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      res.status(status).json({ error: (err as Error).message });
    }
  },
);

export default router;
