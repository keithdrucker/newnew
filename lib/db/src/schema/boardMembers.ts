import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Per-board (per-department) membership for agents.
// Roles:
//   owner      → full control on this board (settings + tickets)
//   modify     → can view + edit + comment + close tickets on this board
//   read_only  → can view tickets and the dashboard for this board, no edits
export const boardMembersTable = pgTable(
  "board_members",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id").notNull(),
    userId: integer("user_id").notNull(),
    role: text("role").notNull().default("modify"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    deptUserUniq: uniqueIndex("board_members_dept_user_uniq").on(
      t.departmentId,
      t.userId,
    ),
  }),
);

export type BoardMember = typeof boardMembersTable.$inferSelect;
export type BoardRole = "owner" | "modify" | "read_only";
