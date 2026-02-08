import { FlashList } from "@shopify/flash-list";
import { useCallback, useMemo, useRef } from "react";
import { ViewToken } from "react-native";
import type { ReaderFlatPage } from "../types/reader.types";
import { ReaderPageItem } from "./ReaderPageItem";

interface ReaderVerticalListProps {
  pages: ReaderFlatPage[];
  initialFlatIndex: number;
  onVisibleFlatIndexChange: (index: number) => void;
  onNearEnd: () => void;
  onTapPage: () => void;
  onScrollBeginDrag: () => void;
}

export const ReaderVerticalList = ({
  pages,
  initialFlatIndex,
  onVisibleFlatIndexChange,
  onNearEnd,
  onTapPage,
  onScrollBeginDrag,
}: ReaderVerticalListProps) => {
  const lastVisibleIndexRef = useRef<number>(-1);

  const safeInitialIndex = useMemo(() => {
    if (pages.length === 0) {
      return 0;
    }

    return Math.max(0, Math.min(initialFlatIndex, pages.length - 1));
  }, [initialFlatIndex, pages.length]);

  const handleViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[] }) => {
      const first = info.viewableItems[0]?.index;
      if (first === undefined || first === null) {
        return;
      }

      if (lastVisibleIndexRef.current !== first) {
        lastVisibleIndexRef.current = first;
        onVisibleFlatIndexChange(first);
      }
    },
    [onVisibleFlatIndexChange]
  );

  const renderItem = useCallback(
    ({ item }: { item: ReaderFlatPage }) => (
      <ReaderPageItem page={item} onTap={onTapPage} />
    ),
    [onTapPage]
  );

  return (
    <FlashList
      data={pages}
      renderItem={renderItem}
      keyExtractor={(item) => item.key}
      initialScrollIndex={safeInitialIndex}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      onEndReachedThreshold={0.5}
      onEndReached={onNearEnd}
      onScrollBeginDrag={onScrollBeginDrag}
      scrollEventThrottle={120}
      showsVerticalScrollIndicator={false}
    />
  );
};
