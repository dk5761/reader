import { useRef, useEffect, useCallback, useState } from "react";
import { FlatList, StyleSheet, ViewToken, View } from "react-native";
import { Image } from "expo-image";
import { ReaderPageComponent } from "./ReaderPage";
import { ReaderOverlay } from "./ReaderOverlay";
import { useReaderStore } from "@/services/reader";
import type { ReaderPage as ReaderPageType } from "@/services/reader";

const PRELOAD_AHEAD_PAGES = 4;

export function WebtoonReader() {
  const { chapter, currentPageIndex, setCurrentPage } = useReaderStore();
  const flatListRef = useRef<FlatList<ReaderPageType>>(null);
  const isInitialScrollDone = useRef(false);
  const lastPrefetchedIndex = useRef(-1);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const touchStartTime = useRef<number>(0);
  const isScrollRef = useRef(false);

  // Prefetch images for upcoming pages
  const prefetchPages = useCallback(
    (pageIndex: number) => {
      if (!chapter) return;

      // Don't prefetch if already prefetched up to this point
      if (pageIndex >= lastPrefetchedIndex.current) {
        const startIndex = lastPrefetchedIndex.current + 1;
        const endIndex = Math.min(
          pageIndex + PRELOAD_AHEAD_PAGES,
          chapter.pages.length - 1
        );

        if (startIndex <= endIndex) {
          const urlsToPrefetch = chapter.pages
            .slice(startIndex, endIndex + 1)
            .map((page) => page.imageUrl);

          if (urlsToPrefetch.length > 0) {
            Image.prefetch(urlsToPrefetch);
            lastPrefetchedIndex.current = endIndex;
          }
        }
      }
    },
    [chapter]
  );

  useEffect(() => {
    if (chapter && currentPageIndex > 0 && flatListRef.current && !isInitialScrollDone.current) {
      // Use setTimeout to ensure the list has rendered
      const timeout = setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToIndex({
            index: currentPageIndex,
            animated: false,
          });
          isInitialScrollDone.current = true;
          // Prefetch pages after initial scroll
          prefetchPages(currentPageIndex);
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [chapter, currentPageIndex, prefetchPages]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      // Scroll to a position near the failed index
      const scrollPosition = info.averageItemLength * info.index;
      flatListRef.current?.scrollToOffset({
        offset: scrollPosition,
        animated: false,
      });
    },
    []
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const firstVisible = viewableItems[0];
        if (firstVisible.index !== undefined && firstVisible.index !== null) {
          setCurrentPage(firstVisible.index);
          // Prefetch upcoming pages
          prefetchPages(firstVisible.index);
        }
      }
    },
    [setCurrentPage, prefetchPages]
  );

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const onTouchStart = useCallback(() => {
    touchStartTime.current = Date.now();
    isScrollRef.current = false;
  }, []);

  const handleTap = useCallback(() => {
    const touchDuration = Date.now() - touchStartTime.current;
    // Only treat as tap if touch was short (< 200ms) and not scrolling
    if (touchDuration < 200 && !isScrollRef.current) {
      setOverlayVisible((prev) => !prev);
    }
  }, []);

  const onScrollBegin = useCallback(() => {
    isScrollRef.current = true;
  }, []);

  if (!chapter) {
    return null;
  }

  return (
    <View style={styles.container}>
      {overlayVisible && chapter && (
        <ReaderOverlay
          chapterId={chapter.id}
          chapterNumber={chapter.number}
        />
      )}
      <FlatList
        ref={flatListRef}
        data={chapter.pages}
        keyExtractor={(item) => item.pageId}
        renderItem={({ item }) => <ReaderPageComponent page={item} />}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScrollToIndexFailed={onScrollToIndexFailed}
        onScrollBeginDrag={onScrollBegin}
        onMomentumScrollBegin={onScrollBegin}
        onTouchStart={onTouchStart}
        onTouchEnd={handleTap}
        initialNumToRender={3}
        maxToRenderPerBatch={5}
        windowSize={10}
        removeClippedSubviews={true}
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F12",
  },
  list: {
    flex: 1,
  },
});
