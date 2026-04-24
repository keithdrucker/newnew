import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  kbArticlesTable,
  departmentsTable,
  usersTable,
} from "@workspace/db";
import {
  ListKbArticlesQueryParams,
  ListKbArticlesResponse,
  CreateKbArticleBody,
  GetKbArticleParams,
  GetKbArticleResponse,
  UpdateKbArticleParams,
  UpdateKbArticleBody,
  UpdateKbArticleResponse,
  DeleteKbArticleParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";
import { coerceQuery } from "../lib/queryCoerce";

const router: IRouter = Router();

async function hydrate(rows: (typeof kbArticlesTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const deptIds = Array.from(new Set(rows.map((r) => r.departmentId)));
  const userIds = Array.from(new Set(rows.map((r) => r.authorId)));
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
    title: r.title,
    body: r.body,
    departmentId: r.departmentId,
    departmentName: deptMap.get(r.departmentId)?.name ?? "—",
    authorName: userMap.get(r.authorId)?.name ?? "Unknown",
    tags: r.tags,
    views: r.views,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

router.get("/knowledge-base", async (req, res): Promise<void> => {
  const params = ListKbArticlesQueryParams.safeParse(coerceQuery(req.query as Record<string, unknown>));
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conds: Array<ReturnType<typeof eq>> = [];
  if (params.data.departmentId != null)
    conds.push(eq(kbArticlesTable.departmentId, params.data.departmentId));
  const where = conds.length ? and(...conds) : undefined;
  const baseQuery = db.select().from(kbArticlesTable);
  const rows = await (where ? baseQuery.where(where) : baseQuery)
    .orderBy(desc(kbArticlesTable.updatedAt));
  let filtered = rows;
  if (params.data.q) {
    const needle = params.data.q.toLowerCase();
    filtered = rows.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) ||
        r.body.toLowerCase().includes(needle),
    );
  }
  res.json(ListKbArticlesResponse.parse(await hydrate(filtered)));
});

router.post("/knowledge-base", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const parsed = CreateKbArticleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(kbArticlesTable)
    .values({
      title: parsed.data.title,
      body: parsed.data.body,
      departmentId: parsed.data.departmentId,
      tags: parsed.data.tags ?? [],
      authorId: user.id,
    })
    .returning();
  const [dto] = await hydrate([row]);
  res.status(201).json(dto);
});

router.get("/knowledge-base/:id", async (req, res): Promise<void> => {
  const params = GetKbArticleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .update(kbArticlesTable)
    .set({ views: sql`${kbArticlesTable.views} + 1` })
    .where(eq(kbArticlesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  const [dto] = await hydrate([row]);
  res.json(GetKbArticleResponse.parse(dto));
});

router.patch("/knowledge-base/:id", async (req, res): Promise<void> => {
  const params = UpdateKbArticleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateKbArticleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(kbArticlesTable)
    .set(parsed.data)
    .where(eq(kbArticlesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  const [dto] = await hydrate([row]);
  res.json(UpdateKbArticleResponse.parse(dto));
});

router.delete("/knowledge-base/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin" && user.role !== "agent") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = DeleteKbArticleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(kbArticlesTable)
    .where(eq(kbArticlesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
