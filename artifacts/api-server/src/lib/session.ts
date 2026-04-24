import type { Request } from "express";
import { db, sessionStateTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type SessionUser = typeof usersTable.$inferSelect;

export async function getCurrentUser(_req: Request): Promise<SessionUser> {
  const [state] = await db.select().from(sessionStateTable).limit(1);
  if (!state) {
    const [firstAdmin] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .limit(1);
    if (!firstAdmin) {
      throw new Error("No users seeded — cannot resolve session.");
    }
    await db.insert(sessionStateTable).values({ currentUserId: firstAdmin.id });
    return firstAdmin;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, state.currentUserId))
    .limit(1);
  if (!user) {
    const [fallback] = await db.select().from(usersTable).limit(1);
    if (!fallback) throw new Error("No users in DB.");
    return fallback;
  }
  return user;
}

export async function setCurrentUser(userId: number): Promise<SessionUser> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) throw new Error("User not found");

  const [existing] = await db.select().from(sessionStateTable).limit(1);
  if (existing) {
    await db
      .update(sessionStateTable)
      .set({ currentUserId: userId })
      .where(eq(sessionStateTable.id, existing.id));
  } else {
    await db.insert(sessionStateTable).values({ currentUserId: userId });
  }
  return user;
}
