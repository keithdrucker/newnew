import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  departmentsTable,
  ticketsTable,
} from "@workspace/db";
import {
  ListPeopleQueryParams,
  ListPeopleResponse,
  CreatePersonBody,
  GetPersonParams,
  GetPersonResponse,
  UpdatePersonParams,
  UpdatePersonBody,
  UpdatePersonResponse,
  DeletePersonParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";

const router: IRouter = Router();

async function hydratePeople(rows: (typeof usersTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const deptIds = Array.from(
    new Set(
      rows.map((r) => r.departmentId).filter((d): d is number => d != null),
    ),
  );
  const depts = deptIds.length
    ? await db
        .select()
        .from(departmentsTable)
        .where(inArray(departmentsTable.id, deptIds))
    : [];
  const deptMap = new Map(depts.map((d) => [d.id, d]));

  const openCounts = await db
    .select({
      reporterId: ticketsTable.reporterId,
      count: sql<number>`count(*)::int`,
    })
    .from(ticketsTable)
    .where(sql`${ticketsTable.status} IN ('open','pending')`)
    .groupBy(ticketsTable.reporterId);
  const countMap = new Map(openCounts.map((c) => [c.reporterId, c.count]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    title: r.title ?? null,
    location: r.location ?? null,
    phone: r.phone ?? null,
    departmentId: r.departmentId ?? null,
    departmentName: r.departmentId ? deptMap.get(r.departmentId)?.name ?? null : null,
    ticketsOpen: countMap.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));
}

router.get("/people", async (req, res): Promise<void> => {
  const params = ListPeopleQueryParams.safeParse(coerceQuery(req.query as Record<string, unknown>));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds: Array<ReturnType<typeof eq>> = [eq(usersTable.role, "end_user")];
  if (params.data.departmentId != null)
    conds.push(eq(usersTable.departmentId, params.data.departmentId));
  const rows = await db
    .select()
    .from(usersTable)
    .where(and(...conds))
    .orderBy(usersTable.name);
  let filtered = rows;
  if (params.data.q) {
    const needle = params.data.q.toLowerCase();
    filtered = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle),
    );
  }
  res.json(ListPeopleResponse.parse(await hydratePeople(filtered)));
});

router.post("/people", async (req, res): Promise<void> => {
  const parsed = CreatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(usersTable)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      title: parsed.data.title ?? null,
      location: parsed.data.location ?? null,
      phone: parsed.data.phone ?? null,
      departmentId: parsed.data.departmentId ?? null,
      role: "end_user",
    })
    .returning();
  const [dto] = await hydratePeople([row]);
  res.status(201).json(GetPersonResponse.parse(dto));
});

router.get("/people/:id", async (req, res): Promise<void> => {
  const params = GetPersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.role, "end_user")));
  if (!row) {
    res.status(404).json({ error: "Person not found" });
    return;
  }
  const [dto] = await hydratePeople([row]);
  res.json(GetPersonResponse.parse(dto));
});

router.patch("/people/:id", async (req, res): Promise<void> => {
  const params = UpdatePersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.role, "end_user")))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Person not found" });
    return;
  }
  const [dto] = await hydratePeople([row]);
  res.json(UpdatePersonResponse.parse(dto));
});

router.delete("/people/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = DeletePersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.role, "end_user")))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Person not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
