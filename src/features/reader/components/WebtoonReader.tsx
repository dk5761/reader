import { useRef, useEffect, useCallback } from "react";
import { FlatList, StyleSheet, ViewToken } from "react-native";
import { ReaderPageComponent } from "./ReaderPage";
import { useReaderStore } from "@/services/reader";
import type { ReaderPage as ReaderPageType } from "@/services/reader";

export function WebtoonReader() {
  const { chapter, currentPageIndex, setCurrentPage } = useReaderStore();
  const flatListRef = useRef<FlatList<ReaderPageType>>(null);
  const isInitialScrollDone = useRef(false);

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
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [chapter, currentPageIndex]);

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
        }
      }
    },
    [setCurrentPage]
  );

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  if (!chapter) {
    return null;
  }

  return (
    <FlatList
      ref={flatListRef}
      data={chapter.pages}
      keyExtractor={(item) => item.pageId}
      renderItem={({ item }) => <ReaderPageComponent page={item} />}
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      onScrollToIndexFailed={onScrollToIndexFailed}
      initialNumToRender={3}
      maxToRenderPerBatch={5}
      windowSize={10}
      removeClippedSubviews={true}
      style={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F12",
  },
});
