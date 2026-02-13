import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, ViewToken } from "react-native";
import type { ReaderFlatPage } from "../types/reader.types";
import { ReaderPageItem } from "./ReaderPageItem";

interface ReaderVerticalListProps {
  pages: ReaderFlatPage[];
  initialFlatIndex: number;
  requestedFlatIndex?: number | null;
  onVisibleFlatIndexChange: (index: number) => void;
  onNearEnd: () => void;
  onNearStart?: () => void;
  onTapPage: () => void;
  onScrollBeginDrag: () => void;
}

// Number of pages from the end of a chapter where we increase deceleration
const PAGES_BEFORE_CHAPTER_END_TO_DECELERATE = 5;

export const ReaderVerticalList = ({
  pages,
  initialFlatIndex,
  requestedFlatIndex = null,
  onVisibleFlatIndexChange,
  onNearEnd,
  onNearStart,
  onTapPage,
  onScrollBeginDrag,
}: ReaderVerticalListProps) => {
  const listRef = useRef<FlashListRef<ReaderFlatPage> | null>(null);
  const lastVisibleIndexRef = useRef<number>(-1);
  const lastRequestedIndexRef = useRef<number | null>(null);
  const lastNearEndTokenRef = useRef<string | null>(null);
  const lastNearStartTokenRef = useRef<string | null>(null);
  const [decelerationRate, setDecelerationRate] = useState<"normal" | "fast">("normal");

  const safeInitialIndex = useMemo(() => {
    if (pages.length === 0) {
      return 0;
    }

    return Math.max(0, Math.min(initialFlatIndex, pages.length - 1));
  }, [initialFlatIndex, pages.length]);

  const handleViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[] }) => {
      const firstVisible = info.viewableItems
        .filter(
          (viewableItem) =>
            viewableItem.isViewable && typeof viewableItem.index === "number"
        )
        .map((viewableItem) => viewableItem.index as number)
        .sort((a, b) => a - b)[0];

      if (firstVisible === undefined) {
        return;
      }

      if (lastVisibleIndexRef.current !== firstVisible) {
        lastVisibleIndexRef.current = firstVisible;
        onVisibleFlatIndexChange(firstVisible);
      }
    },
    [onVisibleFlatIndexChange]
  );

  useEffect(() => {
    if (requestedFlatIndex === null || requestedFlatIndex === undefined || pages.length === 0) {
      if (requestedFlatIndex === null || requestedFlatIndex === undefined) {
        lastRequestedIndexRef.current = null;
      }
      return;
    }

    const safeRequestedIndex = Math.max(
      0,
      Math.min(requestedFlatIndex, pages.length - 1)
    );

    if (lastRequestedIndexRef.current === safeRequestedIndex) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const scrollPromise = listRef.current?.scrollToIndex({
        index: safeRequestedIndex,
        animated: false,
      });

      if (!scrollPromise) {
        lastRequestedIndexRef.current = safeRequestedIndex;
        return;
      }

      void scrollPromise
        .then(() => {
          lastRequestedIndexRef.current = safeRequestedIndex;
        })
        .catch(() => {
          // Allow re-attempts for the same target index on transient layout failures.
          lastRequestedIndexRef.current = null;
        });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pages.length, requestedFlatIndex]);

  useEffect(() => {
    lastNearEndTokenRef.current = null;
    lastNearStartTokenRef.current = null;
  }, [pages.length]);

  const maybeTriggerNearEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement, velocity } = event.nativeEvent;
      const distanceFromEnd =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);

      // Only trigger when near the end of content
      if (distanceFromEnd > 96) {
        return;
      }

      // Only trigger next chapter when user is decelerating (velocity close to 0)
      // This prevents skipping chapters when swiping fast - user needs to slow down
      // or do a deliberate swipe to trigger the next chapter
      if (velocity && Math.abs(velocity.y) > 0.3) {
        return;
      }

      const token = `${pages.length}:${Math.max(0, Math.floor(contentOffset.y))}`;
      if (lastNearEndTokenRef.current === token) {
        return;
      }

      lastNearEndTokenRef.current = token;
      onNearEnd();
    },
    [onNearEnd, pages.length]
  );

  const maybeTriggerNearStart = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!onNearStart) {
        return;
      }

      const { contentOffset, layoutMeasurement, velocity } = event.nativeEvent;
      const distanceFromStart = contentOffset.y;

      // Only trigger when near the very start of the content
      if (distanceFromStart > 96) {
        return;
      }

      // Only trigger previous chapter when user is decelerating (velocity close to 0)
      // This prevents skipping chapters when swiping fast
      if (velocity && Math.abs(velocity.y) > 0.3) {
        return;
      }

      const token = `${pages.length}:${Math.max(0, Math.floor(distanceFromStart))}`;
      if (lastNearStartTokenRef.current === token) {
        return;
      }

      lastNearStartTokenRef.current = token;
      onNearStart();
    },
    [onNearStart, pages.length]
  );

  // Check if current position is near a chapter boundary (end of a chapter)
  const isNearChapterBoundary = useCallback(
    (currentIndex: number): boolean => {
      if (pages.length === 0) {
        return false;
      }

      // Get the current page's chapter info
      const currentPage = pages[currentIndex];
      if (!currentPage) {
        return false;
      }

      // Find the last page index of the current chapter
      let lastPageIndexOfCurrentChapter = currentIndex;
      for (let i = currentIndex + 1; i < pages.length; i++) {
        if (pages[i].chapterId !== currentPage.chapterId) {
          break;
        }
        lastPageIndexOfCurrentChapter = i;
      }

      // Check if we're within PAGES_BEFORE_CHAPTER_END_TO_DECELERATE pages of the chapter end
      const distanceFromChapterEnd = lastPageIndexOfCurrentChapter - currentIndex;
      return distanceFromChapterEnd <= PAGES_BEFORE_CHAPTER_END_TO_DECELERATE;
    },
    [pages]
  );

  // Handle scroll to dynamically adjust deceleration rate near chapter boundaries
  const handleScroll = useCallback(() => {
    if (isNearChapterBoundary(lastVisibleIndexRef.current)) {
      setDecelerationRate("fast");
    } else {
      setDecelerationRate("normal");
    }
  }, [isNearChapterBoundary]);

  const renderItem = useCallback(
    ({ item }: { item: ReaderFlatPage }) => (
      <ReaderPageItem
        page={item}
        onTap={onTapPage}
        showChapterDivider={item.chapterIndex > 0 && item.pageIndex === 0}
      />
    ),
    [onTapPage]
  );

  return (
    <FlashList
      ref={listRef}
      data={pages}
      renderItem={renderItem}
      keyExtractor={(item) => item.key}
      initialScrollIndex={safeInitialIndex}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={{ viewAreaCoveragePercentThreshold: 15 }}
      onEndReachedThreshold={0.5}
      onEndReached={onNearEnd}
      onMomentumScrollEnd={maybeTriggerNearEnd}
      onScrollEndDrag={maybeTriggerNearEnd}
      onScrollBeginDrag={(event) => {
        maybeTriggerNearStart(event);
        onScrollBeginDrag();
      }}
      onScroll={handleScroll}
      decelerationRate={decelerationRate}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    />
  );
};
