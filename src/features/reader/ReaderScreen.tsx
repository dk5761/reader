import type { ReaderChapter, ReaderPage } from "@/services/reader";
import { useReaderStore } from "@/services/reader";
import { chapterProgressQueryOptions } from "@/services/progress";
import { getSourceChapters, getSourceMangaDetails } from "@/services/source";
import { sourceQueryFactory } from "@/services/source/core/queryFactory";
import { getSourceChapterPages } from "@/services/source/core/runtime";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getDecodedParam } from "@/shared/utils";
import { useReaderProgressSync } from "./hooks/useReaderProgressSync";
import { ReaderBottomOverlay } from "./components/ReaderBottomOverlay";
import { ReaderLoadingScreen } from "./components/ReaderLoadingScreen";
import { ReaderTopOverlay } from "./components/ReaderTopOverlay";
import { NativeWebtoonReader, type NativeWebtoonReaderRef } from "./NativeReader/WebtoonReader";
import { DownloadError, DownloadedPage, imageDownloadManager } from "./utils/ImageDownloadManager";

type FailedPage = {
  attempts: number;
  lastError: string;
  statusCode?: number;
  terminal: boolean;
  lastAttemptAt: number;
  nextRetryAt?: number;
};

type FailureBanner = {
  pageId: string;
  message: string;
};

const MAX_AUTO_RETRIES = 2;
const AUTO_RETRY_BACKOFF_MS = [750, 2000];
const DOWNLOAD_CONCURRENCY = 3;

