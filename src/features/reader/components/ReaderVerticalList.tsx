import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useEffect, useMemo, useRef } from "react";
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
      scrollEventThrottle={120}
      showsVerticalScrollIndicator={false}
    />
  );
};
