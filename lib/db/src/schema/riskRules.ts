import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const riskRulesTable = pgTable("risk_rules", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().unique(),
  riskLevel: text("risk_level").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type RiskRule = typeof riskRulesTable.$inferSelect;
