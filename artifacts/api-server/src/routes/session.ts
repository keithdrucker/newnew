import { Router, type IRouter } from "express";
import { db, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetSessionResponse, SwitchSessionBody } from "@workspace/api-zod";
import { getCurrentUser, setCurrentUser } from "../lib/session";

const router: IRouter = Router();

async function buildSessionPayload(userId: number) {
  const user = await setCurrentUser(userId);
  let departmentName: string | null = null;
  if (user.departmentId != null) {
    const [dept] = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.id, user.departmentId))
      .limit(1);
    departmentName = dept?.name ?? null;
  }
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role as "admin" | "agent" | "end_user",
    departmentId: user.departmentId ?? null,
    departmentName,
  };
}

router.get("/session", async (req, res): Promise<void> => {
  const user = await getCurrentUser(req);
  let departmentName: string | null = null;
  if (user.departmentId != null) {
    const [dept] = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.id, user.departmentId))
      .limit(1);
    departmentName = dept?.name ?? null;
  }
  res.json(
    GetSessionResponse.parse({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId ?? null,
      departmentName,
    }),
  );
});

router.post("/session", async (req, res): Promise<void> => {
  const parsed = SwitchSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const payload = await buildSessionPayload(parsed.data.userId);
    res.json(GetSessionResponse.parse(payload));
  } catch (e) {
    req.log.error({ err: e }, "Failed to switch session");
    res.status(404).json({ error: "User not found" });
  }
});

export default router;
