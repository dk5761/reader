import type { ReaderChapter, ReaderPage } from "@/services/reader";
import { useReaderStore } from "@/services/reader";
import { getSourceChapters } from "@/services/source";
import { sourceQueryFactory } from "@/services/source/core/queryFactory";
import { getSourceChapterPages } from "@/services/source/core/runtime";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { ReaderBottomOverlay } from "./components/ReaderBottomOverlay";
import { ReaderLoadingScreen } from "./components/ReaderLoadingScreen";
import { ReaderTopOverlay } from "./components/ReaderTopOverlay";
import { NativeWebtoonReader, type NativeWebtoonReaderRef } from "./NativeReader/WebtoonReader";

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
  const initialPage = Array.isArray(params.initialPage)
    ? parseInt(params.initialPage[0], 10)
    : parseInt(params.initialPage || "0", 10);

  const { setChapter, setCurrentPage, chapter } = useReaderStore();

  const [activeChapterIds, setActiveChapterIds] = useState<string[]>([initialChapterId]);

  // Overlay State Tracking driven by Native Swift scroll events
  const nativeReaderRef = useRef<NativeWebtoonReaderRef>(null);
  const [isOverlayVisible, setOverlayVisible] = useState(true);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const [currentOverlayChapterId, setCurrentOverlayChapterId] = useState(initialChapterId);
  const [currentOverlayPageIndex, setCurrentOverlayPageIndex] = useState(0);

  // Fetch the master chapter list to know the ordering
  const chaptersQuery = useQuery({
    queryKey: sourceQueryFactory.chapters(sourceId, mangaId),
    queryFn: ({ signal }) => getSourceChapters(sourceId, mangaId, signal),
    staleTime: Infinity,
    enabled: Boolean(sourceId && mangaId),
  });

  // Dynamically fetch pages for all active chapters
  const chapterPagesQueries = useQueries({
    queries: activeChapterIds.map((id) => ({
      queryKey: sourceQueryFactory.chapterPages(sourceId, id),
      queryFn: ({ signal }) => getSourceChapterPages(sourceId, id, signal),
      staleTime: Infinity,
      enabled: Boolean(sourceId && id),
    })),
  });

  // Keep the store "chapter" updated for the primary initial chapter
  // (Progress tracking might need to be explicitly managed onChapterChanged later)
  useEffect(() => {
    const primaryQuery = chapterPagesQueries[0];
    if (primaryQuery?.data && initialChapterId) {
      const pages: ReaderPage[] = primaryQuery.data.map((page, index) => ({
        index,
        pageId: `${initialChapterId}-${index}`,
        imageUrl: page.imageUrl,
        headers: page.headers,
        width: page.width,
        height: page.height,
        state: { status: "ready", imageUrl: page.imageUrl },
      }));

      const firstPage = primaryQuery.data[0];
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

      if (initialPage > 0) {
        setCurrentPage(initialPage);
      }
    }
  }, [
    chapterPagesQueries[0]?.data,
    initialChapterId,
    sourceId,
    mangaId,
    initialPage,
    setChapter,
    setCurrentPage,
  ]);

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
            url: "", // Transition cells don't need URLs
            chapterId: cId,
            aspectRatio: 1, // Ignored by native transition cell
            isTransition: true,
            previousChapterTitle: prevDisplay,
            nextChapterTitle: nextDisplay
          });
        }

        merged = merged.concat(query.data.map((p, index) => ({
          id: `${cId}-${index}`,
          url: p.imageUrl,
          chapterId: cId,
          aspectRatio: (p.width && p.height) ? p.width / p.height : 1,
          isTransition: false,
          headers: p.headers,
        })));
      }
    }
    return merged;
  }, [chapterPagesQueries, activeChapterIds, chaptersQuery.data]);

  const handleEndReached = useCallback((reachedChapterId: string) => {
    console.log("[ReaderScreen] handleEndReached CALLED with chapterId:", reachedChapterId);
    console.log("[ReaderScreen] activeChapterIds Currently:", activeChapterIds);
    console.log("[ReaderScreen] is chaptersQuery loaded?", !!chaptersQuery.data);

    if (!chaptersQuery.data) return;

    // Only preload if we reached the boundary of the explicitly *last* chapter in our list
    if (reachedChapterId !== activeChapterIds[activeChapterIds.length - 1]) {
      console.log("[ReaderScreen] ABORTING: Reached chapter is not the last active chapter.");
      return;
    }

    const currentIndex = chaptersQuery.data.findIndex(c => c.id === reachedChapterId);
    console.log("[ReaderScreen] currentIndex in master list:", currentIndex);

    // Assuming chapters are sorted newest first (index 0 is newest).
    // Reading direction goes from older to newer -> so index - 1
    const nextIndex = currentIndex - 1;
    if (nextIndex >= 0) {
      const nextChapterId = chaptersQuery.data[nextIndex].id;
      console.log("[ReaderScreen] PRELOADING NEXT CHAPTER:", nextChapterId);
      if (!activeChapterIds.includes(nextChapterId)) {
        setActiveChapterIds(prev => [...prev, nextChapterId]);
      }
    } else {
      console.log("[ReaderScreen] No next chapter found (hit the end of the manga).");
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

  const handlePageChanged = useCallback((chapterId: string, pageIndex: number) => {
    setCurrentOverlayChapterId(chapterId);
    setCurrentOverlayPageIndex(pageIndex);
  }, []);

  const handleSeek = useCallback((pageIndex: number) => {
    nativeReaderRef.current?.seekTo(currentOverlayChapterId, Math.floor(pageIndex));
  }, [currentOverlayChapterId]);

  const primaryQuery = chapterPagesQueries[0];

  if (primaryQuery?.isPending || !primaryQuery?.data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ReaderLoadingScreen />
      </>
    );
  }

  if (primaryQuery?.isError) {
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
  const activeChapterQuery = chapterPagesQueries.find(q =>
    activeChapterIds.indexOf(currentOverlayChapterId) === chapterPagesQueries.indexOf(q));
  const activeChapterTotalPages = activeChapterQuery?.data?.length || 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeWebtoonReader
        ref={nativeReaderRef}
        data={combinedData}
        onEndReached={handleEndReached}
        onSingleTap={toggleOverlay}
        onPageChanged={handlePageChanged}
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
          onSeek={handleSeek}
          onNextChapter={() => {
            // Determine next chapter logically
            const currentIndex = chaptersQuery.data?.findIndex(c => c.id === currentOverlayChapterId) ?? -1;
            const nextIndex = currentIndex - 1; // Reverse sort
            if (nextIndex >= 0 && chaptersQuery.data) {
              const nextId = chaptersQuery.data[nextIndex].id;
              if (!activeChapterIds.includes(nextId)) {
                setActiveChapterIds(prev => [...prev, nextId]);
              }
              // Give JS time to fetch and render the payload, then seek to its index 0
              setTimeout(() => nativeReaderRef.current?.seekTo(nextId, 0), 300);
            }
          }}
          onPrevChapter={() => {
            // Determine previous chapter logically
            const currentIndex = chaptersQuery.data?.findIndex(c => c.id === currentOverlayChapterId) ?? -1;
            const prevIndex = currentIndex + 1; // Reverse sort
            if (prevIndex < (chaptersQuery.data?.length ?? 0) && chaptersQuery.data) {
              const prevId = chaptersQuery.data[prevIndex].id;
              if (!activeChapterIds.includes(prevId)) {
                setActiveChapterIds(prev => [prevId, ...prev]);
              }
              setTimeout(() => nativeReaderRef.current?.seekTo(prevId, 0), 300);
            }
          }}
        />
      </Animated.View>
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
  }
});
