import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

// Demo single-row table to track which user the app is "logged in as".
export const sessionStateTable = pgTable("session_state", {
  id: serial("id").primaryKey(),
  currentUserId: integer("current_user_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
