import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const kbArticlesTable = pgTable("kb_articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  departmentId: integer("department_id").notNull(),
  authorId: integer("author_id").notNull(),
  tags: text("tags").array().notNull().default([]),
  views: integer("views").notNull().default(0),
  source: text("source").notNull().default("manual"),
  syncStatus: text("sync_status").notNull().default("completed"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type KbArticle = typeof kbArticlesTable.$inferSelect;
