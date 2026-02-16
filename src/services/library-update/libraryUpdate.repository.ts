import { and, desc, eq, gt, gte, lt } from "drizzle-orm";
import {
  getDatabase,
  libraryUpdateEvents,
  libraryUpdateFeedState,
  libraryUpdateState,
} from "@/services/db";
import type {
  GetLibraryUpdateEventsPageInput,
  InsertLibraryUpdateEventInput,
  LibraryUpdateEventEntry,
  LibraryUpdateEventsPage,
  LibraryUpdateFeedStateEntry,
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

const mapLibraryUpdateFeedState = (
  entry: typeof libraryUpdateFeedState.$inferSelect
): LibraryUpdateFeedStateEntry => ({
  id: entry.id,
  lastSeenEventId: entry.lastSeenEventId ?? undefined,
  updatedAt: entry.updatedAt,
});

const FEED_STATE_SINGLETON_ID = 1;
const DEFAULT_EVENTS_PAGE_SIZE = 30;

const ensureLibraryUpdateFeedState = (): LibraryUpdateFeedStateEntry => {
  const db = getDatabase();
  const existing = db
    .select()
    .from(libraryUpdateFeedState)
    .where(eq(libraryUpdateFeedState.id, FEED_STATE_SINGLETON_ID))
    .limit(1)
    .get();

  if (existing) {
    return mapLibraryUpdateFeedState(existing);
  }

  const latestEventId = getLatestLibraryUpdateEventId();
  const now = Date.now();

  db.insert(libraryUpdateFeedState)
    .values({
      id: FEED_STATE_SINGLETON_ID,
      lastSeenEventId: latestEventId,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: libraryUpdateFeedState.id,
    })
    .run();

  const ensured = db
    .select()
    .from(libraryUpdateFeedState)
    .where(eq(libraryUpdateFeedState.id, FEED_STATE_SINGLETON_ID))
    .limit(1)
    .get();

  if (ensured) {
    return mapLibraryUpdateFeedState(ensured);
  }

  return {
    id: FEED_STATE_SINGLETON_ID,
    lastSeenEventId: latestEventId ?? undefined,
    updatedAt: now,
  };
};

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

export const getLatestLibraryUpdateEventId = (): number | null => {
  const db = getDatabase();
  const latest = db
    .select({ id: libraryUpdateEvents.id })
    .from(libraryUpdateEvents)
    .orderBy(desc(libraryUpdateEvents.id))
    .limit(1)
    .get();

  return latest?.id ?? null;
};

export const getLibraryUpdateFeedState = (): LibraryUpdateFeedStateEntry =>
  ensureLibraryUpdateFeedState();

export const setLibraryUpdateFeedLastSeenEventId = (
  lastSeenEventId: number | null
): LibraryUpdateFeedStateEntry => {
  const db = getDatabase();
  const now = Date.now();

  ensureLibraryUpdateFeedState();

  db.update(libraryUpdateFeedState)
    .set({
      lastSeenEventId,
      updatedAt: now,
    })
    .where(eq(libraryUpdateFeedState.id, FEED_STATE_SINGLETON_ID))
    .run();

  return ensureLibraryUpdateFeedState();
};

export const getLibraryUpdateEventsPage = (
  input: GetLibraryUpdateEventsPageInput = {}
): LibraryUpdateEventsPage => {
  const db = getDatabase();
  const safeLimit = Math.max(1, input.limit ?? DEFAULT_EVENTS_PAGE_SIZE);
  const whereConditions = [];

  if (input.cursor !== undefined && input.cursor !== null) {
    whereConditions.push(lt(libraryUpdateEvents.id, input.cursor));
  }

  if (input.sourceId) {
    whereConditions.push(eq(libraryUpdateEvents.sourceId, input.sourceId));
  }

  if (input.detectedAfterTs !== undefined) {
    whereConditions.push(gte(libraryUpdateEvents.detectedAt, input.detectedAfterTs));
  }

  if (
    input.unreadOnly &&
    input.lastSeenEventId !== undefined &&
    input.lastSeenEventId !== null
  ) {
    whereConditions.push(gt(libraryUpdateEvents.id, input.lastSeenEventId));
  }

  const entries = db
    .select()
    .from(libraryUpdateEvents)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .orderBy(desc(libraryUpdateEvents.id))
    .limit(safeLimit + 1)
    .all();

  const hasMore = entries.length > safeLimit;
  const pageEntries = hasMore ? entries.slice(0, safeLimit) : entries;
  const items = pageEntries.map(mapLibraryUpdateEvent);
  const nextCursor = hasMore ? pageEntries[pageEntries.length - 1]?.id ?? null : null;

  return {
    items,
    nextCursor,
  };
};

export const markLibraryUpdatesSeenToLatest = (): LibraryUpdateFeedStateEntry => {
  const latestEventId = getLatestLibraryUpdateEventId();
  return setLibraryUpdateFeedLastSeenEventId(latestEventId);
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
