import {
  bigint,
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
  // 8-state workflow: new | in_progress | with_user | with_vendor |
  // on_hold | scheduled | resolved | closed. SLA pauses on the four
  // "waiting" states and stops on resolved/closed.
  status: text("status").notNull().default("new"),
  source: text("source").notNull().default("portal"),
  // Tiered support escalation: 1 = front-line, 2 = specialist, 3 = engineering
  supportLevel: smallint("support_level").notNull().default(1),
  departmentId: integer("department_id").notNull(),
  reporterId: integer("reporter_id").notNull(),
  assigneeId: integer("assignee_id"),
  location: text("location"),
  team: text("team"),
  category: text("category"),
  // low | medium | high | critical — security-first ITSM risk dimension,
  // stored independently of business priority. Default "low" lets existing
  // rows backfill without surprises.
  riskLevel: text("risk_level").notNull().default("low"),
  rootCause: text("root_cause"),
  resolution: text("resolution"),
  slaBreached: boolean("sla_breached").notNull().default(false),
  // True once the response-SLA deadline has elapsed without a first
  // agent response (separate from resolution-SLA breach so dashboards
  // can split the two metrics).
  responseSlaBreached: boolean("response_sla_breached").notNull().default(false),
  responseDueAt: timestamp("response_due_at", { withTimezone: true }),
  resolutionDueAt: timestamp("resolution_due_at", { withTimezone: true }),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  // SLA pause/resume bookkeeping. When status enters a "waiting" state we
  // stamp `slaPausedAt`; when it leaves we add `now - slaPausedAt` into
  // `slaAccumulatedPauseMs` and clear `slaPausedAt`. The effective due
  // date is `resolutionDueAt + slaAccumulatedPauseMs + (paused ? now -
  // slaPausedAt : 0)`.
  slaPausedAt: timestamp("sla_paused_at", { withTimezone: true }),
  slaAccumulatedPauseMs: bigint("sla_accumulated_pause_ms", { mode: "number" })
    .notNull()
    .default(0),
  // With User automation: time the ticket entered with_user (cleared when
  // it leaves), and the timestamp at which we last sent the 3-day reminder
  // (so we don't spam).
  withUserSince: timestamp("with_user_since", { withTimezone: true }),
  withUserReminderSentAt: timestamp("with_user_reminder_sent_at", {
    withTimezone: true,
  }),
  // Last time the end-user replied (used for resolved→reopen detection
  // and the with_user idle timer).
  lastUserReplyAt: timestamp("last_user_reply_at", { withTimezone: true }),
  // Why a ticket was closed: e.g. "no_user_response",
  // "auto_resolved_timeout", or null for manual closure.
  closureReason: text("closure_reason"),
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
