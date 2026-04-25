import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  departmentsTable,
  departmentSettingsTable,
  ticketsTable,
} from "@workspace/db";
import {
  ListDepartmentsResponse,
  CreateDepartmentBody,
  GetDepartmentParams,
  GetDepartmentResponse,
  UpdateDepartmentParams,
  UpdateDepartmentBody,
  UpdateDepartmentResponse,
  DeleteDepartmentParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { visibleDepartmentIds } from "../lib/board-access";

const router: IRouter = Router();

async function loadDepartmentsWithCounts(allowedIds?: Set<number>) {
  const counts = await db
    .select({
      departmentId: ticketsTable.departmentId,
      count: sql<number>`count(*)::int`,
    })
    .from(ticketsTable)
    .groupBy(ticketsTable.departmentId);
  const countMap = new Map(counts.map((c) => [c.departmentId, c.count]));

  const rows = await db
    .select()
    .from(departmentsTable)
    .orderBy(departmentsTable.name);
  const filtered = allowedIds ? rows.filter((d) => allowedIds.has(d.id)) : rows;
  return filtered.map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    color: d.color,
    icon: d.icon,
    description: d.description ?? null,
    ticketCount: countMap.get(d.id) ?? 0,
  }));
}

router.get("/departments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  // Non-admin users are always scoped to departments they can see, regardless
  // of the scope query param. Admins see everything; the scope param is a
  // no-op for them. This avoids information disclosure of department names
  // and ticket counts to users who shouldn't see other boards.
  let allowed: Set<number> | undefined;
  if (user.role === "admin") {
    allowed = undefined;
  } else if (user.role === "agent") {
    const ids = await visibleDepartmentIds(user);
    allowed = new Set(ids);
  } else {
    allowed = new Set(
      user.departmentId != null ? [user.departmentId] : [],
    );
  }
  const data = await loadDepartmentsWithCounts(allowed);
  res.json(ListDepartmentsResponse.parse(data));
});

router.post("/departments", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const parsed = CreateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [dept] = await db
    .insert(departmentsTable)
    .values({
      name: parsed.data.name,
      slug: parsed.data.slug,
      color: parsed.data.color,
      icon: parsed.data.icon,
      description: parsed.data.description ?? null,
    })
    .returning();
  await db.insert(departmentSettingsTable).values({ departmentId: dept.id });
  res.status(201).json(
    GetDepartmentResponse.parse({
      id: dept.id,
      name: dept.name,
      slug: dept.slug,
      color: dept.color,
      icon: dept.icon,
      description: dept.description ?? null,
      ticketCount: 0,
    }),
  );
});

router.get("/departments/:id", async (req, res): Promise<void> => {
  const params = GetDepartmentParams.safeParse(req.params);
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
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable)
    .where(eq(ticketsTable.departmentId, dept.id));
  res.json(
    GetDepartmentResponse.parse({
      id: dept.id,
      name: dept.name,
      slug: dept.slug,
      color: dept.color,
      icon: dept.icon,
      description: dept.description ?? null,
      ticketCount: count ?? 0,
    }),
  );
});

router.patch("/departments/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = UpdateDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [dept] = await db
    .update(departmentsTable)
    .set(parsed.data)
    .where(eq(departmentsTable.id, params.data.id))
    .returning();
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable)
    .where(eq(ticketsTable.departmentId, dept.id));
  res.json(
    UpdateDepartmentResponse.parse({
      id: dept.id,
      name: dept.name,
      slug: dept.slug,
      color: dept.color,
      icon: dept.icon,
      description: dept.description ?? null,
      ticketCount: count ?? 0,
    }),
  );
});

router.delete("/departments/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = DeleteDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(departmentSettingsTable)
    .where(eq(departmentSettingsTable.departmentId, params.data.id));
  const [dept] = await db
    .delete(departmentsTable)
    .where(eq(departmentsTable.id, params.data.id))
    .returning();
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
