import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  assetsTable,
  departmentsTable,
  usersTable,
} from "@workspace/db";
import {
  ListAssetsQueryParams,
  ListAssetsResponse,
  CreateAssetBody,
  GetAssetParams,
  GetAssetResponse,
  UpdateAssetParams,
  UpdateAssetBody,
  UpdateAssetResponse,
  DeleteAssetParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";

const router: IRouter = Router();

async function hydrate(rows: (typeof assetsTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const deptIds = Array.from(
    new Set(
      rows.map((r) => r.departmentId).filter((d): d is number => d != null),
    ),
  );
  const userIds = Array.from(
    new Set(
      rows
        .map((r) => r.assignedToId)
        .filter((d): d is number => d != null),
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
    assetTag: r.assetTag,
    name: r.name,
    type: r.type as
      | "laptop"
      | "desktop"
      | "monitor"
      | "phone"
      | "printer"
      | "server"
      | "tablet"
      | "network"
      | "tool"
      | "vehicle"
      | "other",
    manufacturer: r.manufacturer ?? null,
    model: r.model ?? null,
    serialNumber: r.serialNumber ?? null,
    location: r.location,
    site: r.site as "office" | "jobsite",
    status: r.status as "in_use" | "in_storage" | "retired" | "repair",
    assignedToId: r.assignedToId ?? null,
    assignedToName: r.assignedToId ? userMap.get(r.assignedToId)?.name ?? null : null,
    departmentId: r.departmentId ?? null,
    departmentName: r.departmentId ? deptMap.get(r.departmentId)?.name ?? null : null,
    purchasedAt: r.purchasedAt ? r.purchasedAt.toISOString() : null,
    warrantyEndsAt: r.warrantyEndsAt ? r.warrantyEndsAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

router.get("/assets", async (req, res): Promise<void> => {
  const params = ListAssetsQueryParams.safeParse(coerceQuery(req.query as Record<string, unknown>));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds: Array<ReturnType<typeof eq>> = [];
  if (params.data.departmentId != null)
    conds.push(eq(assetsTable.departmentId, params.data.departmentId));
  if (params.data.status)
    conds.push(eq(assetsTable.status, params.data.status));
  const where = conds.length ? and(...conds) : undefined;
  const baseQuery = db.select().from(assetsTable);
  const rows = await (where ? baseQuery.where(where) : baseQuery).orderBy(
    assetsTable.assetTag,
  );
  let filtered = rows;
  if (params.data.q) {
    const needle = params.data.q.toLowerCase();
    filtered = rows.filter(
      (r) =>
        r.assetTag.toLowerCase().includes(needle) ||
        r.name.toLowerCase().includes(needle) ||
        (r.serialNumber ?? "").toLowerCase().includes(needle),
    );
  }
  res.json(ListAssetsResponse.parse(await hydrate(filtered)));
});

router.post("/assets", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(assetsTable).values(parsed.data).returning();
  const [dto] = await hydrate([row]);
  res.status(201).json(dto);
});

router.get("/assets/:id", async (req, res): Promise<void> => {
  const params = GetAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  const [dto] = await hydrate([row]);
  res.json(GetAssetResponse.parse(dto));
});

router.patch("/assets/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(assetsTable)
    .set(parsed.data)
    .where(eq(assetsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  const [dto] = await hydrate([row]);
  res.json(UpdateAssetResponse.parse(dto));
});

router.delete("/assets/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = DeleteAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(assetsTable)
    .where(eq(assetsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
