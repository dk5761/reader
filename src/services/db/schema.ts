import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const libraryEntries = sqliteTable(
  "library_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id").notNull(),
    mangaId: text("manga_id").notNull(),
    mangaUrl: text("manga_url").notNull(),
    title: text("title").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    description: text("description"),
    status: text("status"),
    addedAt: integer("added_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastReadAt: integer("last_read_at"),
  },
  (table) => [
    uniqueIndex("library_entries_source_manga_unique").on(table.sourceId, table.mangaId),
    index("library_entries_updated_at_idx").on(table.updatedAt),
  ]
);

export const readingProgress = sqliteTable(
  "reading_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id").notNull(),
    mangaId: text("manga_id").notNull(),
    chapterId: text("chapter_id").notNull(),
    chapterTitle: text("chapter_title"),
    chapterNumber: real("chapter_number"),
    pageIndex: integer("page_index").notNull().default(0),
    totalPages: integer("total_pages"),
    isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("reading_progress_source_manga_chapter_unique").on(
      table.sourceId,
      table.mangaId,
      table.chapterId
    ),
    index("reading_progress_updated_at_idx").on(table.updatedAt),
  ]
);

export const readingHistory = sqliteTable(
  "reading_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id").notNull(),
    mangaId: text("manga_id").notNull(),
    chapterId: text("chapter_id").notNull(),
    mangaTitle: text("manga_title").notNull(),
    mangaThumbnailUrl: text("manga_thumbnail_url"),
    chapterTitle: text("chapter_title"),
    chapterNumber: real("chapter_number"),
    pageIndex: integer("page_index").notNull().default(0),
    totalPages: integer("total_pages"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("reading_history_source_manga_chapter_unique").on(
      table.sourceId,
      table.mangaId,
      table.chapterId
    ),
    index("reading_history_updated_at_idx").on(table.updatedAt),
  ]
);

export const readingHistoryEvents = sqliteTable(
  "reading_history_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id").notNull(),
    mangaId: text("manga_id").notNull(),
    chapterId: text("chapter_id").notNull(),
    mangaTitle: text("manga_title").notNull(),
    mangaThumbnailUrl: text("manga_thumbnail_url"),
    chapterTitle: text("chapter_title"),
    chapterNumber: real("chapter_number"),
    pageIndex: integer("page_index").notNull().default(0),
    totalPages: integer("total_pages"),
    recordedAt: integer("recorded_at").notNull(),
  },
  (table) => [
    index("reading_history_events_source_manga_recorded_at_idx").on(
      table.sourceId,
      table.mangaId,
      table.recordedAt
    ),
    index("reading_history_events_source_manga_chapter_recorded_at_idx").on(
      table.sourceId,
      table.mangaId,
      table.chapterId,
      table.recordedAt
    ),
  ]
);

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey(),
  allowNsfwSources: integer("allow_nsfw_sources", { mode: "boolean" })
    .notNull()
    .default(false),
  defaultReaderMode: text("default_reader_mode").notNull().default("vertical"),
  updatedAt: integer("updated_at").notNull(),
});

export type LibraryEntryRow = typeof libraryEntries.$inferSelect;
export type ReadingProgressRow = typeof readingProgress.$inferSelect;
export type ReadingHistoryRow = typeof readingHistory.$inferSelect;
export type ReadingHistoryEventRow = typeof readingHistoryEvents.$inferSelect;
export type AppSettingsRow = typeof appSettings.$inferSelect;
