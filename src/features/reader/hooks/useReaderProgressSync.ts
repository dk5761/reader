import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import {
  insertReadingHistoryEvent,
  upsertReadingHistoryEntry,
} from "@/services/history";
import { upsertReadingProgress } from "@/services/progress";

const SAVE_THROTTLE_MS = 400;
const TIMELINE_DUPLICATE_GUARD_MS = 5000;
const CHAPTER_COMPLETION_THRESHOLD = 0.9;

export interface ReaderProgressSyncPayload {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterTitle?: string;
  chapterNumber?: number;
  mangaTitle: string;
  mangaThumbnailUrl?: string;
  pageIndex: number;
  totalPages?: number;
}

interface UseReaderProgressSyncParams {
  payload: ReaderProgressSyncPayload | null;
  enabled: boolean;
}

export const useReaderProgressSync = ({
  payload,
  enabled,
}: UseReaderProgressSyncParams) => {
  const queryClient = useQueryClient();
  const pendingPayloadRef = useRef<ReaderProgressSyncPayload | null>(null);
  const activeChapterPayloadRef = useRef<ReaderProgressSyncPayload | null>(null);
  const lastCommittedTimelineRef = useRef<{ signature: string; recordedAt: number } | null>(
    null
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidateReadingQueries = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["progress"] }),
      queryClient.invalidateQueries({ queryKey: ["history"] }),
    ]);
  }, [queryClient]);

  const commitTimelineEvent = useCallback(
    (timelinePayload: ReaderProgressSyncPayload | null) => {
      if (!timelinePayload) {
        return;
      }

      const signature = [
        timelinePayload.sourceId,
        timelinePayload.mangaId,
        timelinePayload.chapterId,
        timelinePayload.pageIndex,
        timelinePayload.totalPages ?? "unknown",
      ].join("::");

      const now = Date.now();
      const lastCommitted = lastCommittedTimelineRef.current;
      if (
        lastCommitted &&
        lastCommitted.signature === signature &&
        now - lastCommitted.recordedAt < TIMELINE_DUPLICATE_GUARD_MS
      ) {
        return;
      }

      insertReadingHistoryEvent({
        sourceId: timelinePayload.sourceId,
        mangaId: timelinePayload.mangaId,
        chapterId: timelinePayload.chapterId,
        mangaTitle: timelinePayload.mangaTitle,
        mangaThumbnailUrl: timelinePayload.mangaThumbnailUrl,
        chapterTitle: timelinePayload.chapterTitle,
        chapterNumber: timelinePayload.chapterNumber,
        pageIndex: timelinePayload.pageIndex,
        totalPages: timelinePayload.totalPages,
        recordedAt: now,
      });

      lastCommittedTimelineRef.current = { signature, recordedAt: now };
      invalidateReadingQueries();
    },
    [invalidateReadingQueries]
  );

  const flushSnapshot = useCallback(() => {
    const pendingPayload = pendingPayloadRef.current;
    if (!pendingPayload) {
      return;
    }

    pendingPayloadRef.current = null;

    const normalizedPageIndex = Math.max(0, Math.floor(pendingPayload.pageIndex));
    const totalPages = pendingPayload.totalPages;
    const hasValidTotalPages =
      totalPages !== undefined &&
      Number.isFinite(totalPages) &&
      totalPages > 0;
    const isCompleted =
      hasValidTotalPages &&
      (Math.min(normalizedPageIndex, totalPages - 1) + 1) / totalPages >=
        CHAPTER_COMPLETION_THRESHOLD;

    upsertReadingProgress({
      sourceId: pendingPayload.sourceId,
      mangaId: pendingPayload.mangaId,
      chapterId: pendingPayload.chapterId,
      chapterTitle: pendingPayload.chapterTitle,
      chapterNumber: pendingPayload.chapterNumber,
      pageIndex: normalizedPageIndex,
      totalPages,
      isCompleted,
    });

    upsertReadingHistoryEntry({
      sourceId: pendingPayload.sourceId,
      mangaId: pendingPayload.mangaId,
      chapterId: pendingPayload.chapterId,
      mangaTitle: pendingPayload.mangaTitle,
      mangaThumbnailUrl: pendingPayload.mangaThumbnailUrl,
      chapterTitle: pendingPayload.chapterTitle,
      chapterNumber: pendingPayload.chapterNumber,
      pageIndex: normalizedPageIndex,
      totalPages,
    });

    invalidateReadingQueries();
  }, [invalidateReadingQueries]);

  useEffect(() => {
    if (!enabled || !payload) {
      return;
    }

    const activeChapterPayload = activeChapterPayloadRef.current;
    if (
      activeChapterPayload &&
      activeChapterPayload.chapterId !== payload.chapterId
    ) {
      commitTimelineEvent(activeChapterPayload);
    }

    activeChapterPayloadRef.current = payload;
    pendingPayloadRef.current = payload;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      flushSnapshot();
      timeoutRef.current = null;
    }, SAVE_THROTTLE_MS);
  }, [commitTimelineEvent, enabled, flushSnapshot, payload]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        flushSnapshot();
        commitTimelineEvent(activeChapterPayloadRef.current);
      }
    });

    return () => {
      subscription.remove();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = null;
      flushSnapshot();
      commitTimelineEvent(activeChapterPayloadRef.current);
    };
  }, [commitTimelineEvent, flushSnapshot]);
};
