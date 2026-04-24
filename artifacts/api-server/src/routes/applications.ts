import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  applicationsTable,
  departmentsTable,
  usersTable,
} from "@workspace/db";
import {
  ListApplicationsQueryParams,
  ListApplicationsResponse,
  CreateApplicationBody,
  UpdateApplicationParams,
  UpdateApplicationBody,
  UpdateApplicationResponse,
  DeleteApplicationParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";

const router: IRouter = Router();

type AppCategory =
  | "productivity"
  | "design"
  | "ops"
  | "finance"
  | "dev"
  | "security"
  | "other";

type AppStatus = "active" | "piloting" | "deprecated";

async function hydrate(rows: (typeof applicationsTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const deptIds = Array.from(
    new Set(rows.map((r) => r.departmentId).filter((d): d is number => d != null)),
  );
  const userIds = Array.from(
    new Set(rows.map((r) => r.ownerId).filter((d): d is number => d != null)),
  );
  const depts = deptIds.length
    ? await db.select().from(departmentsTable).where(inArray(departmentsTable.id, deptIds))
    : [];
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const deptMap = new Map(depts.map((d) => [d.id, d]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    vendor: r.vendor,
    category: r.category as AppCategory,
    status: r.status as AppStatus,
    description: r.description,
    website: r.website ?? null,
    ownerId: r.ownerId ?? null,
    ownerName: r.ownerId ? userMap.get(r.ownerId)?.name ?? null : null,
    departmentId: r.departmentId ?? null,
    departmentName: r.departmentId
      ? deptMap.get(r.departmentId)?.name ?? null
      : null,
    licenseSeats: r.licenseSeats ?? null,
    licenseUsed: r.licenseUsed ?? null,
    monthlyCost: r.monthlyCost ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

router.get("/applications", async (req, res): Promise<void> => {
  const params = ListApplicationsQueryParams.safeParse(
    coerceQuery(req.query as Record<string, unknown>),
  );
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds: Array<ReturnType<typeof eq>> = [];
  if (params.data.status)
    conds.push(eq(applicationsTable.status, params.data.status));
  if (params.data.category)
    conds.push(eq(applicationsTable.category, params.data.category));
  if (params.data.departmentId != null)
    conds.push(eq(applicationsTable.departmentId, params.data.departmentId));
  const where = conds.length ? and(...conds) : undefined;
  const baseQuery = db.select().from(applicationsTable);
  const rows = await (where ? baseQuery.where(where) : baseQuery).orderBy(
    asc(applicationsTable.name),
  );
  let filtered = rows;
  if (params.data.q) {
    const needle = params.data.q.toLowerCase();
    filtered = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.vendor.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle),
    );
  }
  res.json(ListApplicationsResponse.parse(await hydrate(filtered)));
});

router.post("/applications", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(applicationsTable)
    .values({
      name: parsed.data.name,
      vendor: parsed.data.vendor ?? "",
      category: parsed.data.category,
      status: parsed.data.status ?? "active",
      description: parsed.data.description ?? "",
      website: parsed.data.website ?? null,
      ownerId: parsed.data.ownerId ?? null,
      departmentId: parsed.data.departmentId ?? null,
      licenseSeats: parsed.data.licenseSeats ?? null,
      licenseUsed: parsed.data.licenseUsed ?? null,
      monthlyCost: parsed.data.monthlyCost ?? null,
    })
    .returning();
  const [dto] = await hydrate([row]);
  res.status(201).json(dto);
});

router.patch("/applications/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(applicationsTable)
    .set(parsed.data)
    .where(eq(applicationsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  const [dto] = await hydrate([row]);
  res.json(UpdateApplicationResponse.parse(dto));
});

router.delete("/applications/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = DeleteApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(applicationsTable)
    .where(eq(applicationsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
