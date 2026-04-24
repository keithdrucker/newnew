import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const departmentSettingsTable = pgTable("department_settings", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().unique(),
  portalEnabled: boolean("portal_enabled").notNull().default(true),
  portalTitle: text("portal_title").notNull().default("Help Center"),
  portalWelcome: text("portal_welcome")
    .notNull()
    .default("Welcome — submit a request and we'll get back to you shortly."),
  defaultPriority: text("default_priority").notNull().default("medium"),
  slaResponseMinutes: integer("sla_response_minutes").notNull().default(60),
  slaResolutionMinutes: integer("sla_resolution_minutes")
    .notNull()
    .default(60 * 24),
  autoAssign: boolean("auto_assign").notNull().default(true),
  notifyOnNewTicket: boolean("notify_on_new_ticket").notNull().default(true),
  notifyOnSlaBreach: boolean("notify_on_sla_breach").notNull().default(true),
  allowEndUserAttachments: boolean("allow_end_user_attachments")
    .notNull()
    .default(true),
  requireCategory: boolean("require_category").notNull().default(false),
  businessHoursStart: text("business_hours_start").notNull().default("09:00"),
  businessHoursEnd: text("business_hours_end").notNull().default("17:00"),
  ticketCategories: text("ticket_categories")
    .array()
    .notNull()
    .default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type DepartmentSettings = typeof departmentSettingsTable.$inferSelect;
