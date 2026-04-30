import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, boardViewsTable } from "@workspace/db";
import {
  ListBoardViewsQueryParams,
  CreateBoardViewBody,
  UpdateBoardViewParams,
  UpdateBoardViewBody,
  DeleteBoardViewParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";

// Generic CRUD for saved views in the team-scoped sections
// (Initiatives, Projects, Operational Tasks). Mirrors the shape of
// `ticketViews.ts` but partitioned by `scope` so each section maintains
// an independent list and an independent per-section default. Tickets
// keeps its own dedicated `/ticket-views` endpoint to avoid touching
// the working tickets feature.
const router: IRouter = Router();

type ViewRow = typeof boardViewsTable.$inferSelect;

function toDto(row: ViewRow) {
  return {
    id: row.id,
    userId: row.userId,
    scope: row.scope as "initiative" | "project" | "operational_task",
    name: row.name,
    isDefault: row.isDefault,
    config: row.config ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/board-views", async (req, res): Promise<void> => {
  const params = ListBoardViewsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await getCurrentUser(req);
  const rows = await db
    .select()
    .from(boardViewsTable)
    .where(
      and(
        eq(boardViewsTable.userId, user.id),
        eq(boardViewsTable.scope, params.data.scope),
      ),
    )
    .orderBy(asc(boardViewsTable.name));
  // Skip the Zod response parse — it would strip unknown keys from
  // each row's `config` bag (the same reason POST/PATCH read raw).
  // `toDto` already produces the wire shape.
  res.json(rows.map(toDto));
});

router.post("/board-views", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const parsed = CreateBoardViewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  // Block duplicates per (user, scope) — DB also enforces uniqueness.
  const existing = await db
    .select({ id: boardViewsTable.id })
    .from(boardViewsTable)
    .where(
      and(
        eq(boardViewsTable.userId, user.id),
        eq(boardViewsTable.scope, parsed.data.scope),
        eq(boardViewsTable.name, name),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "A view with that name already exists" });
    return;
  }

  // Promoting this view to default clears the prior default within the
  // same (user, scope) — at most one default per section per user.
  if (parsed.data.isDefault) {
    await db
      .update(boardViewsTable)
      .set({ isDefault: false })
      .where(
        and(
          eq(boardViewsTable.userId, user.id),
          eq(boardViewsTable.scope, parsed.data.scope),
        ),
      );
  }

  // The Zod schema generated from openapi enforces named-property
  // shape on `config`, but it also strips unknown keys — and the spec
  // explicitly declares config as a free-form bag ("intentionally
  // permissive — additional properties are allowed"). Read the raw
  // body's `config` to preserve every per-page filter key.
  const rawConfig =
    req.body && typeof req.body === "object" && req.body !== null
      ? (req.body as { config?: unknown }).config
      : undefined;
  const configToStore =
    rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
      ? (rawConfig as Record<string, unknown>)
      : {};

  const [row] = await db
    .insert(boardViewsTable)
    .values({
      userId: user.id,
      scope: parsed.data.scope,
      name,
      isDefault: parsed.data.isDefault ?? false,
      config: configToStore,
    })
    .returning();
  res.status(201).json(toDto(row));
});

router.patch("/board-views/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = UpdateBoardViewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBoardViewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(boardViewsTable)
    .where(eq(boardViewsTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "View not found" });
    return;
  }
  if (existing.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const updates: Partial<typeof boardViewsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Name cannot be empty" });
      return;
    }
    updates.name = name;
  }
  if (parsed.data.config !== undefined) {
    // Same as POST: read raw to preserve unknown keys.
    const rawConfig =
      req.body && typeof req.body === "object" && req.body !== null
        ? (req.body as { config?: unknown }).config
        : undefined;
    updates.config =
      rawConfig &&
      typeof rawConfig === "object" &&
      !Array.isArray(rawConfig)
        ? (rawConfig as Record<string, unknown>)
        : {};
  }
  if (parsed.data.isDefault !== undefined) {
    if (parsed.data.isDefault) {
      // Clear other defaults within this (user, scope) before promoting
      await db
        .update(boardViewsTable)
        .set({ isDefault: false })
        .where(
          and(
            eq(boardViewsTable.userId, user.id),
            eq(boardViewsTable.scope, existing.scope),
          ),
        );
    }
    updates.isDefault = parsed.data.isDefault;
  }
  const [row] = await db
    .update(boardViewsTable)
    .set(updates)
    .where(eq(boardViewsTable.id, params.data.id))
    .returning();
  res.json(toDto(row));
});

router.delete("/board-views/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = DeleteBoardViewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ id: boardViewsTable.id, userId: boardViewsTable.userId })
    .from(boardViewsTable)
    .where(eq(boardViewsTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "View not found" });
    return;
  }
  if (existing.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(boardViewsTable).where(eq(boardViewsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
