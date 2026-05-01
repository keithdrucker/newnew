import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const dashboardSectionVisibilityTable = pgTable(
  "dashboard_section_visibility",
  {
    id: serial("id").primaryKey(),
    dashboardKey: text("dashboard_key").notNull(),
    sectionKey: text("section_key").notNull(),
    isVisible: boolean("is_visible").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    dashboardSectionUnique: uniqueIndex(
      "dashboard_section_visibility_unique",
    ).on(table.dashboardKey, table.sectionKey),
  }),
);

export type DashboardSectionVisibilityRow =
  typeof dashboardSectionVisibilityTable.$inferSelect;
