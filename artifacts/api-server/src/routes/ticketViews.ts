import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, ticketViewsTable } from "@workspace/db";
import {
  ListTicketViewsResponse,
  CreateTicketViewBody,
  UpdateTicketViewParams,
  UpdateTicketViewBody,
  DeleteTicketViewParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";

const router: IRouter = Router();

type ViewRow = typeof ticketViewsTable.$inferSelect;

function toDto(row: ViewRow) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    isDefault: row.isDefault,
    config: row.config ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/ticket-views", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const rows = await db
    .select()
    .from(ticketViewsTable)
    .where(eq(ticketViewsTable.userId, user.id))
    .orderBy(asc(ticketViewsTable.name));
  res.json(ListTicketViewsResponse.parse(rows.map(toDto)));
});

router.post("/ticket-views", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const parsed = CreateTicketViewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  // Block duplicates per user (DB also enforces uniqueness)
  const existing = await db
    .select({ id: ticketViewsTable.id })
    .from(ticketViewsTable)
    .where(
      and(eq(ticketViewsTable.userId, user.id), eq(ticketViewsTable.name, name)),
    )
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "A view with that name already exists" });
    return;
  }

  if (parsed.data.isDefault) {
    await db
      .update(ticketViewsTable)
      .set({ isDefault: false })
      .where(eq(ticketViewsTable.userId, user.id));
  }

  const [row] = await db
    .insert(ticketViewsTable)
    .values({
      userId: user.id,
      name,
      isDefault: parsed.data.isDefault ?? false,
      config: parsed.data.config ?? {},
    })
    .returning();
  res.status(201).json(toDto(row));
});

router.patch("/ticket-views/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = UpdateTicketViewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTicketViewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(ticketViewsTable)
    .where(eq(ticketViewsTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "View not found" });
    return;
  }
  if (existing.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const updates: Partial<typeof ticketViewsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Name cannot be empty" });
      return;
    }
    updates.name = name;
  }
  if (parsed.data.config !== undefined) {
    updates.config = parsed.data.config;
  }
  if (parsed.data.isDefault !== undefined) {
    if (parsed.data.isDefault) {
      // Clear other defaults for this user before promoting this one
      await db
        .update(ticketViewsTable)
        .set({ isDefault: false })
        .where(eq(ticketViewsTable.userId, user.id));
    }
    updates.isDefault = parsed.data.isDefault;
  }
  const [row] = await db
    .update(ticketViewsTable)
    .set(updates)
    .where(eq(ticketViewsTable.id, params.data.id))
    .returning();
  res.json(toDto(row));
});

router.delete("/ticket-views/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  const params = DeleteTicketViewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select({ id: ticketViewsTable.id, userId: ticketViewsTable.userId })
    .from(ticketViewsTable)
    .where(eq(ticketViewsTable.id, params.data.id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "View not found" });
    return;
  }
  if (existing.userId !== user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(ticketViewsTable).where(eq(ticketViewsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
