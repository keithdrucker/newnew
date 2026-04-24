import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, departmentSettingsTable } from "@workspace/db";
import {
  GetDepartmentSettingsParams,
  GetDepartmentSettingsResponse,
  UpdateDepartmentSettingsParams,
  UpdateDepartmentSettingsBody,
  UpdateDepartmentSettingsResponse,
} from "@workspace/api-zod";
import { getCurrentUser } from "../lib/session";

const router: IRouter = Router();

function toDto(row: typeof departmentSettingsTable.$inferSelect) {
  return {
    departmentId: row.departmentId,
    portalEnabled: row.portalEnabled,
    portalTitle: row.portalTitle,
    portalWelcome: row.portalWelcome,
    defaultPriority: row.defaultPriority as
      | "low"
      | "medium"
      | "high"
      | "urgent",
    slaResponseMinutes: row.slaResponseMinutes,
    slaResolutionMinutes: row.slaResolutionMinutes,
    autoAssign: row.autoAssign,
    notifyOnNewTicket: row.notifyOnNewTicket,
    notifyOnSlaBreach: row.notifyOnSlaBreach,
    allowEndUserAttachments: row.allowEndUserAttachments,
    requireCategory: row.requireCategory,
    businessHoursStart: row.businessHoursStart,
    businessHoursEnd: row.businessHoursEnd,
    ticketCategories: row.ticketCategories,
  };
}

router.get(
  "/departments/:id/settings",
  async (req, res): Promise<void> => {
    const params = GetDepartmentSettingsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    let [row] = await db
      .select()
      .from(departmentSettingsTable)
      .where(eq(departmentSettingsTable.departmentId, params.data.id));
    if (!row) {
      [row] = await db
        .insert(departmentSettingsTable)
        .values({ departmentId: params.data.id })
        .returning();
    }
    res.json(GetDepartmentSettingsResponse.parse(toDto(row)));
  },
);

router.patch(
  "/departments/:id/settings",
  async (req, res): Promise<void> => {
    const user = await getCurrentUser(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const params = UpdateDepartmentSettingsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateDepartmentSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    let [row] = await db
      .select()
      .from(departmentSettingsTable)
      .where(eq(departmentSettingsTable.departmentId, params.data.id));
    if (!row) {
      [row] = await db
        .insert(departmentSettingsTable)
        .values({ departmentId: params.data.id, ...parsed.data })
        .returning();
    } else {
      [row] = await db
        .update(departmentSettingsTable)
        .set(parsed.data)
        .where(eq(departmentSettingsTable.departmentId, params.data.id))
        .returning();
    }
    res.json(UpdateDepartmentSettingsResponse.parse(toDto(row)));
  },
);

export default router;
