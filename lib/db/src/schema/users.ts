import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// Unified user table for admins, agents, and end_users.
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(), // 'admin' | 'agent' | 'end_user'
  title: text("title"),
  phone: text("phone"),
  location: text("location"),
  departmentId: integer("department_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof usersTable.$inferSelect;