export default function ReaderScreen() {
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

  // Background Cache State
  const [downloadedPages, setDownloadedPages] = useState<Record<string, DownloadedPage>>({});
  const [failedPages, setFailedPages] = useState<Record<string, FailedPage>>({});
  const [failureBanner, setFailureBanner] = useState<FailureBanner | null>(null);
  const inFlightPagesRef = useRef<Set<string>>(new Set());
  const failedPagesRef = useRef<Record<string, FailedPage>>({});
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const notifiedFailureKeysRef = useRef<Set<string>>(new Set());

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

  // Dynamically fetch pages for all active chapters
  const chapterPagesStaleTime =
    sourceId === "readcomiconline" ? 0 : Infinity;
  const chapterPagesQueries = useQueries({
    queries: activeChapterIds.map((id) => ({
      queryKey: sourceQueryFactory.chapterPages(sourceId, id),
      queryFn: ({ signal }) => getSourceChapterPages(sourceId, id, signal),
      staleTime: chapterPagesStaleTime,
      refetchOnMount: sourceId === "readcomiconline" ? "always" : true,
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
      { chapterId: string; imageUrl: string; headers?: Record<string, string> }
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
    hasExplicitInitialPageParam,
    primaryChapterPages,
    entryChapterId,
    sourceId,
    mangaId,
    initialPage,
    setChapter,
    setCurrentPage,
  ]);

  const hasAppliedPersistedInitialPageRef = useRef(false);
  useEffect(() => {
    retryTimersRef.current.forEach((timer) => clearTimeout(timer));
    retryTimersRef.current.clear();
    inFlightPagesRef.current.clear();
    failedPagesRef.current = {};
    notifiedFailureKeysRef.current.clear();
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
    setDownloadedPages({});
    setFailedPages({});
    setFailureBanner(null);
    reset();
  }, [
    hasExplicitInitialPageParam,
    initialChapterId,
    initialPage,
    mangaId,
    reset,
    sourceId,
  ]);

  useEffect(() => {
    failedPagesRef.current = failedPages;
  }, [failedPages]);

  useEffect(() => {
    const retryTimers = retryTimersRef.current;
    const inFlightPages = inFlightPagesRef.current;
    return () => {
      retryTimers.forEach((timer) => clearTimeout(timer));
      retryTimers.clear();
      inFlightPages.clear();
    };
  }, []);

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

  const retryPage = useCallback((pageId: string) => {
    const timer = retryTimersRef.current.get(pageId);
    if (timer) {
      clearTimeout(timer);
      retryTimersRef.current.delete(pageId);
    }
    setFailedPages((prev) => {
      if (!prev[pageId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
    notifiedFailureKeysRef.current.forEach((key) => {
      if (key.startsWith(`${pageId}:`)) {
        notifiedFailureKeysRef.current.delete(key);
      }
    });
    setFailureBanner((current) => (current?.pageId === pageId ? null : current));
  }, []);

  const applyDownloadFailure = useCallback((pageId: string, error: unknown) => {
    const now = Date.now();
    const normalized = error instanceof DownloadError
      ? error
      : new DownloadError(
          error instanceof Error ? error.message : String(error ?? "Failed to download page"),
          { retriable: true, code: "unknown", cause: error },
        );

    const previous = failedPagesRef.current[pageId];
    const attempts = (previous?.attempts ?? 0) + 1;
    const retryIndex = attempts - 1;
    const shouldRetryAutomatically = normalized.retriable && retryIndex <= MAX_AUTO_RETRIES - 1;
    const retryDelay =
      shouldRetryAutomatically
        ? AUTO_RETRY_BACKOFF_MS[Math.min(retryIndex, AUTO_RETRY_BACKOFF_MS.length - 1)]
        : undefined;

    const nextFailure: FailedPage = {
      attempts,
      lastError: normalized.message,
      statusCode: normalized.statusCode,
      terminal: !shouldRetryAutomatically,
      lastAttemptAt: now,
      nextRetryAt: retryDelay ? now + retryDelay : undefined,
    };

    setFailedPages((prev) => ({
      ...prev,
      [pageId]: nextFailure,
    }));

    if (retryDelay) {
      const existing = retryTimersRef.current.get(pageId);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        retryTimersRef.current.delete(pageId);
        setFailedPages((current) => {
          const failure = current[pageId];
          if (!failure || failure.terminal) {
            return current;
          }
          return {
            ...current,
            [pageId]: {
              ...failure,
              nextRetryAt: undefined,
            },
          };
        });
      }, retryDelay);
      retryTimersRef.current.set(pageId, timer);
      return;
    }

    const notificationKey = `${pageId}:${normalized.statusCode ?? "na"}:${normalized.message}`;
    if (!notifiedFailureKeysRef.current.has(notificationKey)) {
      notifiedFailureKeysRef.current.add(notificationKey);
      setFailureBanner({
        pageId,
        message:
          normalized.statusCode !== undefined
            ? `Page failed (${normalized.statusCode}).`
            : "Page failed to load.",
      });
    }
  }, []);

  // Background Downloader Hook with deterministic failure handling.
  useEffect(() => {
    const now = Date.now();
    const queue: {
      pageId: string;
      chapterId: string;
      imageUrl: string;
      headers?: Record<string, string>;
    }[] = [];

    pageTaskById.forEach((task, pageId) => {
      if (downloadedPages[pageId]) {
        return;
      }

      const failed = failedPages[pageId];
      if (failed?.terminal) {
        return;
      }
      if (failed?.nextRetryAt && failed.nextRetryAt > now) {
        return;
      }
      if (inFlightPagesRef.current.has(pageId)) {
        return;
      }

      queue.push({
        pageId,
        chapterId: task.chapterId,
        imageUrl: task.imageUrl,
        headers: task.headers,
      });
    });

    if (queue.length === 0) {
      return;
    }

    let cancelled = false;
    let cursor = 0;
    const workers = Math.min(DOWNLOAD_CONCURRENCY, queue.length);

    const worker = async () => {
      while (!cancelled) {
        const task = queue[cursor];
        cursor += 1;
        if (!task) {
          break;
        }

        inFlightPagesRef.current.add(task.pageId);
        try {
          const result = await imageDownloadManager.downloadPage(
            task.chapterId,
            task.imageUrl,
            task.headers,
          );
          if (cancelled) {
            continue;
          }

          setDownloadedPages((prev) => ({
            ...prev,
            [task.pageId]: result,
          }));
          setFailedPages((prev) => {
            if (!prev[task.pageId]) {
              return prev;
            }
            const next = { ...prev };
            delete next[task.pageId];
            return next;
          });
        } catch (error) {
          if (cancelled) {
            continue;
          }
          console.error(`Failed to download page ${task.pageId}`, error);
          applyDownloadFailure(task.pageId, error);
        } finally {
          inFlightPagesRef.current.delete(task.pageId);
        }
      }
    };

    void Promise.all(Array.from({ length: workers }, () => worker()));

    return () => {
      cancelled = true;
    };
  }, [applyDownloadFailure, downloadedPages, failedPages, pageTaskById]);

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
          const downloaded = downloadedPages[pageId];

          return {
            id: pageId,
            localPath: downloaded?.localUri || "",
            pageIndex: index,
            chapterId: cId,
            aspectRatio: downloaded ? (downloaded.width / downloaded.height) : ((p.width && p.height) ? p.width / p.height : 1),
            isTransition: false,
            headers: p.headers,
          };
        }));
      }
    }
    return merged;
  }, [chapterPagesQueries, activeChapterIds, chaptersQuery.data, downloadedPages]);

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
  }, [combinedData, pendingSeek, chapterSwitchTargetId]);

  const handleEndReached = useCallback((reachedChapterId: string) => {
    if (chapterSwitchTargetRef.current) {
      return;
    }

    if (!chaptersQuery.data) return;

    // Only preload if we reached the boundary of the explicitly *last* chapter in our list
    if (reachedChapterId !== activeChapterIds[activeChapterIds.length - 1]) {
      return;
    }

    const currentIndex = chaptersQuery.data.findIndex(c => c.id === reachedChapterId);

    // Assuming chapters are sorted newest first (index 0 is newest).
    // Reading direction goes from older to newer -> so index - 1
    const nextIndex = currentIndex - 1;
    if (nextIndex >= 0) {
      const nextChapterId = chaptersQuery.data[nextIndex].id;
      if (!activeChapterIds.includes(nextChapterId)) {
        setActiveChapterIds(prev => {
          let updated = [...prev, nextChapterId];
          // Phase 5: Aggressive Memory Eviction. Keeps only the immediate previous, current, and next chapters in the DOM.
          // This allows native UICollectionView to eagerly destroy old `TiledImageView` cells.
          if (updated.length > 3) {
            const evictedId = updated.shift(); // Drop the oldest loaded chapter from React State
            if (evictedId) {
              // Also purge from disk cache asynchronously
              imageDownloadManager.evictChapter(evictedId).catch(console.error);
            }
          }
          return updated;
        });
      }
    }
  }, [chaptersQuery.data, activeChapterIds]);

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
    setCurrentOverlayChapterId(chapterId);
  }, []);

  const handleImageError = useCallback((pageId: string, error: string) => {
    const failure = failedPagesRef.current[pageId];
    if (!failure?.terminal) {
      return;
    }

    const notificationKey = `${pageId}:native:${error}`;
    if (notifiedFailureKeysRef.current.has(notificationKey)) {
      return;
    }

    notifiedFailureKeysRef.current.add(notificationKey);
    setFailureBanner({
      pageId,
      message: "Page failed to render.",
    });
  }, []);

  const handleSeek = useCallback((pageIndex: number) => {
    if (chapterSwitchTargetRef.current) {
      return;
    }
    const targetPage = Math.floor(pageIndex);
    setCurrentOverlayPageIndex(targetPage);
    void nativeReaderRef.current?.seekTo(currentOverlayChapterId, targetPage);
  }, [currentOverlayChapterId]);

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

      {failureBanner && (
        <View style={styles.failureBannerContainer} pointerEvents="box-none">
          <View style={styles.failureBanner}>
            <Text style={styles.failureBannerText}>
              {failureBanner.message} Tap retry.
            </Text>
            <View style={styles.failureActions}>
              <TouchableOpacity
                onPress={() => retryPage(failureBanner.pageId)}
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFailureBanner(null)}
                style={styles.dismissButton}
              >
                <Text style={styles.dismissButtonText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  failureBannerContainer: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 86,
    zIndex: 40,
  },
  failureBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.45)",
    backgroundColor: "rgba(35,16,16,0.96)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  failureBannerText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "600",
  },
  failureActions: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
  },
  retryButton: {
    borderRadius: 999,
    backgroundColor: "#7F1D1D",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryButtonText: {
    color: "#FDE2E2",
    fontSize: 12,
    fontWeight: "700",
  },
  dismissButton: {
    borderRadius: 999,
    backgroundColor: "#2A2A2E",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dismissButtonText: {
    color: "#D4D4D8",
    fontSize: 12,
    fontWeight: "600",
  },
});
