import type {
  LibraryEntryRow,
  LibraryCategoryRow,
  LibraryEntryCategoryRow,
  LibraryViewSettingsRow,
  ReadingProgressRow,
  ReadingHistoryRow,
  ReadingHistoryEventRow,
  AppSettingsRow,
  GlobalSearchSettingsRow,
  LibraryUpdateStateRow,
  LibraryUpdateEventRow,
  LibraryUpdateFeedStateRow,
} from "@/services/db/schema";

export interface BackupData {
  version: string;
  createdAt: string;
  tables: BackupTables;
}

export interface BackupTables {
  library_entries: LibraryEntryRow[];
  library_categories: LibraryCategoryRow[];
  library_entry_categories: LibraryEntryCategoryRow[];
  library_view_settings: LibraryViewSettingsRow[];
  reading_progress: ReadingProgressRow[];
  reading_history: ReadingHistoryRow[];
  reading_history_events: ReadingHistoryEventRow[];
  app_settings: AppSettingsRow[];
  global_search_settings: GlobalSearchSettingsRow[];
  library_update_state: LibraryUpdateStateRow[];
  library_update_events: LibraryUpdateEventRow[];
  library_update_feed_state: LibraryUpdateFeedStateRow[];
}

export interface BackupMetadata {
  version: string;
  createdAt: string;
  totalEntries: number;
  totalCategories: number;
  totalProgress: number;
  totalHistory: number;
  totalHistoryEvents: number;
  fileSize?: number;
}

export const getBackupMetadata = (data: BackupData): BackupMetadata => {
  const tables = data.tables;
  return {
    version: data.version,
    createdAt: data.createdAt,
    totalEntries: tables.library_entries.length,
    totalCategories: tables.library_categories.length,
    totalProgress: tables.reading_progress.length,
    totalHistory: tables.reading_history.length,
    totalHistoryEvents: tables.reading_history_events.length,
  };
};
