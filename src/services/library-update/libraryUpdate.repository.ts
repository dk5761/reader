import { and, desc, eq } from "drizzle-orm";
import { getDatabase, libraryUpdateEvents, libraryUpdateState } from "@/services/db";
import type {
  InsertLibraryUpdateEventInput,
  LibraryUpdateEventEntry,
  LibraryUpdateStateEntry,
  UpsertLibraryUpdateStateInput,
} from "./libraryUpdate.types";

const mapLibraryUpdateState = (
  entry: typeof libraryUpdateState.$inferSelect
): LibraryUpdateStateEntry => ({
  id: entry.id,
  sourceId: entry.sourceId,
  mangaId: entry.mangaId,
  chapterCount: entry.chapterCount,
  latestChapterId: entry.latestChapterId ?? undefined,
  latestChapterTitle: entry.latestChapterTitle ?? undefined,
  latestChapterNumber: entry.latestChapterNumber ?? undefined,
  latestChapterUploadedAt: entry.latestChapterUploadedAt ?? undefined,
  latestChapterUploadedAtTs: entry.latestChapterUploadedAtTs ?? undefined,
  lastCheckedAt: entry.lastCheckedAt,
  lastUpdateDetectedAt: entry.lastUpdateDetectedAt ?? undefined,
  firstSyncedAt: entry.firstSyncedAt,
});

const mapLibraryUpdateEvent = (
  entry: typeof libraryUpdateEvents.$inferSelect
): LibraryUpdateEventEntry => ({
  id: entry.id,
  sourceId: entry.sourceId,
  mangaId: entry.mangaId,
  mangaTitle: entry.mangaTitle,
  mangaThumbnailUrl: entry.mangaThumbnailUrl ?? undefined,
  previousChapterCount: entry.previousChapterCount,
  newChapterCount: entry.newChapterCount,
  chapterDelta: entry.chapterDelta,
  previousLatestChapterUploadedAtTs: entry.previousLatestChapterUploadedAtTs ?? undefined,
  newLatestChapterUploadedAtTs: entry.newLatestChapterUploadedAtTs ?? undefined,
  detectionMode: entry.detectionMode as LibraryUpdateEventEntry["detectionMode"],
  detectedAt: entry.detectedAt,
});

export const getLibraryUpdateState = (
  sourceId: string,
  mangaId: string
): LibraryUpdateStateEntry | null => {
  const db = getDatabase();
  const entry = db
    .select()
    .from(libraryUpdateState)
    .where(
      and(
        eq(libraryUpdateState.sourceId, sourceId),
        eq(libraryUpdateState.mangaId, mangaId)
      )
    )
    .limit(1)
    .get();

  return entry ? mapLibraryUpdateState(entry) : null;
};

export const upsertLibraryUpdateState = (input: UpsertLibraryUpdateStateInput): void => {
  const db = getDatabase();
  const lastCheckedAt = input.lastCheckedAt ?? Date.now();

  db.insert(libraryUpdateState)
    .values({
      sourceId: input.sourceId,
      mangaId: input.mangaId,
      chapterCount: input.chapterCount,
      latestChapterId: input.latestChapterId,
      latestChapterTitle: input.latestChapterTitle,
      latestChapterNumber: input.latestChapterNumber,
      latestChapterUploadedAt: input.latestChapterUploadedAt,
      latestChapterUploadedAtTs: input.latestChapterUploadedAtTs,
      lastCheckedAt,
      lastUpdateDetectedAt: input.lastUpdateDetectedAt,
      firstSyncedAt: input.firstSyncedAt,
    })
    .onConflictDoUpdate({
      target: [libraryUpdateState.sourceId, libraryUpdateState.mangaId],
      set: {
        chapterCount: input.chapterCount,
        latestChapterId: input.latestChapterId,
        latestChapterTitle: input.latestChapterTitle,
        latestChapterNumber: input.latestChapterNumber,
        latestChapterUploadedAt: input.latestChapterUploadedAt,
        latestChapterUploadedAtTs: input.latestChapterUploadedAtTs,
        lastCheckedAt,
        lastUpdateDetectedAt: input.lastUpdateDetectedAt,
        firstSyncedAt: input.firstSyncedAt,
      },
    })
    .run();
};

export const insertLibraryUpdateEvent = (input: InsertLibraryUpdateEventInput): void => {
  const db = getDatabase();
  db.insert(libraryUpdateEvents)
    .values({
      sourceId: input.sourceId,
      mangaId: input.mangaId,
      mangaTitle: input.mangaTitle,
      mangaThumbnailUrl: input.mangaThumbnailUrl,
      previousChapterCount: input.previousChapterCount,
      newChapterCount: input.newChapterCount,
      chapterDelta: input.chapterDelta,
      previousLatestChapterUploadedAtTs: input.previousLatestChapterUploadedAtTs,
      newLatestChapterUploadedAtTs: input.newLatestChapterUploadedAtTs,
      detectionMode: input.detectionMode,
      detectedAt: input.detectedAt ?? Date.now(),
    })
    .run();
};

export const getRecentLibraryUpdateEvents = (limit = 20): LibraryUpdateEventEntry[] => {
  const db = getDatabase();
  const entries = db
    .select()
    .from(libraryUpdateEvents)
    .orderBy(desc(libraryUpdateEvents.detectedAt))
    .limit(Math.max(1, limit))
    .all();

  return entries.map(mapLibraryUpdateEvent);
};

export const getLatestUpdateEventForManga = (
  sourceId: string,
  mangaId: string
): LibraryUpdateEventEntry | null => {
  const db = getDatabase();
  const entry = db
    .select()
    .from(libraryUpdateEvents)
    .where(
      and(
        eq(libraryUpdateEvents.sourceId, sourceId),
        eq(libraryUpdateEvents.mangaId, mangaId)
      )
    )
    .orderBy(desc(libraryUpdateEvents.detectedAt))
    .limit(1)
    .get();

  return entry ? mapLibraryUpdateEvent(entry) : null;
};
