import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, vendorsTable, applicationsTable } from "@workspace/db";
import {
  ListVendorsQueryParams,
  ListVendorsResponse,
  CreateVendorBody,
  UpdateVendorParams,
  UpdateVendorBody,
  UpdateVendorResponse,
  DeleteVendorParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";

const router: IRouter = Router();

type VendorCategory =
  | "software"
  | "hardware"
  | "services"
  | "telecom"
  | "consulting"
  | "other";

type VendorStatus = "active" | "inactive";

async function hydrate(rows: (typeof vendorsTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  // Count linked applications by vendor name (case-insensitive).
  const counts = await db
    .select({
      vendor: applicationsTable.vendor,
      count: sql<number>`count(*)::int`,
    })
    .from(applicationsTable)
    .groupBy(applicationsTable.vendor);
  const countMap = new Map<string, number>();
  for (const c of counts) {
    if (c.vendor) countMap.set(c.vendor.toLowerCase(), c.count);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category as VendorCategory,
    status: r.status as VendorStatus,
    contactName: r.contactName ?? null,
    contactEmail: r.contactEmail ?? null,
    contactPhone: r.contactPhone ?? null,
    website: r.website ?? null,
    notes: r.notes,
    appCount: countMap.get(r.name.toLowerCase()) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));
}

router.get("/vendors", async (req, res): Promise<void> => {
  const params = ListVendorsQueryParams.safeParse(
    coerceQuery(req.query as Record<string, unknown>),
  );
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds: Array<ReturnType<typeof eq>> = [];
  if (params.data.status) conds.push(eq(vendorsTable.status, params.data.status));
  if (params.data.category)
    conds.push(eq(vendorsTable.category, params.data.category));
  const where = conds.length ? and(...conds) : undefined;
  const baseQuery = db.select().from(vendorsTable);
  const rows = await (where ? baseQuery.where(where) : baseQuery).orderBy(
    asc(vendorsTable.name),
  );
  let filtered = rows;
  if (params.data.q) {
    const needle = params.data.q.toLowerCase();
    filtered = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.contactName ?? "").toLowerCase().includes(needle) ||
        (r.contactEmail ?? "").toLowerCase().includes(needle) ||
        r.notes.toLowerCase().includes(needle),
    );
  }
  res.json(ListVendorsResponse.parse(await hydrate(filtered)));
});

router.post("/vendors", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(vendorsTable)
    .values({
      name: parsed.data.name,
      category: parsed.data.category,
      status: parsed.data.status ?? "active",
      contactName: parsed.data.contactName ?? null,
      contactEmail: parsed.data.contactEmail ?? null,
      contactPhone: parsed.data.contactPhone ?? null,
      website: parsed.data.website ?? null,
      notes: parsed.data.notes ?? "",
    })
    .returning();
  const [dto] = await hydrate([row]);
  res.status(201).json(dto);
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role === "end_user") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateVendorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(vendorsTable)
    .set(parsed.data)
    .where(eq(vendorsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  const [dto] = await hydrate([row]);
  res.json(UpdateVendorResponse.parse(dto));
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = DeleteVendorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(vendorsTable)
    .where(eq(vendorsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
