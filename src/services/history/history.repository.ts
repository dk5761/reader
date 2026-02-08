import { and, desc, eq } from "drizzle-orm";
import { getDatabase, readingHistory } from "@/services/db";
import type {
  ReadingHistoryEntry,
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
