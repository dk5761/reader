import { AppState, type AppStateStatus } from "react-native";
import { getLibraryEntries, upsertLibraryEntry, type LibraryEntry } from "@/services/library";
import {
  getSourceChapters,
  getSourceMangaDetails,
  type SourceChapter,
} from "@/services/source";
import {
  getLibraryUpdateState,
  insertLibraryUpdateEvent,
  upsertLibraryUpdateState,
} from "./libraryUpdate.repository";
import { getLibraryUpdateRunSnapshot, useLibraryUpdateStore } from "./libraryUpdate.store";
import type {
  LibraryUpdateDetectionMode,
  LibraryUpdateRunSnapshot,
} from "./libraryUpdate.types";

interface ChapterMetrics {
  chapterCount: number;
  latestChapterId?: string;
  latestChapterTitle?: string;
  latestChapterNumber?: number;
  latestChapterUploadedAt?: string;
  latestChapterUploadedAtTs?: number;
}

interface RunContext {
  runId: number;
  entries: LibraryEntry[];
  currentIndex: number;
  abortController: AbortController | null;
}

let activeRunContext: RunContext | null = null;
let processingPromise: Promise<void> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

const setRunSnapshot = useLibraryUpdateStore.getState().setRunSnapshot;

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown update failure.";
};

const parseUploadedAtTimestamp = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const dedupeChapters = (chapters: SourceChapter[]): SourceChapter[] => {
  const seen = new Set<string>();
  return chapters.filter((chapter) => {
    if (seen.has(chapter.id)) {
      return false;
    }
    seen.add(chapter.id);
    return true;
  });
};

const pickLatestChapter = (chapters: SourceChapter[]): SourceChapter | undefined => {
  if (chapters.length === 0) {
    return undefined;
  }

  let latestChapterByTimestamp: SourceChapter | undefined;
  let latestTimestamp: number | null = null;

  chapters.forEach((chapter) => {
    const timestamp = parseUploadedAtTimestamp(chapter.uploadedAt);
    if (timestamp === null) {
      return;
    }

    if (latestTimestamp === null || timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestChapterByTimestamp = chapter;
    }
  });

  if (latestChapterByTimestamp) {
    return latestChapterByTimestamp;
  }

  const chaptersWithNumber = chapters.filter((chapter) => Number.isFinite(chapter.number));
  if (chaptersWithNumber.length > 0) {
    return chaptersWithNumber.sort((a, b) => (b.number ?? 0) - (a.number ?? 0))[0];
  }

  return chapters[0];
};

const getChapterMetrics = (chapters: SourceChapter[]): ChapterMetrics => {
  const deduped = dedupeChapters(chapters);
  const latestChapter = pickLatestChapter(deduped);
  const latestChapterUploadedAtTs = parseUploadedAtTimestamp(latestChapter?.uploadedAt);

  return {
    chapterCount: deduped.length,
    latestChapterId: latestChapter?.id,
    latestChapterTitle: latestChapter?.title,
    latestChapterNumber: latestChapter?.number,
    latestChapterUploadedAt: latestChapter?.uploadedAt,
    latestChapterUploadedAtTs: latestChapterUploadedAtTs ?? undefined,
  };
};

const evaluateUpdateDiff = (
  previousState: ReturnType<typeof getLibraryUpdateState>,
  nextMetrics: ChapterMetrics
): {
  isUpdateDetected: boolean;
  detectionMode: LibraryUpdateDetectionMode | null;
  chapterDelta: number;
} => {
  if (!previousState) {
    return {
      isUpdateDetected: false,
      detectionMode: null,
      chapterDelta: 0,
    };
  }

  const previousTs = previousState.latestChapterUploadedAtTs;
  const nextTs = nextMetrics.latestChapterUploadedAtTs;
  const chapterDelta = Math.max(0, nextMetrics.chapterCount - previousState.chapterCount);

  if (previousTs !== undefined && nextTs !== undefined) {
    return {
      isUpdateDetected: nextTs > previousTs,
      detectionMode: nextTs > previousTs ? "date" : null,
      chapterDelta,
    };
  }

  if (nextMetrics.chapterCount > previousState.chapterCount) {
    return {
      isUpdateDetected: true,
      detectionMode: "count_fallback",
      chapterDelta,
    };
  }

  return {
    isUpdateDetected: false,
    detectionMode: null,
    chapterDelta,
  };
};

