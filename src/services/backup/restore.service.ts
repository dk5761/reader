import { and, eq } from "drizzle-orm";
import {
  getDatabase,
  getSQLiteDatabase,
  libraryCategories,
  libraryEntries,
  libraryEntryCategories,
  libraryUpdateEvents,
  libraryUpdateState,
  libraryViewSettings,
  readingHistory,
  readingHistoryEvents,
  readingProgress,
  appSettings,
  globalSearchSettings,
} from "@/services/db";
import type { BackupData, BackupTables } from "./backup.types";

const restoreTable = <T extends { id: number }>(
  table: any,
  data: T[],
  getId: (item: T) => number
) => {
  if (data.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDb = getSQLiteDatabase();

  sqliteDb.withTransactionSync(() => {
    data.forEach((item) => {
      const { id, ...dataWithoutId } = item as any;
      db.insert(table)
        .values(dataWithoutId)
        .onConflictDoUpdate({
          target: table.id,
          set: {
            ...dataWithoutId,
          },
        })
        .run();
    });
  });
};

const restoreLibraryEntries = (entries: BackupTables["library_entries"]) => {
  if (entries.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDb = getSQLiteDatabase();

  sqliteDb.withTransactionSync(() => {
    entries.forEach((entry) => {
      const { id, ...dataWithoutId } = entry;
      db.insert(libraryEntries)
        .values(dataWithoutId)
        .onConflictDoUpdate({
          target: [libraryEntries.sourceId, libraryEntries.mangaId],
          set: {
            mangaUrl: dataWithoutId.mangaUrl,
            title: dataWithoutId.title,
            thumbnailUrl: dataWithoutId.thumbnailUrl,
            description: dataWithoutId.description,
            status: dataWithoutId.status,
            updatedAt: dataWithoutId.updatedAt,
            lastReadAt: dataWithoutId.lastReadAt,
          },
        })
        .run();
    });
  });
};

const restoreCategories = (categories: BackupTables["library_categories"]) => {
  if (categories.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDb = getSQLiteDatabase();

  sqliteDb.withTransactionSync(() => {
    categories.forEach((category) => {
      const { id, ...dataWithoutId } = category;
      db.insert(libraryCategories)
        .values(dataWithoutId)
        .onConflictDoUpdate({
          target: [libraryCategories.normalizedName],
          set: {
            name: dataWithoutId.name,
            position: dataWithoutId.position,
            updatedAt: dataWithoutId.updatedAt,
          },
        })
        .run();
    });
  });
};

const restoreEntryCategories = (
  entryCategories: BackupTables["library_entry_categories"]
) => {
  if (entryCategories.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDb = getSQLiteDatabase();

  sqliteDb.withTransactionSync(() => {
    entryCategories.forEach((ec) => {
      const { id, ...dataWithoutId } = ec;
      db.insert(libraryEntryCategories)
        .values(dataWithoutId)
        .onConflictDoNothing({
          target: [
            libraryEntryCategories.libraryEntryId,
            libraryEntryCategories.categoryId,
          ],
        })
        .run();
    });
  });
};

const restoreProgress = (progress: BackupTables["reading_progress"]) => {
  if (progress.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDb = getSQLiteDatabase();

  sqliteDb.withTransactionSync(() => {
    progress.forEach((p) => {
      const { id, ...dataWithoutId } = p;
      db.insert(readingProgress)
        .values(dataWithoutId)
        .onConflictDoUpdate({
          target: [
            readingProgress.sourceId,
            readingProgress.mangaId,
            readingProgress.chapterId,
          ],
          set: {
            chapterTitle: dataWithoutId.chapterTitle,
            chapterNumber: dataWithoutId.chapterNumber,
            pageIndex: dataWithoutId.pageIndex,
            totalPages: dataWithoutId.totalPages,
            isCompleted: dataWithoutId.isCompleted,
            updatedAt: dataWithoutId.updatedAt,
          },
        })
        .run();
    });
  });
};

const restoreHistory = (history: BackupTables["reading_history"]) => {
  if (history.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDb = getSQLiteDatabase();

  sqliteDb.withTransactionSync(() => {
    history.forEach((h) => {
      const { id, ...dataWithoutId } = h;
      db.insert(readingHistory)
        .values(dataWithoutId)
        .onConflictDoUpdate({
          target: [
            readingHistory.sourceId,
            readingHistory.mangaId,
            readingHistory.chapterId,
          ],
          set: {
            mangaTitle: dataWithoutId.mangaTitle,
            mangaThumbnailUrl: dataWithoutId.mangaThumbnailUrl,
            chapterTitle: dataWithoutId.chapterTitle,
            chapterNumber: dataWithoutId.chapterNumber,
            pageIndex: dataWithoutId.pageIndex,
            totalPages: dataWithoutId.totalPages,
            updatedAt: dataWithoutId.updatedAt,
          },
        })
        .run();
    });
  });
};

const restoreHistoryEvents = (
  events: BackupTables["reading_history_events"]
) => {
  if (events.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDb = getSQLiteDatabase();

  sqliteDb.withTransactionSync(() => {
    events.forEach((e) => {
      const { id, ...dataWithoutId } = e;
      db.insert(readingHistoryEvents).values(dataWithoutId).run();
    });
  });
};

const restoreAppSettings = (settings: BackupTables["app_settings"]) => {
  if (settings.length === 0) {
    return;
  }

  const db = getDatabase();

  settings.forEach((s) => {
    const { id, ...dataWithoutId } = s;
    db.insert(appSettings)
      .values(dataWithoutId)
      .onConflictDoUpdate({
        target: appSettings.id,
        set: {
          allowNsfwSources: dataWithoutId.allowNsfwSources,
          defaultReaderMode: dataWithoutId.defaultReaderMode,
          updatedAt: dataWithoutId.updatedAt,
        },
      })
      .run();
  });
};

const restoreGlobalSearchSettings = (
  settings: BackupTables["global_search_settings"]
) => {
  if (settings.length === 0) {
    return;
  }

  const db = getDatabase();

  settings.forEach((s) => {
    const { id, ...dataWithoutId } = s;
    db.insert(globalSearchSettings)
      .values(dataWithoutId)
      .onConflictDoUpdate({
        target: globalSearchSettings.id,
        set: {
          selectedSourceIdsJson: dataWithoutId.selectedSourceIdsJson,
          updatedAt: dataWithoutId.updatedAt,
        },
      })
      .run();
  });
};

const restoreLibraryViewSettings = (
  settings: BackupTables["library_view_settings"]
) => {
  if (settings.length === 0) {
    return;
  }

  const db = getDatabase();

  settings.forEach((s) => {
    const { id, ...dataWithoutId } = s;
    db.insert(libraryViewSettings)
      .values(dataWithoutId)
      .onConflictDoUpdate({
        target: libraryViewSettings.id,
        set: {
          activeCategoryId: dataWithoutId.activeCategoryId,
          sortKey: dataWithoutId.sortKey,
          sortDirection: dataWithoutId.sortDirection,
          statusFilter: dataWithoutId.statusFilter,
          sourceFilterJson: dataWithoutId.sourceFilterJson,
          updatedAt: dataWithoutId.updatedAt,
        },
      })
      .run();
  });
};

const restoreLibraryUpdateState = (
  state: BackupTables["library_update_state"]
) => {
  if (state.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDb = getSQLiteDatabase();

  sqliteDb.withTransactionSync(() => {
    state.forEach((s) => {
      const { id, ...dataWithoutId } = s;
      db.insert(libraryUpdateState)
        .values(dataWithoutId)
        .onConflictDoUpdate({
          target: [libraryUpdateState.sourceId, libraryUpdateState.mangaId],
          set: {
            chapterCount: dataWithoutId.chapterCount,
            latestChapterId: dataWithoutId.latestChapterId,
            latestChapterTitle: dataWithoutId.latestChapterTitle,
            latestChapterNumber: dataWithoutId.latestChapterNumber,
            latestChapterUploadedAt: dataWithoutId.latestChapterUploadedAt,
            latestChapterUploadedAtTs: dataWithoutId.latestChapterUploadedAtTs,
            lastCheckedAt: dataWithoutId.lastCheckedAt,
            lastUpdateDetectedAt: dataWithoutId.lastUpdateDetectedAt,
            firstSyncedAt: dataWithoutId.firstSyncedAt,
          },
        })
        .run();
    });
  });
};

const restoreLibraryUpdateEvents = (
  events: BackupTables["library_update_events"]
) => {
  if (events.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDb = getSQLiteDatabase();

  sqliteDb.withTransactionSync(() => {
    events.forEach((e) => {
      const { id, ...dataWithoutId } = e;
      db.insert(libraryUpdateEvents).values(dataWithoutId).run();
    });
  });
};

export const importDatabase = (data: BackupData): void => {
  const { tables } = data;

  // Restore in order of dependencies
  restoreLibraryEntries(tables.library_entries);
  restoreCategories(tables.library_categories);
  restoreEntryCategories(tables.library_entry_categories);
  restoreProgress(tables.reading_progress);
  restoreHistory(tables.reading_history);
  restoreHistoryEvents(tables.reading_history_events);
  restoreAppSettings(tables.app_settings);
  restoreGlobalSearchSettings(tables.global_search_settings);
  restoreLibraryViewSettings(tables.library_view_settings);
  restoreLibraryUpdateState(tables.library_update_state);
  restoreLibraryUpdateEvents(tables.library_update_events);
};
