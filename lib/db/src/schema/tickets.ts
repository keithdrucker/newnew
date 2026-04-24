import {
  pgTable,
  serial,
  smallint,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketKey: text("ticket_key").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  type: text("type").notNull().default("incident"), // incident | request
  priority: text("priority").notNull().default("medium"), // low|medium|high|urgent
  status: text("status").notNull().default("open"), // open|pending|resolved|closed
  source: text("source").notNull().default("portal"),
  // Tiered support escalation: 1 = front-line, 2 = specialist, 3 = engineering
  supportLevel: smallint("support_level").notNull().default(1),
  departmentId: integer("department_id").notNull(),
  reporterId: integer("reporter_id").notNull(),
  assigneeId: integer("assignee_id"),
  location: text("location"),
  team: text("team"),
  category: text("category"),
  slaBreached: boolean("sla_breached").notNull().default(false),
  responseDueAt: timestamp("response_due_at", { withTimezone: true }),
  resolutionDueAt: timestamp("resolution_due_at", { withTimezone: true }),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Ticket = typeof ticketsTable.$inferSelect;

export const ticketCommentsTable = pgTable("ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  authorId: integer("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TicketComment = typeof ticketCommentsTable.$inferSelect;
