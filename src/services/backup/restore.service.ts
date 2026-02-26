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
  libraryUpdateFeedState,
} from "@/services/db";
import type { BackupData, BackupTables } from "./backup.types";

const LEGACY_SOURCE_ID = "readcomiconline";
const CURRENT_SOURCE_ID = "readcomicsonline";

const normalizeSourceId = (sourceId: string): string =>
  sourceId === LEGACY_SOURCE_ID ? CURRENT_SOURCE_ID : sourceId;

const normalizeSourceIdListJson = (value: string): string => {
  const raw = value.trim();
  if (!raw) {
    return value;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return value;
  }

  if (!Array.isArray(parsed)) {
    return value;
  }

  const normalized = parsed
    .map((entry) => (typeof entry === "string" ? normalizeSourceId(entry.trim()) : ""))
    .filter(Boolean);

  return JSON.stringify(Array.from(new Set(normalized)));
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
      const normalizedData = {
        ...dataWithoutId,
        sourceId: normalizeSourceId(dataWithoutId.sourceId),
      };
      db.insert(libraryEntries)
        .values(normalizedData)
        .onConflictDoUpdate({
          target: [libraryEntries.sourceId, libraryEntries.mangaId],
          set: {
            mangaUrl: normalizedData.mangaUrl,
            title: normalizedData.title,
            thumbnailUrl: normalizedData.thumbnailUrl,
            description: normalizedData.description,
            status: normalizedData.status,
            updatedAt: normalizedData.updatedAt,
            lastReadAt: normalizedData.lastReadAt,
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
      const normalizedData = {
        ...dataWithoutId,
        sourceId: normalizeSourceId(dataWithoutId.sourceId),
      };
      db.insert(readingProgress)
        .values(normalizedData)
        .onConflictDoUpdate({
          target: [
            readingProgress.sourceId,
            readingProgress.mangaId,
            readingProgress.chapterId,
          ],
          set: {
            chapterTitle: normalizedData.chapterTitle,
            chapterNumber: normalizedData.chapterNumber,
            pageIndex: normalizedData.pageIndex,
            totalPages: normalizedData.totalPages,
            isCompleted: normalizedData.isCompleted,
            updatedAt: normalizedData.updatedAt,
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
      const normalizedData = {
        ...dataWithoutId,
        sourceId: normalizeSourceId(dataWithoutId.sourceId),
      };
      db.insert(readingHistory)
        .values(normalizedData)
        .onConflictDoUpdate({
          target: [
            readingHistory.sourceId,
            readingHistory.mangaId,
            readingHistory.chapterId,
          ],
          set: {
            mangaTitle: normalizedData.mangaTitle,
            mangaThumbnailUrl: normalizedData.mangaThumbnailUrl,
            chapterTitle: normalizedData.chapterTitle,
            chapterNumber: normalizedData.chapterNumber,
            pageIndex: normalizedData.pageIndex,
            totalPages: normalizedData.totalPages,
            updatedAt: normalizedData.updatedAt,
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
      const normalizedData = {
        ...dataWithoutId,
        sourceId: normalizeSourceId(dataWithoutId.sourceId),
      };
      db.insert(readingHistoryEvents).values(normalizedData).run();
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
    const normalizedSettings = {
      ...dataWithoutId,
      webtoonWindowAhead: dataWithoutId.webtoonWindowAhead ?? 6,
      webtoonWindowBehind: dataWithoutId.webtoonWindowBehind ?? 1,
      webtoonForegroundConcurrency: dataWithoutId.webtoonForegroundConcurrency ?? 1,
      webtoonBackgroundConcurrency: dataWithoutId.webtoonBackgroundConcurrency ?? 1,
      webtoonChapterPreloadLeadPages:
        dataWithoutId.webtoonChapterPreloadLeadPages ?? 4,
      readerMagnifierEnabled: dataWithoutId.readerMagnifierEnabled ?? true,
      readerMagnifierBubbleSize: dataWithoutId.readerMagnifierBubbleSize ?? 180,
      readerMagnifierZoomScale: dataWithoutId.readerMagnifierZoomScale ?? 2.2,
      readerMagnifierHoldDurationMs: dataWithoutId.readerMagnifierHoldDurationMs ?? 450,
      readerMagnifierSelectedSourceIdsJson: normalizeSourceIdListJson(
        dataWithoutId.readerMagnifierSelectedSourceIdsJson ?? "[]"
      ),
    };
    db.insert(appSettings)
      .values(normalizedSettings)
      .onConflictDoUpdate({
        target: appSettings.id,
        set: {
          allowNsfwSources: normalizedSettings.allowNsfwSources,
          defaultReaderMode: normalizedSettings.defaultReaderMode,
          webtoonWindowAhead: normalizedSettings.webtoonWindowAhead,
          webtoonWindowBehind: normalizedSettings.webtoonWindowBehind,
          webtoonForegroundConcurrency: normalizedSettings.webtoonForegroundConcurrency,
          webtoonBackgroundConcurrency: normalizedSettings.webtoonBackgroundConcurrency,
          webtoonChapterPreloadLeadPages: normalizedSettings.webtoonChapterPreloadLeadPages,
          readerMagnifierEnabled: normalizedSettings.readerMagnifierEnabled,
          readerMagnifierBubbleSize: normalizedSettings.readerMagnifierBubbleSize,
          readerMagnifierZoomScale: normalizedSettings.readerMagnifierZoomScale,
          readerMagnifierHoldDurationMs: normalizedSettings.readerMagnifierHoldDurationMs,
          readerMagnifierSelectedSourceIdsJson:
            normalizedSettings.readerMagnifierSelectedSourceIdsJson,
          updatedAt: normalizedSettings.updatedAt,
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
    const normalizedSourceIdsJson = normalizeSourceIdListJson(
      dataWithoutId.selectedSourceIdsJson
    );
    db.insert(globalSearchSettings)
      .values({
        ...dataWithoutId,
        selectedSourceIdsJson: normalizedSourceIdsJson,
      })
      .onConflictDoUpdate({
        target: globalSearchSettings.id,
        set: {
          selectedSourceIdsJson: normalizedSourceIdsJson,
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
    const normalizedSourceFilterJson = normalizeSourceIdListJson(
      dataWithoutId.sourceFilterJson
    );
    db.insert(libraryViewSettings)
      .values({
        ...dataWithoutId,
        sourceFilterJson: normalizedSourceFilterJson,
      })
      .onConflictDoUpdate({
        target: libraryViewSettings.id,
        set: {
          activeCategoryId: dataWithoutId.activeCategoryId,
          sortKey: dataWithoutId.sortKey,
          sortDirection: dataWithoutId.sortDirection,
          statusFilter: dataWithoutId.statusFilter,
          sourceFilterJson: normalizedSourceFilterJson,
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
      const normalizedData = {
        ...dataWithoutId,
        sourceId: normalizeSourceId(dataWithoutId.sourceId),
      };
      db.insert(libraryUpdateState)
        .values(normalizedData)
        .onConflictDoUpdate({
          target: [libraryUpdateState.sourceId, libraryUpdateState.mangaId],
          set: {
            chapterCount: normalizedData.chapterCount,
            latestChapterId: normalizedData.latestChapterId,
            latestChapterTitle: normalizedData.latestChapterTitle,
            latestChapterNumber: normalizedData.latestChapterNumber,
            latestChapterUploadedAt: normalizedData.latestChapterUploadedAt,
            latestChapterUploadedAtTs: normalizedData.latestChapterUploadedAtTs,
            lastCheckedAt: normalizedData.lastCheckedAt,
            lastUpdateDetectedAt: normalizedData.lastUpdateDetectedAt,
            firstSyncedAt: normalizedData.firstSyncedAt,
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
      const normalizedData = {
        ...dataWithoutId,
        sourceId: normalizeSourceId(dataWithoutId.sourceId),
      };
      db.insert(libraryUpdateEvents).values(normalizedData).run();
    });
  });
};

const restoreLibraryUpdateFeedState = (
  state: BackupTables["library_update_feed_state"]
) => {
  if (state.length === 0) {
    return;
  }

  const db = getDatabase();

  state.forEach((s) => {
    db.insert(libraryUpdateFeedState)
      .values({
        id: 1,
        lastSeenEventId: s.lastSeenEventId,
        updatedAt: s.updatedAt,
      })
      .onConflictDoUpdate({
        target: libraryUpdateFeedState.id,
        set: {
          lastSeenEventId: s.lastSeenEventId,
          updatedAt: s.updatedAt,
        },
      })
      .run();
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
  restoreLibraryUpdateFeedState(tables.library_update_feed_state ?? []);
};
