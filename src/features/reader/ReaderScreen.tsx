import type { ReaderChapter, ReaderPage } from "@/services/reader";
import { useReaderStore } from "@/services/reader";
import { chapterProgressQueryOptions } from "@/services/progress";
import { getSourceChapters, getSourceMangaDetails } from "@/services/source";
import { sourceQueryFactory } from "@/services/source/core/queryFactory";
import { getSourceChapterPages } from "@/services/source/core/runtime";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { getDecodedParam } from "@/shared/utils";
import { useReaderProgressSync } from "./hooks/useReaderProgressSync";
import { ReaderBottomOverlay } from "./components/ReaderBottomOverlay";
import { ReaderLoadingScreen } from "./components/ReaderLoadingScreen";
import { ReaderTopOverlay } from "./components/ReaderTopOverlay";
import { NativeWebtoonReader, type NativeWebtoonReaderRef } from "./NativeReader/WebtoonReader";
import { imageDownloadManager } from "./utils/ImageDownloadManager";
import { PageDownloadScheduler, type SchedulerTask } from "./utils/PageDownloadScheduler";
import { appSettingsQueryOptions } from "@/features/settings/api";

const MAX_VISITED_CHAPTERS = 3;
const CURSOR_SYNC_THROTTLE_MS = 90;

