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

// A user-defined saved view for the tickets board.
// `config` stores the filter set (search, status, priority, supportLevel,
// assigneeId, departmentId). One view per user can be marked as default and
// will be auto-applied when the user opens /tickets.
export const ticketViewsTable = pgTable(
  "ticket_views",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    // The persisted shape is intentionally loose — anything the
    // TicketViewConfig zod schema accepts can land here, so we type it
    // as a permissive record. The route layer narrows it via the
    // generated zod schema before reading values.
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
    userNameUnique: uniqueIndex("ticket_views_user_name_unique").on(
      t.userId,
      t.name,
    ),
  }),
);

export type TicketView = typeof ticketViewsTable.$inferSelect;
