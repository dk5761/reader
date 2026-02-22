import type { ReaderChapter, ReaderPage } from "@/services/reader";
import { useReaderStore } from "@/services/reader";
import { chapterProgressQueryOptions } from "@/services/progress";
import { getSourceChapters, getSourceMangaDetails } from "@/services/source";
import { sourceQueryFactory } from "@/services/source/core/queryFactory";
import { getSourceChapterPages } from "@/services/source/core/runtime";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useReaderProgressSync } from "./hooks/useReaderProgressSync";
import { ReaderBottomOverlay } from "./components/ReaderBottomOverlay";
import { ReaderLoadingScreen } from "./components/ReaderLoadingScreen";
import { ReaderTopOverlay } from "./components/ReaderTopOverlay";
import { NativeWebtoonReader, type NativeWebtoonReaderRef } from "./NativeReader/WebtoonReader";
import { DownloadedPage, imageDownloadManager } from "./utils/ImageDownloadManager";

export default function ReaderScreen() {
  const params = useLocalSearchParams<{
    sourceId?: string | string[];
    mangaId?: string | string[];
    chapterId?: string | string[];
    initialPage?: string | string[];
  }>();

  const sourceId = Array.isArray(params.sourceId)
    ? params.sourceId[0]
    : params.sourceId || "";
  const mangaId = Array.isArray(params.mangaId)
    ? params.mangaId[0]
    : params.mangaId || "";
  const initialChapterId = Array.isArray(params.chapterId)
    ? params.chapterId[0]
    : params.chapterId || "";
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

  const { setChapter, setCurrentPage, chapter } = useReaderStore();

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
      initialChapterId,
      Boolean(sourceId && mangaId && initialChapterId && !hasExplicitInitialPageParam)
    )
  );

  // Dynamically fetch pages for all active chapters
  const chapterPagesQueries = useQueries({
    queries: activeChapterIds.map((id) => ({
      queryKey: sourceQueryFactory.chapterPages(sourceId, id),
      queryFn: ({ signal }) => getSourceChapterPages(sourceId, id, signal),
      staleTime: Infinity,
      enabled: Boolean(sourceId && id),
    })),
  });

  const initialChapterQueryIndex = activeChapterIds.indexOf(initialChapterId);
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

  const isChapterSwitching = Boolean(chapterSwitchTargetId);
  const chapterSwitchMeta = chaptersQuery.data?.find((c) => c.id === chapterSwitchTargetId);
  const chapterSwitchTitle = chapterSwitchMeta?.title ||
    (chapterSwitchMeta?.number ? `Chapter ${chapterSwitchMeta.number}` : undefined);

  // Keep the store "chapter" updated for the primary initial chapter
  // (Progress tracking might need to be explicitly managed onChapterChanged later)
  useEffect(() => {
    if (primaryChapterPages && initialChapterId) {
      const pages: ReaderPage[] = primaryChapterPages.map((page, index) => ({
        index,
        pageId: `${initialChapterId}-${index}`,
        imageUrl: page.imageUrl,
        headers: page.headers,
        width: page.width,
        height: page.height,
        state: { status: "ready", imageUrl: page.imageUrl },
      }));

      const firstPage = primaryChapterPages[0];
      const readerChapter: ReaderChapter = {
        id: initialChapterId,
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
    initialChapterId,
    sourceId,
    mangaId,
    initialPage,
    setChapter,
    setCurrentPage,
  ]);

  const hasAppliedPersistedInitialPageRef = useRef(false);
  useEffect(() => {
    if (hasExplicitInitialPageParam || !initialChapterId) {
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

    setCurrentOverlayChapterId(initialChapterId);
    setCurrentOverlayPageIndex(persistedPageIndex);
    setCurrentProgressCursor({
      chapterId: initialChapterId,
      pageIndex: persistedPageIndex,
    });
    setCurrentPage(persistedPageIndex);
    setPendingSeek({
      chapterId: initialChapterId,
      pageIndex: persistedPageIndex,
    });
  }, [
    hasExplicitInitialPageParam,
    initialChapterId,
    initialChapterProgressQuery.data?.pageIndex,
    initialChapterProgressQuery.isPending,
    setCurrentPage,
  ]);

  // Background Downloader Hook
  // Watches all active chapter pages data, and eagerly downloads them to disk.
  useEffect(() => {
    chapterPagesQueries.forEach((query, i) => {
      const cId = activeChapterIds[i];
      if (query.data) {
        // Preload next 10 items or entire chapter
        query.data.forEach(async (p, index) => {
          const cacheKey = `${cId}-${index}`;
          if (!downloadedPages[cacheKey]) {
            try {
              const result = await imageDownloadManager.downloadPage(cId, p.imageUrl, p.headers);
              setDownloadedPages(prev => ({
                ...prev,
                [cacheKey]: result
              }));
            } catch (e) {
              console.error(`Failed to download page ${cacheKey}`, e);
            }
          }
        });
      }
    });
  }, [chapterPagesQueries, activeChapterIds, downloadedPages]);

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