export default function ReaderScreen() {
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    sourceId?: string | string[];
    mangaId?: string | string[];
    chapterId?: string | string[];
    initialPage?: string | string[];
  }>();

  const sourceId = getDecodedParam(params.sourceId);
  const mangaId = getDecodedParam(params.mangaId);
  const initialChapterId = getDecodedParam(params.chapterId);
  const hasExplicitInitialPageParam =
    params.initialPage !== undefined && params.initialPage !== null;
  const initialPageRaw = Array.isArray(params.initialPage)
    ? params.initialPage[0]
    : params.initialPage;
  const parsedInitialPage = Number.parseInt(initialPageRaw ?? "0", 10);
  const initialPage =
    Number.isFinite(parsedInitialPage) && parsedInitialPage >= 0
      ? parsedInitialPage
      : 0;

  const { setChapter, setCurrentPage, chapter, reset } = useReaderStore();
  const [entryChapterId, setEntryChapterId] = useState(initialChapterId);
  const [routeResetVersion, setRouteResetVersion] = useState(0);

  const [activeChapterIds, setActiveChapterIds] = useState<string[]>([initialChapterId]);

  // Overlay State Tracking driven by Native Swift scroll events
  const nativeReaderRef = useRef<NativeWebtoonReaderRef>(null);
  const chapterSwitchTargetRef = useRef<string | null>(null);
  const [isOverlayVisible, setOverlayVisible] = useState(true);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const [currentOverlayChapterId, setCurrentOverlayChapterId] = useState(initialChapterId);
  const [currentOverlayPageIndex, setCurrentOverlayPageIndex] = useState(initialPage > 0 ? initialPage : 0);
  const [currentProgressCursor, setCurrentProgressCursor] = useState(() => ({
    chapterId: initialChapterId,
    pageIndex: initialPage > 0 ? initialPage : 0,
  }));
  const [hasResolvedInitialProgress, setHasResolvedInitialProgress] = useState(
    hasExplicitInitialPageParam
  );
  const [chapterSwitchTargetId, setChapterSwitchTargetId] = useState<string | null>(null);
  const [pendingSeek, setPendingSeek] = useState<{
    chapterId: string;
    pageIndex: number;
  } | null>(
    initialPage > 0 && initialChapterId
      ? { chapterId: initialChapterId, pageIndex: initialPage }
      : null,
  );

  const [schedulerVersion, setSchedulerVersion] = useState(0);
  const schedulerRef = useRef<PageDownloadScheduler | null>(null);
  const lastSchedulerTaskDigestRef = useRef<string>("");
  const lastSchedulerChapterOrderDigestRef = useRef<string>("");
  const lastCursorSyncAtRef = useRef(0);
  const pendingCursorSyncRef = useRef<{ chapterId: string; pageIndex: number } | null>(null);
  const cursorSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChapterIdsRef = useRef<string[]>([initialChapterId]);
  const sourceRef = useRef<{ sourceId: string; mangaId: string }>({ sourceId, mangaId });
  const debugLog = useCallback((message: string, payload?: Record<string, unknown>) => {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      if (payload) {
        console.log("[ReaderDebug]", message, payload);
        return;
      }
      console.log("[ReaderDebug]", message);
    }
  }, []);

  const setSchedulerCursorNow = useCallback((chapterId: string, pageIndex: number) => {
    if (!chapterId) {
      return;
    }

    if (cursorSyncTimerRef.current) {
      clearTimeout(cursorSyncTimerRef.current);
      cursorSyncTimerRef.current = null;
    }
    pendingCursorSyncRef.current = null;

    schedulerRef.current?.setCursor(chapterId, pageIndex);
    lastCursorSyncAtRef.current = Date.now();
  }, []);

  const scheduleSchedulerCursorSync = useCallback((chapterId: string, pageIndex: number) => {
    if (!chapterId) {
      return;
    }

    const normalizedPageIndex = Math.max(0, Math.floor(pageIndex));
    const elapsed = Date.now() - lastCursorSyncAtRef.current;
    const canSyncImmediately = elapsed >= CURSOR_SYNC_THROTTLE_MS && !cursorSyncTimerRef.current;

    if (canSyncImmediately) {
      setSchedulerCursorNow(chapterId, normalizedPageIndex);
      return;
    }

    pendingCursorSyncRef.current = {
      chapterId,
      pageIndex: normalizedPageIndex,
    };

    if (cursorSyncTimerRef.current) {
      return;
    }

    const waitMs = Math.max(0, CURSOR_SYNC_THROTTLE_MS - elapsed);
    cursorSyncTimerRef.current = setTimeout(() => {
      cursorSyncTimerRef.current = null;
      const pending = pendingCursorSyncRef.current;
      pendingCursorSyncRef.current = null;
      if (!pending) {
        return;
      }
      setSchedulerCursorNow(pending.chapterId, pending.pageIndex);
    }, waitMs);
  }, [setSchedulerCursorNow]);

  // Fetch the master chapter list to know the ordering
  const chaptersQuery = useQuery({
    queryKey: sourceQueryFactory.chapters(sourceId, mangaId),
    queryFn: ({ signal }) => getSourceChapters(sourceId, mangaId, signal),
    staleTime: Infinity,
    enabled: Boolean(sourceId && mangaId),
  });
  const mangaQuery = useQuery({
    queryKey: sourceQueryFactory.manga(sourceId, mangaId),
    queryFn: ({ signal }) => getSourceMangaDetails(sourceId, mangaId, signal),
    staleTime: Infinity,
    enabled: Boolean(sourceId && mangaId),
  });
  const initialChapterProgressQuery = useQuery(
    chapterProgressQueryOptions(
      sourceId,
      mangaId,
      entryChapterId,
      Boolean(sourceId && mangaId && entryChapterId && !hasExplicitInitialPageParam)
    )
  );
  const settingsQuery = useQuery(appSettingsQueryOptions());

  // Dynamically fetch pages for all active chapters
  const chapterPagesStaleTime = Infinity;
  const chapterPagesQueries = useQueries({
    queries: activeChapterIds.map((id) => ({
      queryKey: sourceQueryFactory.chapterPages(sourceId, id),
      queryFn: ({ signal }) => getSourceChapterPages(sourceId, id, signal),
      staleTime: chapterPagesStaleTime,
      refetchOnMount: true,
      enabled: Boolean(sourceId && id),
    })),
  });

  const initialChapterQueryIndex = activeChapterIds.indexOf(entryChapterId);
  const primaryQuery =
    initialChapterQueryIndex >= 0
      ? chapterPagesQueries[initialChapterQueryIndex]
      : undefined;
  const primaryChapterPages = primaryQuery?.data;

  const activeOverlayChapterQueryIndex = activeChapterIds.indexOf(currentOverlayChapterId);
  const activeOverlayChapterQuery =
    activeOverlayChapterQueryIndex >= 0
      ? chapterPagesQueries[activeOverlayChapterQueryIndex]
      : undefined;

  const chapterMetaById = useMemo(
    () => new Map((chaptersQuery.data ?? []).map((chapter) => [chapter.id, chapter])),
    [chaptersQuery.data]
  );

  useEffect(() => {
    activeChapterIdsRef.current = activeChapterIds;
  }, [activeChapterIds]);

  useEffect(() => {
    return () => {
      if (cursorSyncTimerRef.current) {
        clearTimeout(cursorSyncTimerRef.current);
        cursorSyncTimerRef.current = null;
      }
      pendingCursorSyncRef.current = null;
    };
  }, []);

  useEffect(() => {
    sourceRef.current = { sourceId, mangaId };
  }, [mangaId, sourceId]);

  useEffect(() => {
    debugLog("params", {
      sourceId,
      mangaId,
      initialChapterId,
      initialPage,
      hasExplicitInitialPageParam,
    });
  }, [
    debugLog,
    hasExplicitInitialPageParam,
    initialChapterId,
    initialPage,
    mangaId,
    sourceId,
  ]);

  useEffect(() => {
    if (!chaptersQuery.data || chaptersQuery.data.length === 0) {
      return;
    }

    if (chapterMetaById.has(entryChapterId)) {
      return;
    }

    const fallbackChapterId = chaptersQuery.data[0]?.id;
    if (!fallbackChapterId) {
      return;
    }

    setEntryChapterId(fallbackChapterId);
    setActiveChapterIds([fallbackChapterId]);
    setCurrentOverlayChapterId(fallbackChapterId);
    setCurrentOverlayPageIndex(0);
    setCurrentProgressCursor({
      chapterId: fallbackChapterId,
      pageIndex: 0,
    });
    setPendingSeek({
      chapterId: fallbackChapterId,
      pageIndex: 0,
    });
  }, [chapterMetaById, chaptersQuery.data, entryChapterId]);

  const chapterPageCountById = useMemo(() => {
    const counts = new Map<string, number>();
    activeChapterIds.forEach((chapterId, index) => {
      const chapterPages = chapterPagesQueries[index]?.data;
      if (chapterPages) {
        counts.set(chapterId, chapterPages.length);
      }
    });
    return counts;
  }, [activeChapterIds, chapterPagesQueries]);

  const pageTaskById = useMemo(() => {
    const tasks = new Map<
      string,
      { chapterId: string; pageIndex: number; imageUrl: string; headers?: Record<string, string> }
    >();
    activeChapterIds.forEach((chapterId, queryIndex) => {
      const pages = chapterPagesQueries[queryIndex]?.data;
      if (!pages) {
        return;
      }
      pages.forEach((page, pageIndex) => {
        const pageId = `${chapterId}-${pageIndex}`;
        tasks.set(pageId, {
          chapterId,
          pageIndex,
          imageUrl: page.imageUrl,
          headers: page.headers,
        });
      });
    });
    return tasks;
  }, [activeChapterIds, chapterPagesQueries]);

  const isChapterSwitching = Boolean(chapterSwitchTargetId);
  const chapterSwitchMeta = chaptersQuery.data?.find((c) => c.id === chapterSwitchTargetId);
  const chapterSwitchTitle = chapterSwitchMeta?.title ||
    (chapterSwitchMeta?.number ? `Chapter ${chapterSwitchMeta.number}` : undefined);

  // Keep the store "chapter" updated for the primary initial chapter
  // (Progress tracking might need to be explicitly managed onChapterChanged later)
  useEffect(() => {
    if (primaryChapterPages && entryChapterId) {
      debugLog("setChapter from primaryChapterPages", {
        entryChapterId,
        pageCount: primaryChapterPages.length,
        routeResetVersion,
      });
      const pages: ReaderPage[] = primaryChapterPages.map((page, index) => ({
        index,
        pageId: `${entryChapterId}-${index}`,
        imageUrl: page.imageUrl,
        headers: page.headers,
        width: page.width,
        height: page.height,
        state: { status: "ready", imageUrl: page.imageUrl },
      }));

      const firstPage = primaryChapterPages[0];
      const readerChapter: ReaderChapter = {
        id: entryChapterId,
        sourceId,
        mangaId,
        title: firstPage?.chapterTitle,
        number: firstPage?.chapterNumber,
        pages,
        state: { status: "loaded" },
      };

      setChapter(readerChapter);

      if (hasExplicitInitialPageParam && initialPage > 0) {
        setCurrentPage(initialPage);
      }
    }
  }, [
    debugLog,
    hasExplicitInitialPageParam,
    primaryChapterPages,
    routeResetVersion,
    entryChapterId,
    sourceId,
    mangaId,
    initialPage,
    setChapter,
    setCurrentPage,
  ]);

  const hasAppliedPersistedInitialPageRef = useRef(false);
  const pruneOldestChapters = useCallback(
    (chapterIds: string[], protectedChapterId?: string | null) => {
      const nextIds = [...chapterIds];
      const prunedIds: string[] = [];

      while (nextIds.length > MAX_VISITED_CHAPTERS) {
        let pruneIndex = 0;
        if (protectedChapterId && nextIds[pruneIndex] === protectedChapterId) {
          pruneIndex = nextIds.findIndex((id) => id !== protectedChapterId);
        }
        if (pruneIndex < 0 || pruneIndex >= nextIds.length) {
          break;
        }
        const [removed] = nextIds.splice(pruneIndex, 1);
        if (removed) {
          prunedIds.push(removed);
        }
      }

      return { nextIds, prunedIds };
    },
    [],
  );

  const handleEvictChapters = useCallback((chapterIds: string[]) => {
    if (chapterIds.length === 0) {
      return;
    }

    chapterIds.forEach((chapterId) => {
      imageDownloadManager.evictChapter(chapterId).catch(console.error);
    });
  }, []);

  useEffect(() => {
    const scheduler = new PageDownloadScheduler(
      {
        windowAhead: settingsQuery.data?.webtoonWindowAhead ?? 6,
        windowBehind: settingsQuery.data?.webtoonWindowBehind ?? 1,
        foregroundConcurrency: settingsQuery.data?.webtoonForegroundConcurrency ?? 1,
        backgroundConcurrency: settingsQuery.data?.webtoonBackgroundConcurrency ?? 1,
        chapterPreloadLeadPages: settingsQuery.data?.webtoonChapterPreloadLeadPages ?? 4,
      },
      handleEvictChapters
    );

    schedulerRef.current = scheduler;
    lastSchedulerTaskDigestRef.current = "";
    lastSchedulerChapterOrderDigestRef.current = "";
    const unsubscribe = scheduler.subscribe(() => {
      setSchedulerVersion((v) => v + 1);
    });
    scheduler.setChapterOrder(activeChapterIdsRef.current);

    if (currentOverlayChapterId) {
      scheduler.setCursor(currentOverlayChapterId, currentOverlayPageIndex);
    }

    setSchedulerVersion((v) => v + 1);

    return () => {
      unsubscribe();
      scheduler.dispose();
      if (schedulerRef.current === scheduler) {
        schedulerRef.current = null;
      }
    };
  }, [routeResetVersion, handleEvictChapters]);

  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) {
      return;
    }
    scheduler.updateConfig({
      windowAhead: settingsQuery.data?.webtoonWindowAhead ?? 6,
      windowBehind: settingsQuery.data?.webtoonWindowBehind ?? 1,
      foregroundConcurrency: settingsQuery.data?.webtoonForegroundConcurrency ?? 1,
      backgroundConcurrency: settingsQuery.data?.webtoonBackgroundConcurrency ?? 1,
      chapterPreloadLeadPages: settingsQuery.data?.webtoonChapterPreloadLeadPages ?? 4,
    });
  }, [
    settingsQuery.data?.webtoonBackgroundConcurrency,
    settingsQuery.data?.webtoonChapterPreloadLeadPages,
    settingsQuery.data?.webtoonForegroundConcurrency,
    settingsQuery.data?.webtoonWindowAhead,
    settingsQuery.data?.webtoonWindowBehind,
  ]);

  useEffect(() => {
    schedulerRef.current?.dispose();
    schedulerRef.current = null;
    if (cursorSyncTimerRef.current) {
      clearTimeout(cursorSyncTimerRef.current);
      cursorSyncTimerRef.current = null;
    }
    pendingCursorSyncRef.current = null;
    lastCursorSyncAtRef.current = 0;
    chapterSwitchTargetRef.current = null;
    setChapterSwitchTargetId(null);
    setEntryChapterId(initialChapterId);
    setActiveChapterIds(initialChapterId ? [initialChapterId] : []);
    setCurrentOverlayChapterId(initialChapterId);
    setCurrentOverlayPageIndex(initialPage > 0 ? initialPage : 0);
    setCurrentProgressCursor({
      chapterId: initialChapterId,
      pageIndex: initialPage > 0 ? initialPage : 0,
    });
    setPendingSeek(
      initialPage > 0 && initialChapterId
        ? { chapterId: initialChapterId, pageIndex: initialPage }
        : null
    );
    setHasResolvedInitialProgress(hasExplicitInitialPageParam);
    hasAppliedPersistedInitialPageRef.current = false;
    reset();
    setRouteResetVersion((value) => value + 1);
    debugLog("reset reader state on route change", {
      sourceId,
      mangaId,
      initialChapterId,
      initialPage,
    });
  }, [
    debugLog,
    hasExplicitInitialPageParam,
    initialChapterId,
    initialPage,
    mangaId,
    reset,
    sourceId,
  ]);

  useEffect(() => {
    return () => {
      const { sourceId: currentSourceId, mangaId: currentMangaId } = sourceRef.current;

      if (!currentSourceId || !currentMangaId) {
        return;
      }

      debugLog("cleanup cancelQueries on unmount", {
        sourceId: currentSourceId,
        mangaId: currentMangaId,
        activeChapterIds: activeChapterIdsRef.current,
      });

      void queryClient.cancelQueries({
        queryKey: sourceQueryFactory.manga(currentSourceId, currentMangaId),
      });
      void queryClient.cancelQueries({
        queryKey: sourceQueryFactory.chapters(currentSourceId, currentMangaId),
      });

      activeChapterIdsRef.current.forEach((chapterId) => {
        void queryClient.cancelQueries({
          queryKey: sourceQueryFactory.chapterPages(currentSourceId, chapterId),
        });
      });
    };
  }, [debugLog, queryClient]);

  useEffect(() => {
    debugLog("primary chapter query state", {
      entryChapterId,
      activeChapterIds,
      status: primaryQuery?.status ?? "missing",
      fetchStatus: primaryQuery?.fetchStatus ?? "missing",
      isPending: primaryQuery?.isPending ?? false,
      isFetching: primaryQuery?.isFetching ?? false,
      isError: primaryQuery?.isError ?? false,
      hasData: Boolean(primaryQuery?.data),
    });
  }, [
    activeChapterIds,
    debugLog,
    entryChapterId,
    primaryQuery?.data,
    primaryQuery?.fetchStatus,
    primaryQuery?.isError,
    primaryQuery?.isFetching,
    primaryQuery?.isPending,
    primaryQuery?.status,
  ]);

  useEffect(() => {
    debugLog("source metadata query state", {
      chaptersStatus: chaptersQuery.status,
      chaptersFetchStatus: chaptersQuery.fetchStatus,
      mangaStatus: mangaQuery.status,
      mangaFetchStatus: mangaQuery.fetchStatus,
    });
  }, [
    chaptersQuery.fetchStatus,
    chaptersQuery.status,
    debugLog,
    mangaQuery.fetchStatus,
    mangaQuery.status,
  ]);

  useEffect(() => {
    if (hasExplicitInitialPageParam || !entryChapterId) {
      return;
    }

    if (hasAppliedPersistedInitialPageRef.current) {
      return;
    }

    if (initialChapterProgressQuery.isPending) {
      return;
    }

    hasAppliedPersistedInitialPageRef.current = true;
    setHasResolvedInitialProgress(true);

    const persistedPageIndex = initialChapterProgressQuery.data?.pageIndex ?? 0;
    if (persistedPageIndex <= 0) {
      return;
    }

    setCurrentOverlayChapterId(entryChapterId);
    setCurrentOverlayPageIndex(persistedPageIndex);
    setCurrentProgressCursor({
      chapterId: entryChapterId,
      pageIndex: persistedPageIndex,
    });
    setCurrentPage(persistedPageIndex);
    setPendingSeek({
      chapterId: entryChapterId,
      pageIndex: persistedPageIndex,
    });
  }, [
    hasExplicitInitialPageParam,
    entryChapterId,
    initialChapterProgressQuery.data?.pageIndex,
    initialChapterProgressQuery.isPending,
    setCurrentPage,
  ]);

  const schedulerTasksByPageId = useMemo(() => {
    const mapped = new Map<string, SchedulerTask>();
    pageTaskById.forEach((task, pageId) => {
      mapped.set(pageId, {
        pageId,
        chapterId: task.chapterId,
        pageIndex: task.pageIndex,
        imageUrl: task.imageUrl,
        headers: task.headers,
      });
    });
    return mapped;
  }, [pageTaskById]);

  const schedulerTaskDigest = useMemo(() => {
    return Array.from(schedulerTasksByPageId.values())
      .sort((a, b) => a.pageId.localeCompare(b.pageId))
      .map((task) => `${task.pageId}|${task.imageUrl}`)
      .join(";");
  }, [schedulerTasksByPageId]);

  const chapterOrderDigest = useMemo(() => activeChapterIds.join("|"), [activeChapterIds]);

  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler) {
      return;
    }

    if (chapterOrderDigest !== lastSchedulerChapterOrderDigestRef.current) {
      lastSchedulerChapterOrderDigestRef.current = chapterOrderDigest;
      scheduler.setChapterOrder(activeChapterIds);
    }

    if (schedulerTaskDigest !== lastSchedulerTaskDigestRef.current) {
      lastSchedulerTaskDigestRef.current = schedulerTaskDigest;
      scheduler.updateTasks(schedulerTasksByPageId);
    }
  }, [activeChapterIds, chapterOrderDigest, schedulerTaskDigest, schedulerTasksByPageId]);

  useEffect(() => {
    if (!currentOverlayChapterId) {
      return;
    }
    scheduleSchedulerCursorSync(currentOverlayChapterId, currentOverlayPageIndex);
  }, [currentOverlayChapterId, currentOverlayPageIndex, scheduleSchedulerCursorSync]);

  const retryPage = useCallback((pageId: string) => {
    schedulerRef.current?.retryPage(pageId);
  }, []);

  const schedulerSnapshot = useMemo(() => {
    return (
      schedulerRef.current?.getSnapshot() ?? {
        pages: {},
        debug: {
          queueSizes: {
            manual_retry: 0,
            visible_or_cursor: 0,
            foreground_window: 0,
            in_chapter_prefetch: 0,
            next_chapter_prefetch: 0,
          },
          inFlightByLane: {
            manual_retry: 0,
            visible_or_cursor: 0,
            foreground_window: 0,
            in_chapter_prefetch: 0,
            next_chapter_prefetch: 0,
          },
          cancelledCount: 0,
          deprioritizedCount: 0,
        },
      }
    );
  }, [schedulerVersion]);

  useEffect(() => {
    if (typeof __DEV__ === "undefined" || !__DEV__) {
      return;
    }
    debugLog("scheduler_stats", {
      queueSizes: schedulerSnapshot.debug.queueSizes,
      inFlightByLane: schedulerSnapshot.debug.inFlightByLane,
      cursorToFirstReadyMs: schedulerSnapshot.debug.cursorToFirstReadyMs,
      cancelledCount: schedulerSnapshot.debug.cancelledCount,
      deprioritizedCount: schedulerSnapshot.debug.deprioritizedCount,
    });
  }, [debugLog, schedulerSnapshot.debug]);

  // Combine all loaded pages seamlessly
  const combinedData = useMemo(() => {
    let merged: any[] = [];
    for (let i = 0; i < chapterPagesQueries.length; i++) {
      const query = chapterPagesQueries[i];
      if (query.data) {
        const cId = activeChapterIds[i];

        // Inject a native transition cell before adding the new chapter's pages (if it's not the first chapter)
        if (i > 0) {
          // Find chapter title from the master list
          const prevChapterMeta = chaptersQuery.data?.find(c => c.id === activeChapterIds[i - 1]);
          const nextChapterMeta = chaptersQuery.data?.find(c => c.id === cId);

          const prevDisplay = prevChapterMeta?.title || (prevChapterMeta?.number ? `Chapter ${prevChapterMeta.number}` : "Previous Chapter");
          const nextDisplay = nextChapterMeta?.title || (nextChapterMeta?.number ? `Chapter ${nextChapterMeta.number}` : "Next Chapter");

          merged.push({
            id: `transition-${cId}`,
            localPath: "",
            pageIndex: -1,
            chapterId: cId,
            aspectRatio: 1, // Ignored by native transition cell
            isTransition: true,
            previousChapterTitle: prevDisplay,
            nextChapterTitle: nextDisplay
          });
        }

        merged = merged.concat(query.data.map((p, index) => {
          const pageId = `${cId}-${index}`;
          const state = schedulerSnapshot.pages[pageId];
          const isReady = state?.status === "ready";
          const isTerminalFailure = state?.status === "error" && state.terminal;
          const sourceAspectRatio =
            p.width && p.height && p.width > 0 && p.height > 0
              ? p.width / p.height
              : undefined;
          const decodedAspectRatio =
            isReady && state.width > 0 && state.height > 0
              ? state.width / state.height
              : undefined;

          return {
            id: pageId,
            localPath: isReady ? state.localUri : "",
            pageIndex: index,
            chapterId: cId,
            aspectRatio: sourceAspectRatio ?? decodedAspectRatio ?? 1,
            loadState: isReady ? "ready" : (isTerminalFailure ? "failed" : "loading"),
            errorMessage: isTerminalFailure
              ? (state.statusCode ? `Failed to load page (${state.statusCode}).` : "Failed to load page.")
              : undefined,
            isTransition: false,
            headers: p.headers,
          };
        }));
      }
    }
    return merged;
  }, [chapterPagesQueries, activeChapterIds, chaptersQuery.data, schedulerSnapshot.pages]);

  useEffect(() => {
    if (!pendingSeek) return;

    const targetExists = combinedData.some(
      (item) =>
        !item.isTransition &&
        item.chapterId === pendingSeek.chapterId &&
        item.pageIndex === pendingSeek.pageIndex,
    );

    if (!targetExists) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      const didSeek = await nativeReaderRef.current?.seekTo(
        pendingSeek.chapterId,
        pendingSeek.pageIndex,
      );

      if (!cancelled && didSeek) {
        setPendingSeek(null);
        if (chapterSwitchTargetId === pendingSeek.chapterId) {
          chapterSwitchTargetRef.current = null;
          setChapterSwitchTargetId(null);
        }
      } else if (!cancelled) {
        retryTimer = setTimeout(() => {
          setPendingSeek((current) => {
            if (!current) return current;
            if (current.chapterId !== pendingSeek.chapterId || current.pageIndex !== pendingSeek.pageIndex) {
              return current;
            }
            return { ...current };
          });
        }, 80);
      }
    })();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [chapterSwitchTargetId, combinedData, pendingSeek]);

  const handleEndReached = useCallback((reachedChapterId: string) => {
    if (chapterSwitchTargetRef.current) {
      return;
    }

    if (!chaptersQuery.data) return;

    const currentActiveChapterIds = activeChapterIdsRef.current;
    if (currentActiveChapterIds.length === 0) {
      return;
    }

    // Only preload if we reached the boundary of the explicitly *last* chapter in our list
    if (reachedChapterId !== currentActiveChapterIds[currentActiveChapterIds.length - 1]) {
      return;
    }

    const currentIndex = chaptersQuery.data.findIndex(c => c.id === reachedChapterId);

    // Assuming chapters are sorted newest first (index 0 is newest).
    // Reading direction goes from older to newer -> so index - 1
    const nextIndex = currentIndex - 1;
    if (nextIndex >= 0) {
      const nextChapterId = chaptersQuery.data[nextIndex].id;
      if (!currentActiveChapterIds.includes(nextChapterId)) {
        const appended = [...currentActiveChapterIds, nextChapterId];
        const { nextIds, prunedIds } = pruneOldestChapters(
          appended,
          currentOverlayChapterId,
        );

        debugLog("active_window_update", {
          reachedChapterId,
          nextChapterId,
          before: currentActiveChapterIds,
          after: nextIds,
          pruned: prunedIds,
          maxVisitedChapters: MAX_VISITED_CHAPTERS,
        });

        setActiveChapterIds(nextIds);
        prunedIds.forEach((chapterId) => {
          imageDownloadManager.evictChapter(chapterId).catch(console.error);
        });
      }
    }
  }, [chaptersQuery.data, currentOverlayChapterId, debugLog, pruneOldestChapters]);

  const toggleOverlay = useCallback(() => {
    Animated.timing(overlayOpacity, {
      toValue: isOverlayVisible ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setOverlayVisible(!isOverlayVisible);
    });
  }, [isOverlayVisible, overlayOpacity]);

  const hideOverlay = useCallback(() => {
    if (!isOverlayVisible) return; // Already hidden
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setOverlayVisible(false);
    });
  }, [isOverlayVisible, overlayOpacity]);

  const handlePageChanged = useCallback((chapterId: string, pageIndex: number) => {
    const switchingTo = chapterSwitchTargetRef.current;
    if (switchingTo && chapterId !== switchingTo) {
      return;
    }
    const normalizedPageIndex = Math.max(0, Math.floor(pageIndex));
    setCurrentOverlayChapterId(chapterId);
    setCurrentOverlayPageIndex(normalizedPageIndex);
    setCurrentProgressCursor({
      chapterId,
      pageIndex: normalizedPageIndex,
    });
    setCurrentPage(normalizedPageIndex);
  }, [setCurrentPage]);

  const handleChapterChanged = useCallback((chapterId: string) => {
    const switchingTo = chapterSwitchTargetRef.current;
    if (switchingTo && chapterId !== switchingTo) {
      return;
    }
    if (chapterId !== currentOverlayChapterId) {
      // Transition cells can emit chapter changes before a concrete page event.
      // Reset only the visible counter here; avoid forcing native seek/snapping.
      setCurrentOverlayPageIndex(0);
    }
    setCurrentOverlayChapterId(chapterId);
  }, [currentOverlayChapterId]);

  const handleImageError = useCallback((_pageId: string, _error: string) => {}, []);

  const handleSeek = useCallback((pageIndex: number) => {
    if (chapterSwitchTargetRef.current) {
      return;
    }
    const targetPage = Math.floor(pageIndex);
    setCurrentOverlayPageIndex(targetPage);
    setSchedulerCursorNow(currentOverlayChapterId, targetPage);
    void nativeReaderRef.current?.seekTo(currentOverlayChapterId, targetPage);
  }, [currentOverlayChapterId, setSchedulerCursorNow]);

  const switchToChapter = useCallback((targetChapterId: string) => {
    if (!targetChapterId || chapterSwitchTargetRef.current) {
      return;
    }

    chapterSwitchTargetRef.current = targetChapterId;
    setChapterSwitchTargetId(targetChapterId);
    setCurrentOverlayChapterId(targetChapterId);
    setCurrentOverlayPageIndex(0);
    setActiveChapterIds([targetChapterId]);
    setPendingSeek({ chapterId: targetChapterId, pageIndex: 0 });
    schedulerRef.current?.onChapterSwitch(targetChapterId);
  }, []);

  const progressPayload = useMemo(() => {
    const chapterId = currentProgressCursor.chapterId;
    if (!sourceId || !mangaId || !chapterId) {
      return null;
    }

    const chapterMeta = chapterMetaById.get(chapterId);
    const totalPages = chapterPageCountById.get(chapterId);

    return {
      sourceId,
      mangaId,
      chapterId,
      chapterTitle: chapterMeta?.title,
      chapterNumber: chapterMeta?.number,
      mangaTitle: mangaQuery.data?.title ?? mangaId,
      mangaThumbnailUrl: mangaQuery.data?.thumbnailUrl,
      pageIndex: currentProgressCursor.pageIndex,
      totalPages: totalPages && totalPages > 0 ? totalPages : undefined,
    };
  }, [
    chapterMetaById,
    chapterPageCountById,
    currentProgressCursor.chapterId,
    currentProgressCursor.pageIndex,
    mangaId,
    mangaQuery.data?.thumbnailUrl,
    mangaQuery.data?.title,
    sourceId,
  ]);

  useReaderProgressSync({
    payload: progressPayload,
    enabled: Boolean(
      sourceId &&
        mangaId &&
        currentProgressCursor.chapterId &&
        hasResolvedInitialProgress
    ),
  });

  if (!chapter && (primaryQuery?.isPending || !primaryQuery?.data)) {
    debugLog("rendering loading screen", {
      reason: primaryQuery?.isPending ? "primaryQueryPending" : "primaryQueryNoData",
      entryChapterId,
      activeChapterIds,
      primaryFetchStatus: primaryQuery?.fetchStatus ?? "missing",
      primaryStatus: primaryQuery?.status ?? "missing",
    });
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ReaderLoadingScreen />
      </>
    );
  }

  if (!chapter && primaryQuery?.isError) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center bg-[#0F0F12]">
          <ReaderLoadingScreen
            chapterTitle={
              primaryQuery.error?.message || "Failed to load chapter"
            }
          />
        </View>
      </>
    );
  }

  if (!chapter) {
    debugLog("rendering fallback loading because chapter is null", {
      entryChapterId,
      routeResetVersion,
      primaryStatus: primaryQuery?.status ?? "missing",
      primaryFetchStatus: primaryQuery?.fetchStatus ?? "missing",
      primaryHasData: Boolean(primaryQuery?.data),
    });
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ReaderLoadingScreen />
      </>
    );
  }

  // Derive active rendering props from the Swift tracking state we hold
  const activeChapterMeta = chaptersQuery.data?.find(c => c.id === currentOverlayChapterId);
  const currentChapterTitleDisplay = activeChapterMeta?.title ||
    (activeChapterMeta?.number ? `Chapter ${activeChapterMeta.number}` : "Chapter");

  // Find total pages for the currently focused chapter by checking its data array
  const activeChapterTotalPages = activeOverlayChapterQuery?.data?.length || 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeWebtoonReader
        ref={nativeReaderRef}
        data={combinedData}
        onEndReached={handleEndReached}
        onChapterChanged={handleChapterChanged}
        onSingleTap={toggleOverlay}
        onPageChanged={handlePageChanged}
        onScrollBegin={hideOverlay}
        onImageError={handleImageError}
        onRetryRequested={retryPage}
      />

      {/* Floating Overlays */}
      <Animated.View style={[styles.topOverlay, { opacity: overlayOpacity }]} pointerEvents={isOverlayVisible ? 'auto' : 'none'}>
        <ReaderTopOverlay chapterTitle={currentChapterTitleDisplay} />
      </Animated.View>

      <Animated.View style={[styles.bottomOverlay, { opacity: overlayOpacity }]} pointerEvents={isOverlayVisible ? 'auto' : 'none'}>
        <ReaderBottomOverlay
          currentChapterId={currentOverlayChapterId}
          currentPageIndex={currentOverlayPageIndex}
          totalVisiblePages={activeChapterTotalPages}
          disabled={isChapterSwitching}
          onSeek={handleSeek}
          onNextChapter={() => {
            if (chapterSwitchTargetId) {
              return;
            }
            // Determine next chapter logically
            const currentIndex = chaptersQuery.data?.findIndex(c => c.id === currentOverlayChapterId) ?? -1;
            const nextIndex = currentIndex - 1; // Reverse sort
            if (nextIndex >= 0 && chaptersQuery.data) {
              const nextId = chaptersQuery.data[nextIndex].id;
              switchToChapter(nextId);
            }
          }}
          onPrevChapter={() => {
            if (chapterSwitchTargetId) {
              return;
            }
            // Determine previous chapter logically
            const currentIndex = chaptersQuery.data?.findIndex(c => c.id === currentOverlayChapterId) ?? -1;
            const prevIndex = currentIndex + 1; // Reverse sort
            if (prevIndex < (chaptersQuery.data?.length ?? 0) && chaptersQuery.data) {
              const prevId = chaptersQuery.data[prevIndex].id;
              switchToChapter(prevId);
            }
          }}
        />
      </Animated.View>

      {isChapterSwitching && (
        <View style={styles.chapterSwitchLoadingOverlay} pointerEvents="auto">
          <ReaderLoadingScreen chapterTitle={chapterSwitchTitle} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  chapterSwitchLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
});
