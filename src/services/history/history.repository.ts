import { and, desc, eq, lt } from "drizzle-orm";
import { getDatabase, readingHistory, readingHistoryEvents } from "@/services/db";
import type {
  GetMangaHistoryEventsInput,
  GetGroupedReadingHistoryInput,
  InsertReadingHistoryEventInput,
  MangaHistoryEventsPage,
  ReadingHistoryChapterItem,
  ReadingHistoryEntry,
  ReadingHistoryEvent,
  ReadingHistoryMangaGroup,
  UpsertReadingHistoryInput,
} from "./history.types";

const mapHistoryEntry = (
  entry: typeof readingHistory.$inferSelect
): ReadingHistoryEntry => ({
  id: entry.id,
  sourceId: entry.sourceId,
  mangaId: entry.mangaId,
  chapterId: entry.chapterId,
  mangaTitle: entry.mangaTitle,
  mangaThumbnailUrl: entry.mangaThumbnailUrl ?? undefined,
  chapterTitle: entry.chapterTitle ?? undefined,
  chapterNumber: entry.chapterNumber ?? undefined,
  pageIndex: entry.pageIndex,
  totalPages: entry.totalPages ?? undefined,
  updatedAt: entry.updatedAt,
});

const mapHistoryEvent = (
  event: typeof readingHistoryEvents.$inferSelect
): ReadingHistoryEvent => ({
  id: event.id,
  sourceId: event.sourceId,
  mangaId: event.mangaId,
  chapterId: event.chapterId,
  mangaTitle: event.mangaTitle,
  mangaThumbnailUrl: event.mangaThumbnailUrl ?? undefined,
  chapterTitle: event.chapterTitle ?? undefined,
  chapterNumber: event.chapterNumber ?? undefined,
  pageIndex: event.pageIndex,
  totalPages: event.totalPages ?? undefined,
  recordedAt: event.recordedAt,
});

export const upsertReadingHistoryEntry = (
  input: UpsertReadingHistoryInput
): void => {
  const db = getDatabase();
  const now = Date.now();

  db.insert(readingHistory)
    .values({
      sourceId: input.sourceId,
      mangaId: input.mangaId,
      chapterId: input.chapterId,
      mangaTitle: input.mangaTitle,
      mangaThumbnailUrl: input.mangaThumbnailUrl,
      chapterTitle: input.chapterTitle,
      chapterNumber: input.chapterNumber,
      pageIndex: input.pageIndex,
      totalPages: input.totalPages,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        readingHistory.sourceId,
        readingHistory.mangaId,
        readingHistory.chapterId,
      ],
      set: {
        mangaTitle: input.mangaTitle,
        mangaThumbnailUrl: input.mangaThumbnailUrl,
        chapterTitle: input.chapterTitle,
        chapterNumber: input.chapterNumber,
        pageIndex: input.pageIndex,
        totalPages: input.totalPages,
        updatedAt: now,
      },
    })
    .run();
};

export const getReadingHistoryEntries = (limit = 50): ReadingHistoryEntry[] => {
  const db = getDatabase();
  const entries = db
    .select()
    .from(readingHistory)
    .orderBy(desc(readingHistory.updatedAt))
    .limit(Math.max(1, limit))
    .all();

  return entries.map(mapHistoryEntry);
};

export const getLatestMangaHistoryEntry = (
  sourceId: string,
  mangaId: string
): ReadingHistoryEntry | null => {
  const db = getDatabase();
  const entry = db
    .select()
    .from(readingHistory)
    .where(and(eq(readingHistory.sourceId, sourceId), eq(readingHistory.mangaId, mangaId)))
    .orderBy(desc(readingHistory.updatedAt))
    .limit(1)
    .get();

  return entry ? mapHistoryEntry(entry) : null;
};

