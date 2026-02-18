import type { ReaderPage as ReaderPageType } from "@/services/reader";
import { useReaderStore } from "@/services/reader";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, View, ViewToken } from "react-native";
import { ReaderOverlay } from "./ReaderOverlay";
import { ReaderPageComponent } from "./ReaderPage";

const PRELOAD_AHEAD_PAGES = 4;

export function WebtoonReader() {
  const { chapter, currentPageIndex, setCurrentPage } = useReaderStore();
  const flatListRef = useRef<FlashListRef<ReaderPageType>>(null);
  const isInitialScrollDone = useRef(false);
  const lastPrefetchedIndex = useRef(-1);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const touchStartTime = useRef<number>(0);
  const isScrollRef = useRef(false);
  const slideAnim = useRef(new Animated.Value(-150)).current;

  // Prefetch images for upcoming pages
  const prefetchPages = useCallback(
    (pageIndex: number) => {
      if (!chapter) return;

      // Don't prefetch if already prefetched up to this point
      if (pageIndex >= lastPrefetchedIndex.current) {
        const startIndex = lastPrefetchedIndex.current + 1;
        const endIndex = Math.min(
          pageIndex + PRELOAD_AHEAD_PAGES,
          chapter.pages.length - 1,
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
    [chapter],
  );

  useEffect(() => {
    if (
      chapter &&
      currentPageIndex > 0 &&
      flatListRef.current &&
      !isInitialScrollDone.current
    ) {
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
    (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => {
      // Scroll to a position near the failed index
      const scrollPosition = info.averageItemLength * info.index;
      flatListRef.current?.scrollToOffset({
        offset: scrollPosition,
        animated: false,
      });
    },
    [],
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
    [setCurrentPage, prefetchPages],
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
      const newVisible = !overlayVisible;
      setOverlayVisible(newVisible);

      // Animate slide down/up
      Animated.timing(slideAnim, {
        toValue: newVisible ? 0 : -150,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [overlayVisible, slideAnim]);

  const onScrollBegin = useCallback(() => {
    isScrollRef.current = true;
  }, []);

  if (!chapter) {
    return null;
  }

  return (
    <View className="flex-1 bg-[#0F0F12]">
      {chapter && (
        <Animated.View
          className="absolute left-0 right-0 top-0 z-100"
          style={{ transform: [{ translateY: slideAnim }] }}
        >
          <ReaderOverlay
            chapterId={chapter.id}
            chapterNumber={chapter.number}
          />
        </Animated.View>
      )}
      <FlashList
        ref={flatListRef}
        data={chapter.pages}
        keyExtractor={(item) => item.pageId}
        renderItem={({ item }) => <ReaderPageComponent page={item} />}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScrollBeginDrag={onScrollBegin}
        onMomentumScrollBegin={onScrollBegin}
        onTouchStart={onTouchStart}
        onTouchEnd={handleTap}
        removeClippedSubviews={true}
        className="flex-1"
      />
    </View>
  );
}
