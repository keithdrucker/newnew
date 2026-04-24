import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
} from "drizzle-orm/pg-core";

// Software applications used across EW Howell (M365, Bluebeam, Procore,
// SAGE 300, etc). Tracked centrally so admins can see ownership, license
// usage, and which department each app is tied to.
export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  vendor: text("vendor").notNull().default(""),
  category: text("category").notNull().default("other"),
  // active | piloting | deprecated
  status: text("status").notNull().default("active"),
  description: text("description").notNull().default(""),
  website: text("website"),
  ownerId: integer("owner_id"),
  departmentId: integer("department_id"),
  licenseSeats: integer("license_seats"),
  licenseUsed: integer("license_used"),
  monthlyCost: real("monthly_cost"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Application = typeof applicationsTable.$inferSelect;
