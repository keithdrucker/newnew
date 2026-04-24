import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  assetTag: text("asset_tag").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull().default("laptop"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  serialNumber: text("serial_number"),
  location: text("location").notNull().default(""),
  site: text("site").notNull().default("office"), // office | jobsite
  status: text("status").notNull().default("in_use"),
  assignedToId: integer("assigned_to_id"),
  departmentId: integer("department_id"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  warrantyEndsAt: timestamp("warranty_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Asset = typeof assetsTable.$inferSelect;
