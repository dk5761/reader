import { and, desc, eq } from "drizzle-orm";
import { getDatabase, getSQLiteDatabase, readingProgress } from "@/services/db";
import type {
  MangaLatestProgress,
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

export const upsertReadingProgressMany = (inputs: UpsertReadingProgressInput[]): void => {
  if (inputs.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDatabase = getSQLiteDatabase();
  const now = Date.now();

  sqliteDatabase.withTransactionSync(() => {
    inputs.forEach((input) => {
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
    });
  });
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

export const getChapterProgress = (
  sourceId: string,
  mangaId: string,
  chapterId: string
): ReadingProgressEntry | null => {
  const db = getDatabase();
  const entry = db
    .select()
    .from(readingProgress)
    .where(
      and(
        eq(readingProgress.sourceId, sourceId),
        eq(readingProgress.mangaId, mangaId),
        eq(readingProgress.chapterId, chapterId)
      )
    )
    .limit(1)
    .get();

  return entry ? mapProgressEntry(entry) : null;
};

export const getLatestMangaProgress = (
  sourceId: string,
  mangaId: string
): MangaLatestProgress | null => {
  const db = getDatabase();
  const entry = db
    .select({
      sourceId: readingProgress.sourceId,
      mangaId: readingProgress.mangaId,
      chapterId: readingProgress.chapterId,
      pageIndex: readingProgress.pageIndex,
      updatedAt: readingProgress.updatedAt,
    })
    .from(readingProgress)
    .where(
      and(eq(readingProgress.sourceId, sourceId), eq(readingProgress.mangaId, mangaId))
    )
    .orderBy(desc(readingProgress.updatedAt))
    .limit(1)
    .get();

  return entry ?? null;
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

export const clearChapterReadingProgressMany = (input: {
  sourceId: string;
  mangaId: string;
  chapterIds: string[];
}): void => {
  const chapterIds = [...new Set(input.chapterIds)];
  if (chapterIds.length === 0) {
    return;
  }

  const db = getDatabase();
  const sqliteDatabase = getSQLiteDatabase();

  sqliteDatabase.withTransactionSync(() => {
    chapterIds.forEach((chapterId) => {
      db.delete(readingProgress)
        .where(
          and(
            eq(readingProgress.sourceId, input.sourceId),
            eq(readingProgress.mangaId, input.mangaId),
            eq(readingProgress.chapterId, chapterId)
          )
        )
        .run();
    });
  });
};
