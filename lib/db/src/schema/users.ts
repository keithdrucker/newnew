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
  defaultTicketBoard: text("default_ticket_board"),
  // Mirror of `defaultTicketBoard` for the other team-scoped sections.
  // Each stores a department slug or null. Resolved at /session time
  // against the user's accessible departments — if the slug is no
  // longer accessible, the API returns null so the UI doesn't redirect
  // somewhere the user can't see.
  defaultInitiativeBoard: text("default_initiative_board"),
  defaultProjectBoard: text("default_project_board"),
  defaultOperationalTaskBoard: text("default_operational_task_board"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof usersTable.$inferSelect;
