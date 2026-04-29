import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, riskRulesTable } from "@workspace/db";
import {
  ListRiskRulesResponse,
  CreateRiskRuleBody,
  UpdateRiskRuleParams,
  UpdateRiskRuleBody,
  UpdateRiskRuleResponse,
  DeleteRiskRuleParams,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";

const router: IRouter = Router();

type Row = typeof riskRulesTable.$inferSelect;

function toDto(r: Row) {
  return {
    id: r.id,
    category: r.category,
    riskLevel: r.riskLevel as "low" | "medium" | "high" | "critical",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/risk-rules", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(riskRulesTable)
    .orderBy(asc(riskRulesTable.category));
  res.json(ListRiskRulesResponse.parse(rows.map(toDto)));
});

router.post("/risk-rules", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const parsed = CreateRiskRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const category = parsed.data.category.trim();
  if (!category) {
    res.status(400).json({ error: "Category is required" });
    return;
  }
  // Upsert behaviour — categories are unique, so re-creating an existing one
  // updates its level rather than 409'ing the user.
  const [row] = await db
    .insert(riskRulesTable)
    .values({ category, riskLevel: parsed.data.riskLevel })
    .onConflictDoUpdate({
      target: riskRulesTable.category,
      set: { riskLevel: parsed.data.riskLevel },
    })
    .returning();
  res.status(201).json(toDto(row));
});

router.patch("/risk-rules/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = UpdateRiskRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRiskRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<typeof riskRulesTable.$inferInsert> = {};
  if (parsed.data.category !== undefined)
    updates.category = parsed.data.category.trim();
  if (parsed.data.riskLevel !== undefined)
    updates.riskLevel = parsed.data.riskLevel;
  const [row] = await db
    .update(riskRulesTable)
    .set(updates)
    .where(eq(riskRulesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  res.json(UpdateRiskRuleResponse.parse(toDto(row)));
});

router.delete("/risk-rules/:id", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const params = DeleteRiskRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(riskRulesTable)
    .where(eq(riskRulesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
