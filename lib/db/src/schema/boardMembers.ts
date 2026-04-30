import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

// Per-board (per-department) membership for agents.
// Roles (ranked low → high):
//   read_only  → can view tickets and the dashboard for this board, no edits
//   modify     → can view + edit + comment + close tickets on this board
//   manager    → modify + can view teammates' timesheets for this board
//                (the "team lead" tier — multiple managers per board are
//                supported and all of them can audit team time)
//   owner      → full control on this board (settings + tickets), and
//                inherits manager-level visibility
//
// Per-section overrides: `sectionRoles` is an optional jsonb that lets an
// admin set an agent's role independently for each Workspace area. Missing
// keys fall back to the legacy `role` column (the team default). The
// special value `"none"` revokes access to that section without affecting
// the others. The `role` column is preserved as the team-default fallback
// so existing memberships keep working.
export type BoardSection =
  | "tickets"
  | "operational_tasks"
  | "initiatives"
  | "projects";
export const BOARD_SECTIONS: BoardSection[] = [
  "tickets",
  "operational_tasks",
  "initiatives",
  "projects",
];
export type BoardSectionRole =
  | "owner"
  | "manager"
  | "modify"
  | "read_only"
  | "none";
export type BoardSectionRoles = Partial<Record<BoardSection, BoardSectionRole>>;

export const boardMembersTable = pgTable(
  "board_members",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id").notNull(),
    userId: integer("user_id").notNull(),
    role: text("role").notNull().default("modify"),
    sectionRoles: jsonb("section_roles").$type<BoardSectionRoles>(),
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
export type BoardRole = "owner" | "manager" | "modify" | "read_only";
