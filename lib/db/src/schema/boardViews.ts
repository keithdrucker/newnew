import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Generic saved-view storage for the team-scoped sections that
// followed the Tickets pattern: Initiatives, Projects, and
// Operational Tasks. The Tickets module uses its own dedicated
// `ticket_views` table (see ticketViews.ts) and is intentionally not
// migrated here to avoid destabilising the working feature.
//
// `scope` partitions the rows so each section can have its own list
// of saved views (and its own per-section "default" pick) without
// colliding on names. The unique index is therefore on
// (userId, scope, name).
export const boardViewsTable = pgTable(
  "board_views",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    // Stored as text to keep the migration trivial; the route layer
    // narrows it via the generated zod schema. Allowed values:
    //   "initiative" | "project" | "operational_task"
    scope: text("scope").notNull(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    config: jsonb("config").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userScopeNameUnique: uniqueIndex("board_views_user_scope_name_unique").on(
      t.userId,
      t.scope,
      t.name,
    ),
  }),
);

export type BoardView = typeof boardViewsTable.$inferSelect;
