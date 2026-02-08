import { and, desc, eq } from "drizzle-orm";
import { getDatabase, readingHistory } from "@/services/db";
import type {
  GetGroupedReadingHistoryInput,
  ReadingHistoryChapterItem,
  ReadingHistoryEntry,
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
