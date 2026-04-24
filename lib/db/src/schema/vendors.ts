import {
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// External suppliers / partners (software vendors, hardware resellers,
// MSPs, telecom carriers, consultants). Tracked here so applications and
// assets can reference a single source of truth for vendor contact info.
export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // software | hardware | services | telecom | consulting | other
  category: text("category").notNull().default("other"),
  // active | inactive
  status: text("status").notNull().default("active"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  website: text("website"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Vendor = typeof vendorsTable.$inferSelect;