export const getGroupedReadingHistory = (
  input: GetGroupedReadingHistoryInput = {}
): ReadingHistoryMangaGroup[] => {
  const db = getDatabase();
  const entryLimit = Math.max(1, input.entryLimit ?? 100);
  const perMangaChapterLimit = Math.max(1, input.perMangaChapterLimit ?? 5);
  const rows = db
    .select()
    .from(readingHistory)
    .orderBy(desc(readingHistory.updatedAt))
    .limit(entryLimit)
    .all();

  const grouped = new Map<
    string,
    {
      group: ReadingHistoryMangaGroup;
      chapterIds: Set<string>;
    }
  >();

  rows.forEach((row) => {
    const mangaKey = `${row.sourceId}::${row.mangaId}`;
    const chapterKey = `${row.sourceId}::${row.mangaId}::${row.chapterId}`;

    if (!grouped.has(mangaKey)) {
      grouped.set(mangaKey, {
        group: {
          sourceId: row.sourceId,
          mangaId: row.mangaId,
          mangaTitle: row.mangaTitle,
          mangaThumbnailUrl: row.mangaThumbnailUrl ?? undefined,
          latestReadAt: row.updatedAt,
          chapters: [],
        },
        chapterIds: new Set<string>(),
      });
    }

    const groupedValue = grouped.get(mangaKey);
    if (!groupedValue) {
      return;
    }

    groupedValue.group.latestReadAt = Math.max(groupedValue.group.latestReadAt, row.updatedAt);

    if (groupedValue.chapterIds.has(chapterKey)) {
      return;
    }

    if (groupedValue.group.chapters.length >= perMangaChapterLimit) {
      return;
    }

    const chapterItem: ReadingHistoryChapterItem = {
      sourceId: row.sourceId,
      mangaId: row.mangaId,
      chapterId: row.chapterId,
      chapterTitle: row.chapterTitle ?? undefined,
      chapterNumber: row.chapterNumber ?? undefined,
      pageIndex: row.pageIndex,
      totalPages: row.totalPages ?? undefined,
      updatedAt: row.updatedAt,
    };

    groupedValue.group.chapters.push(chapterItem);
    groupedValue.chapterIds.add(chapterKey);
  });

  return Array.from(grouped.values())
    .map((value) => value.group)
    .sort((left, right) => right.latestReadAt - left.latestReadAt);
};

export const insertReadingHistoryEvent = (
  input: InsertReadingHistoryEventInput
): void => {
  const db = getDatabase();

  db.insert(readingHistoryEvents)
    .values({
      sourceId: input.sourceId,
      mangaId: input.mangaId,
      chapterId: input.chapterId,
      mangaTitle: input.mangaTitle,
      mangaThumbnailUrl: input.mangaThumbnailUrl,
      chapterTitle: input.chapterTitle,
      chapterNumber: input.chapterNumber,
      pageIndex: input.pageIndex,
      totalPages: input.totalPages,
      recordedAt: input.recordedAt ?? Date.now(),
    })
    .run();
};

export const getMangaHistoryEventsPage = (
  sourceId: string,
  mangaId: string,
  input: GetMangaHistoryEventsInput = {}
): MangaHistoryEventsPage => {
  const db = getDatabase();
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const cursor = input.cursor;

  const whereClause = and(
    eq(readingHistoryEvents.sourceId, sourceId),
    eq(readingHistoryEvents.mangaId, mangaId),
    cursor !== undefined ? lt(readingHistoryEvents.id, cursor) : undefined
  );

  const rows = db
    .select()
    .from(readingHistoryEvents)
    .where(whereClause)
    .orderBy(desc(readingHistoryEvents.id))
    .limit(limit)
    .all();

  const items = rows.map(mapHistoryEvent);
  if (items.length > 0) {
    const nextCursor = rows.length === limit ? rows[rows.length - 1]?.id ?? null : null;

    return {
      items,
      nextCursor,
    };
  }

  // Backward compatibility: older builds only populated reading_history snapshots.
  // If timeline events are missing, surface snapshot entries as timeline rows.
  if (cursor === undefined) {
    const fallbackRows = db
      .select()
      .from(readingHistory)
      .where(and(eq(readingHistory.sourceId, sourceId), eq(readingHistory.mangaId, mangaId)))
      .orderBy(desc(readingHistory.updatedAt))
      .limit(limit)
      .all();

    if (fallbackRows.length > 0) {
      return {
        items: fallbackRows.map((row) => ({
          id: -row.id,
          sourceId: row.sourceId,
          mangaId: row.mangaId,
          chapterId: row.chapterId,
          mangaTitle: row.mangaTitle,
          mangaThumbnailUrl: row.mangaThumbnailUrl ?? undefined,
          chapterTitle: row.chapterTitle ?? undefined,
          chapterNumber: row.chapterNumber ?? undefined,
          pageIndex: row.pageIndex,
          totalPages: row.totalPages ?? undefined,
          recordedAt: row.updatedAt,
        })),
        nextCursor: null,
      };
    }
  }

  return {
    items: [],
    nextCursor: null,
  };
};
