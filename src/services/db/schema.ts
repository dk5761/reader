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

export const libraryCategories = sqliteTable(
  "library_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("library_categories_normalized_name_unique").on(table.normalizedName),
    index("library_categories_position_idx").on(table.position),
  ]
);

export const libraryEntryCategories = sqliteTable(
  "library_entry_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    libraryEntryId: integer("library_entry_id").notNull(),
    categoryId: integer("category_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("library_entry_categories_entry_category_unique").on(
      table.libraryEntryId,
      table.categoryId
    ),
    index("library_entry_categories_category_idx").on(table.categoryId),
    index("library_entry_categories_entry_idx").on(table.libraryEntryId),
  ]
);

export const libraryViewSettings = sqliteTable("library_view_settings", {
  id: integer("id").primaryKey(),
  activeCategoryId: integer("active_category_id"),
  sortKey: text("sort_key").notNull().default("updatedAt"),
  sortDirection: text("sort_direction").notNull().default("desc"),
  statusFilter: text("status_filter").notNull().default("all"),
  sourceFilterJson: text("source_filter_json").notNull().default("[]"),
  updatedAt: integer("updated_at").notNull(),
});

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
  webtoonWindowAhead: integer("webtoon_window_ahead").notNull().default(6),
  webtoonWindowBehind: integer("webtoon_window_behind").notNull().default(1),
  webtoonForegroundConcurrency: integer("webtoon_foreground_concurrency")
    .notNull()
    .default(1),
  webtoonBackgroundConcurrency: integer("webtoon_background_concurrency")
    .notNull()
    .default(1),
  webtoonChapterPreloadLeadPages: integer("webtoon_chapter_preload_lead_pages")
    .notNull()
    .default(4),
  readerMagnifierEnabled: integer("reader_magnifier_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  readerMagnifierBubbleSize: integer("reader_magnifier_bubble_size")
    .notNull()
    .default(180),
  readerMagnifierZoomScale: real("reader_magnifier_zoom_scale")
    .notNull()
    .default(2.2),
  readerMagnifierHoldDurationMs: integer("reader_magnifier_hold_duration_ms")
    .notNull()
    .default(450),
  updatedAt: integer("updated_at").notNull(),
});

export const globalSearchSettings = sqliteTable("global_search_settings", {
  id: integer("id").primaryKey(),
  selectedSourceIdsJson: text("selected_source_ids_json").notNull().default("[]"),
  updatedAt: integer("updated_at").notNull(),
});

export const libraryUpdateState = sqliteTable(
  "library_update_state",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id").notNull(),
    mangaId: text("manga_id").notNull(),
    chapterCount: integer("chapter_count").notNull().default(0),
    latestChapterId: text("latest_chapter_id"),
    latestChapterTitle: text("latest_chapter_title"),
    latestChapterNumber: real("latest_chapter_number"),
    latestChapterUploadedAt: text("latest_chapter_uploaded_at"),
    latestChapterUploadedAtTs: integer("latest_chapter_uploaded_at_ts"),
    lastCheckedAt: integer("last_checked_at").notNull(),
    lastUpdateDetectedAt: integer("last_update_detected_at"),
    firstSyncedAt: integer("first_synced_at").notNull(),
  },
  (table) => [
    uniqueIndex("library_update_state_source_manga_unique").on(
      table.sourceId,
      table.mangaId
    ),
    index("library_update_state_last_checked_at_idx").on(table.lastCheckedAt),
    index("library_update_state_last_update_detected_at_idx").on(table.lastUpdateDetectedAt),
  ]
);

export const libraryUpdateEvents = sqliteTable(
  "library_update_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: text("source_id").notNull(),
    mangaId: text("manga_id").notNull(),
    mangaTitle: text("manga_title").notNull(),
    mangaThumbnailUrl: text("manga_thumbnail_url"),
    previousChapterCount: integer("previous_chapter_count").notNull(),
    newChapterCount: integer("new_chapter_count").notNull(),
    chapterDelta: integer("chapter_delta").notNull(),
    previousLatestChapterUploadedAtTs: integer("previous_latest_chapter_uploaded_at_ts"),
    newLatestChapterUploadedAtTs: integer("new_latest_chapter_uploaded_at_ts"),
    detectionMode: text("detection_mode").notNull(),
    detectedAt: integer("detected_at").notNull(),
  },
  (table) => [
    index("library_update_events_detected_at_idx").on(table.detectedAt),
    index("library_update_events_source_manga_detected_at_idx").on(
      table.sourceId,
      table.mangaId,
      table.detectedAt
    ),
  ]
);

export const libraryUpdateFeedState = sqliteTable("library_update_feed_state", {
  id: integer("id").primaryKey(),
  lastSeenEventId: integer("last_seen_event_id"),
  updatedAt: integer("updated_at").notNull(),
});

export type LibraryEntryRow = typeof libraryEntries.$inferSelect;
export type LibraryCategoryRow = typeof libraryCategories.$inferSelect;
export type LibraryEntryCategoryRow = typeof libraryEntryCategories.$inferSelect;
export type LibraryViewSettingsRow = typeof libraryViewSettings.$inferSelect;
export type ReadingProgressRow = typeof readingProgress.$inferSelect;
export type ReadingHistoryRow = typeof readingHistory.$inferSelect;
export type ReadingHistoryEventRow = typeof readingHistoryEvents.$inferSelect;
export type AppSettingsRow = typeof appSettings.$inferSelect;
export type GlobalSearchSettingsRow = typeof globalSearchSettings.$inferSelect;
export type LibraryUpdateStateRow = typeof libraryUpdateState.$inferSelect;
export type LibraryUpdateEventRow = typeof libraryUpdateEvents.$inferSelect;
export type LibraryUpdateFeedStateRow = typeof libraryUpdateFeedState.$inferSelect;