const finalizeRun = (
  status: LibraryUpdateRunSnapshot["status"],
  input?: { errorMessage?: string }
) => {
  setRunSnapshot({
    status,
    endedAt: Date.now(),
    current: null,
    pausedByAppState: false,
    errorMessage: input?.errorMessage ?? null,
  });
  activeRunContext = null;
};

const ensureAppStateSubscription = () => {
  if (appStateSubscription) {
    return;
  }

  appStateSubscription = AppState.addEventListener(
    "change",
    (nextAppState: AppStateStatus) => {
      const snapshot = getLibraryUpdateRunSnapshot();
      if (nextAppState === "active") {
        if (snapshot.status === "paused" && snapshot.pausedByAppState) {
          void resumeLibraryUpdateRun();
        }
        return;
      }

      if (snapshot.status === "running") {
        pauseLibraryUpdateRun({ fromAppState: true });
      }
    }
  );
};

const runUpdateLoop = () => {
  if (processingPromise) {
    return processingPromise;
  }

  processingPromise = (async () => {
    try {
      while (activeRunContext) {
        const snapshot = getLibraryUpdateRunSnapshot();
        if (snapshot.status !== "running") {
          break;
        }

        const entry = activeRunContext.entries[activeRunContext.currentIndex];
        if (!entry) {
          finalizeRun("completed");
          break;
        }

        setRunSnapshot({
          current: {
            sourceId: entry.sourceId,
            mangaId: entry.mangaId,
            title: entry.title,
          },
          errorMessage: null,
        });

        const abortController = new AbortController();
        activeRunContext.abortController = abortController;

        let shouldAdvanceCursor = false;

        try {
          const [details, chapters] = await Promise.all([
            getSourceMangaDetails(entry.sourceId, entry.mangaId, abortController.signal),
            getSourceChapters(entry.sourceId, entry.mangaId, abortController.signal),
          ]);

          const now = Date.now();
          const nextMetrics = getChapterMetrics(chapters);
          const previousState = getLibraryUpdateState(entry.sourceId, entry.mangaId);
          const diff = evaluateUpdateDiff(previousState, nextMetrics);

          upsertLibraryUpdateState({
            sourceId: entry.sourceId,
            mangaId: entry.mangaId,
            chapterCount: nextMetrics.chapterCount,
            latestChapterId: nextMetrics.latestChapterId,
            latestChapterTitle: nextMetrics.latestChapterTitle,
            latestChapterNumber: nextMetrics.latestChapterNumber,
            latestChapterUploadedAt: nextMetrics.latestChapterUploadedAt,
            latestChapterUploadedAtTs: nextMetrics.latestChapterUploadedAtTs,
            lastCheckedAt: now,
            lastUpdateDetectedAt: diff.isUpdateDetected ? now : previousState?.lastUpdateDetectedAt,
            firstSyncedAt: previousState?.firstSyncedAt ?? now,
          });

          upsertLibraryEntry({
            sourceId: entry.sourceId,
            mangaId: entry.mangaId,
            mangaUrl: details.url || entry.mangaUrl,
            title: details.title || entry.title,
            thumbnailUrl: details.thumbnailUrl ?? entry.thumbnailUrl,
            description: details.description ?? entry.description,
            status: details.status ?? entry.status,
          });

          if (diff.isUpdateDetected && diff.detectionMode) {
            insertLibraryUpdateEvent({
              sourceId: entry.sourceId,
              mangaId: entry.mangaId,
              mangaTitle: details.title || entry.title,
              mangaThumbnailUrl: details.thumbnailUrl ?? entry.thumbnailUrl,
              previousChapterCount: previousState?.chapterCount ?? 0,
              newChapterCount: nextMetrics.chapterCount,
              chapterDelta: diff.chapterDelta,
              previousLatestChapterUploadedAtTs: previousState?.latestChapterUploadedAtTs,
              newLatestChapterUploadedAtTs: nextMetrics.latestChapterUploadedAtTs,
              detectionMode: diff.detectionMode,
              detectedAt: now,
            });
          }

          setRunSnapshot({
            processed: snapshot.processed + 1,
            updated: snapshot.updated + (diff.isUpdateDetected ? 1 : 0),
            skipped: snapshot.skipped + (diff.isUpdateDetected ? 0 : 1),
            current: null,
            errorMessage: null,
          });
          shouldAdvanceCursor = true;
        } catch (error) {
          if (abortController.signal.aborted) {
            const nextSnapshot = getLibraryUpdateRunSnapshot();
            if (nextSnapshot.status !== "running") {
              break;
            }
            setRunSnapshot({
              errorMessage: null,
              current: null,
            });
            continue;
          }

          setRunSnapshot({
            processed: snapshot.processed + 1,
            errors: snapshot.errors + 1,
            current: null,
            errorMessage: toErrorMessage(error),
          });
          shouldAdvanceCursor = true;
        } finally {
          if (activeRunContext?.runId === snapshot.runId) {
            activeRunContext.abortController = null;
            if (shouldAdvanceCursor) {
              activeRunContext.currentIndex += 1;
            }
          }
        }
      }
    } catch (error) {
      finalizeRun("failed", {
        errorMessage: toErrorMessage(error),
      });
    } finally {
      processingPromise = null;
    }
  })();

  return processingPromise;
};

