import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { upsertReadingHistoryEntry } from "@/services/history";
import { historyQueryFactory } from "@/services/history/history.queryFactory";
import { upsertReadingProgress } from "@/services/progress";
import { progressQueryFactory } from "@/services/progress/progress.queryFactory";
import type { ReaderCurrentProgressPayload } from "../types/reader.types";

const SAVE_THROTTLE_MS = 400;

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
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

    pendingPayloadRef.current = payload;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      flush();
      timeoutRef.current = null;
    }, SAVE_THROTTLE_MS);
  }, [enabled, flush, payload]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        flush();
      }
    });

    return () => {
      subscription.remove();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = null;
      flush();
    };
  }, [flush]);
};
