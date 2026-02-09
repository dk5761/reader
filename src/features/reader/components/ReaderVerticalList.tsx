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
  onTapPage: () => void;
  onScrollBeginDrag: () => void;
}

export const ReaderVerticalList = ({
  pages,
  initialFlatIndex,
  requestedFlatIndex = null,
  onVisibleFlatIndexChange,
  onNearEnd,
  onTapPage,
  onScrollBeginDrag,
}: ReaderVerticalListProps) => {
  const listRef = useRef<FlashListRef<ReaderFlatPage> | null>(null);
  const lastVisibleIndexRef = useRef<number>(-1);
  const lastRequestedIndexRef = useRef<number | null>(null);
  const lastNearEndTokenRef = useRef<string | null>(null);

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
  }, [pages.length]);

  const maybeTriggerNearEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromEnd =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);

      // Fallback for cases where FlashList onEndReached is missed on initial loads.
      if (distanceFromEnd > 96) {
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
      onScrollBeginDrag={onScrollBeginDrag}
      scrollEventThrottle={120}
      showsVerticalScrollIndicator={false}
    />
  );
};