export const startLibraryUpdateRun = (): LibraryUpdateRunSnapshot => {
  const snapshot = getLibraryUpdateRunSnapshot();
  if (snapshot.status === "running" || snapshot.status === "paused") {
    return snapshot;
  }

  ensureAppStateSubscription();
  const entries = getLibraryEntries();
  const runId = Date.now();
  const startedAt = Date.now();

  activeRunContext = {
    runId,
    entries,
    currentIndex: 0,
    abortController: null,
  };

  setRunSnapshot({
    runId,
    status: entries.length > 0 ? "running" : "completed",
    total: entries.length,
    processed: 0,
    updated: 0,
    errors: 0,
    skipped: 0,
    startedAt,
    endedAt: entries.length > 0 ? null : startedAt,
    current: null,
    pausedByAppState: false,
    errorMessage: null,
  });

  if (entries.length === 0) {
    activeRunContext = null;
    return getLibraryUpdateRunSnapshot();
  }

  void runUpdateLoop();
  return getLibraryUpdateRunSnapshot();
};

export const pauseLibraryUpdateRun = (input?: { fromAppState?: boolean }): LibraryUpdateRunSnapshot => {
  const snapshot = getLibraryUpdateRunSnapshot();
  if (snapshot.status !== "running") {
    return snapshot;
  }

  setRunSnapshot({
    status: "paused",
    pausedByAppState: Boolean(input?.fromAppState),
    current: null,
  });

  activeRunContext?.abortController?.abort();
  return getLibraryUpdateRunSnapshot();
};

export const resumeLibraryUpdateRun = (): LibraryUpdateRunSnapshot => {
  const snapshot = getLibraryUpdateRunSnapshot();
  if (snapshot.status !== "paused") {
    return snapshot;
  }

  if (!activeRunContext) {
    finalizeRun("failed", { errorMessage: "No paused run context available." });
    return getLibraryUpdateRunSnapshot();
  }

  setRunSnapshot({
    status: "running",
    pausedByAppState: false,
    endedAt: null,
    errorMessage: null,
  });
  void runUpdateLoop();
  return getLibraryUpdateRunSnapshot();
};

export const cancelLibraryUpdateRun = (): LibraryUpdateRunSnapshot => {
  const snapshot = getLibraryUpdateRunSnapshot();
  if (snapshot.status !== "running" && snapshot.status !== "paused") {
    return snapshot;
  }

  activeRunContext?.abortController?.abort();
  activeRunContext = null;

  setRunSnapshot({
    status: "cancelled",
    endedAt: Date.now(),
    current: null,
    pausedByAppState: false,
    errorMessage: null,
  });

  return getLibraryUpdateRunSnapshot();
};
