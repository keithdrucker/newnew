import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, dashboardSectionVisibilityTable } from "@workspace/db";
import {
  ListDashboardVisibilityResponse,
  SetDashboardSectionVisibilityBody,
  SetDashboardSectionVisibilityResponse,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";

const router: IRouter = Router();

type Row = typeof dashboardSectionVisibilityTable.$inferSelect;

function toDto(r: Row) {
  return {
    dashboardKey: r.dashboardKey,
    sectionKey: r.sectionKey,
    isVisible: r.isVisible,
    updatedAt: r.updatedAt.toISOString(),
  };
}

// Reads are open to anyone authenticated — section visibility is
// org-wide config, every dashboard viewer needs the resolved set.
router.get("/dashboard-visibility", async (req, res): Promise<void> => {
  await getCurrentUser(req);
  const rows = await db.select().from(dashboardSectionVisibilityTable);
  res.json(
    ListDashboardVisibilityResponse.parse({ items: rows.map(toDto) }),
  );
});

router.put(
  "/dashboard-visibility/:dashboardKey/:sectionKey",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const dashboardKey = String(req.params.dashboardKey ?? "").trim();
    const sectionKey = String(req.params.sectionKey ?? "").trim();
    if (!dashboardKey || !sectionKey) {
      res.status(400).json({ error: "dashboardKey and sectionKey required" });
      return;
    }
    const parsed = SetDashboardSectionVisibilityBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // Upsert keyed on the unique (dashboardKey, sectionKey) pair so a
    // toggle flip always converges to a single row regardless of
    // history.
    const [row] = await db
      .insert(dashboardSectionVisibilityTable)
      .values({
        dashboardKey,
        sectionKey,
        isVisible: parsed.data.isVisible,
      })
      .onConflictDoUpdate({
        target: [
          dashboardSectionVisibilityTable.dashboardKey,
          dashboardSectionVisibilityTable.sectionKey,
        ],
        set: { isVisible: parsed.data.isVisible },
      })
      .returning();
    res.json(SetDashboardSectionVisibilityResponse.parse(toDto(row)));
  },
);

router.post(
  "/dashboard-visibility/reset/:dashboardKey",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const dashboardKey = String(req.params.dashboardKey ?? "").trim();
    if (!dashboardKey) {
      res.status(400).json({ error: "dashboardKey required" });
      return;
    }
    await db
      .delete(dashboardSectionVisibilityTable)
      .where(eq(dashboardSectionVisibilityTable.dashboardKey, dashboardKey));
    res.sendStatus(204);
  },
);

export default router;
