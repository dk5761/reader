export type LibraryUpdateDetectionMode = "date" | "count_fallback";

export interface LibraryUpdateStateEntry {
  id: number;
  sourceId: string;
  mangaId: string;
  chapterCount: number;
  latestChapterId?: string;
  latestChapterTitle?: string;
  latestChapterNumber?: number;
  latestChapterUploadedAt?: string;
  latestChapterUploadedAtTs?: number;
  lastCheckedAt: number;
  lastUpdateDetectedAt?: number;
  firstSyncedAt: number;
}

export interface UpsertLibraryUpdateStateInput {
  sourceId: string;
  mangaId: string;
  chapterCount: number;
  latestChapterId?: string;
  latestChapterTitle?: string;
  latestChapterNumber?: number;
  latestChapterUploadedAt?: string;
  latestChapterUploadedAtTs?: number;
  lastCheckedAt?: number;
  lastUpdateDetectedAt?: number;
  firstSyncedAt: number;
}

export interface LibraryUpdateEventEntry {
  id: number;
  sourceId: string;
  mangaId: string;
  mangaTitle: string;
  mangaThumbnailUrl?: string;
  previousChapterCount: number;
  newChapterCount: number;
  chapterDelta: number;
  previousLatestChapterUploadedAtTs?: number;
  newLatestChapterUploadedAtTs?: number;
  detectionMode: LibraryUpdateDetectionMode;
  detectedAt: number;
}

export interface LibraryUpdateFeedStateEntry {
  id: number;
  lastSeenEventId?: number;
  updatedAt: number;
}

export interface GetLibraryUpdateEventsPageInput {
  cursor?: number;
  limit?: number;
  sourceId?: string;
  detectedAfterTs?: number;
  unreadOnly?: boolean;
  lastSeenEventId?: number | null;
}

export interface LibraryUpdateEventsPage {
  items: LibraryUpdateEventEntry[];
  nextCursor: number | null;
}

export interface InsertLibraryUpdateEventInput {
  sourceId: string;
  mangaId: string;
  mangaTitle: string;
  mangaThumbnailUrl?: string;
  previousChapterCount: number;
  newChapterCount: number;
  chapterDelta: number;
  previousLatestChapterUploadedAtTs?: number;
  newLatestChapterUploadedAtTs?: number;
  detectionMode: LibraryUpdateDetectionMode;
  detectedAt?: number;
}

export type LibraryUpdateRunStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export interface LibraryUpdateRunCurrentItem {
  sourceId: string;
  mangaId: string;
  title: string;
}

export interface LibraryUpdateRunSnapshot {
  runId: number | null;
  status: LibraryUpdateRunStatus;
  total: number;
  processed: number;
  updated: number;
  errors: number;
  skipped: number;
  startedAt: number | null;
  endedAt: number | null;
  current: LibraryUpdateRunCurrentItem | null;
  pausedByAppState: boolean;
  errorMessage: string | null;
}
