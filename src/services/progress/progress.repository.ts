import { and, desc, eq } from "drizzle-orm";
import { getDatabase, readingProgress } from "@/services/db";
import type {
  ReadingProgressEntry,
  UpsertReadingProgressInput,
} from "./progress.types";

const mapProgressEntry = (
  entry: typeof readingProgress.$inferSelect
): ReadingProgressEntry => ({
  id: entry.id,
  sourceId: entry.sourceId,
  mangaId: entry.mangaId,
  chapterId: entry.chapterId,
  chapterTitle: entry.chapterTitle ?? undefined,
  chapterNumber: entry.chapterNumber ?? undefined,
  pageIndex: entry.pageIndex,
  totalPages: entry.totalPages ?? undefined,
  isCompleted: entry.isCompleted,
  updatedAt: entry.updatedAt,
});

export const upsertReadingProgress = (input: UpsertReadingProgressInput): void => {
  const db = getDatabase();
  const now = Date.now();

  db.insert(readingProgress)
    .values({
      sourceId: input.sourceId,
      mangaId: input.mangaId,
      chapterId: input.chapterId,
      chapterTitle: input.chapterTitle,
      chapterNumber: input.chapterNumber,
      pageIndex: input.pageIndex,
      totalPages: input.totalPages,
      isCompleted: input.isCompleted ?? false,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        readingProgress.sourceId,
        readingProgress.mangaId,
        readingProgress.chapterId,
      ],
      set: {
        chapterTitle: input.chapterTitle,
        chapterNumber: input.chapterNumber,
        pageIndex: input.pageIndex,
        totalPages: input.totalPages,
        isCompleted: input.isCompleted ?? false,
        updatedAt: now,
      },
    })
    .run();
};

export const getMangaReadingProgress = (
  sourceId: string,
  mangaId: string
): ReadingProgressEntry[] => {
  const db = getDatabase();
  const entries = db
    .select()
    .from(readingProgress)
    .where(
      and(eq(readingProgress.sourceId, sourceId), eq(readingProgress.mangaId, mangaId))
    )
    .orderBy(desc(readingProgress.updatedAt))
    .all();

  return entries.map(mapProgressEntry);
};

export const getLatestReadingProgress = (limit = 20): ReadingProgressEntry[] => {
  const db = getDatabase();
  const entries = db
    .select()
    .from(readingProgress)
    .orderBy(desc(readingProgress.updatedAt))
    .limit(Math.max(1, limit))
    .all();

  return entries.map(mapProgressEntry);
};

export const clearChapterReadingProgress = (
  sourceId: string,
  mangaId: string,
  chapterId: string
): void => {
  const db = getDatabase();
  db.delete(readingProgress)
    .where(
      and(
        eq(readingProgress.sourceId, sourceId),
        eq(readingProgress.mangaId, mangaId),
        eq(readingProgress.chapterId, chapterId)
      )
    )
    .run();
};
