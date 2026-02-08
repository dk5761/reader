import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { historyQueryFactory } from "@/features/history/api";
import { insertReadingHistoryEvent, upsertReadingHistoryEntry } from "@/services/history";
import { upsertReadingProgress } from "@/services/progress";
import { progressQueryFactory } from "@/services/progress/progress.queryFactory";
import type { ReaderCurrentProgressPayload } from "../types/reader.types";

const SAVE_THROTTLE_MS = 400;
const TIMELINE_DUPLICATE_GUARD_MS = 5000;

interface UseReaderProgressSyncParams {
  payload: ReaderCurrentProgressPayload | null;
  enabled: boolean;
}

export const useReaderProgressSync = ({
  payload,
  enabled,
}: UseReaderProgressSyncParams) => {
  const queryClient = useQueryClient();
  const pendingPayloadRef = useRef<ReaderCurrentProgressPayload | null>(null);
  const activeChapterPayloadRef = useRef<ReaderCurrentProgressPayload | null>(null);
  const lastCommittedTimelineRef = useRef<{ signature: string; recordedAt: number } | null>(
    null
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitTimelineEvent = useCallback(
    (timelinePayload: ReaderCurrentProgressPayload | null) => {
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

      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: historyQueryFactory.mangaTimeline(
            timelinePayload.sourceId,
            timelinePayload.mangaId
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: historyQueryFactory.all(),
        }),
      ]);
    },
    [queryClient]
  );

  const flushSnapshot = useCallback(() => {
    const pendingPayload = pendingPayloadRef.current;
    if (!pendingPayload) {
      return;
    }

    pendingPayloadRef.current = null;

    const totalPages = pendingPayload.totalPages;
    const isCompleted =
      totalPages !== undefined &&
      Number.isFinite(totalPages) &&
      totalPages > 0 &&
      pendingPayload.pageIndex >= totalPages - 1;

    upsertReadingProgress({
      sourceId: pendingPayload.sourceId,
      mangaId: pendingPayload.mangaId,
      chapterId: pendingPayload.chapterId,
      chapterTitle: pendingPayload.chapterTitle,
      chapterNumber: pendingPayload.chapterNumber,
      pageIndex: pendingPayload.pageIndex,
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
      pageIndex: pendingPayload.pageIndex,
      totalPages,
    });

    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: progressQueryFactory.latestByManga(
          pendingPayload.sourceId,
          pendingPayload.mangaId
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: progressQueryFactory.byChapter(
          pendingPayload.sourceId,
          pendingPayload.mangaId,
          pendingPayload.chapterId
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: progressQueryFactory.all(),
      }),
      queryClient.invalidateQueries({
        queryKey: historyQueryFactory.mangaLatest(
          pendingPayload.sourceId,
          pendingPayload.mangaId
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: historyQueryFactory.all(),
      }),
    ]);
  }, [queryClient]);

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
