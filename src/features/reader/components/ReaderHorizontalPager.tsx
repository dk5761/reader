import PagerView from "react-native-pager-view";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import type { SourcePage } from "@/services/source";

interface ReaderHorizontalPagerProps {
  chapterId: string;
  pages: SourcePage[];
  currentPageIndex: number;
  onPageSelected: (pageIndex: number) => void;
  onReachEnd: () => void;
  onTapPage: () => void;
  onPageScrollStateChanged?: (state: "idle" | "dragging" | "settling") => void;
}

export const ReaderHorizontalPager = ({
  chapterId,
  pages,
  currentPageIndex,
  onPageSelected,
  onReachEnd,
  onTapPage,
  onPageScrollStateChanged,
}: ReaderHorizontalPagerProps) => {
  const pagerRef = useRef<PagerView | null>(null);

  const safeCurrentPage = useMemo(
    () =>
      Math.max(
        0,
        Math.min(currentPageIndex, Math.max(0, pages.length - 1))
      ),
    [currentPageIndex, pages.length]
  );

  const selectedPageRef = useRef(safeCurrentPage);

  useEffect(() => {
    selectedPageRef.current = safeCurrentPage;
  }, [safeCurrentPage, chapterId]);

  useEffect(() => {
    if (selectedPageRef.current === safeCurrentPage) {
      return;
    }

    selectedPageRef.current = safeCurrentPage;
    pagerRef.current?.setPageWithoutAnimation(safeCurrentPage);
  }, [safeCurrentPage]);

  const safeInitialPage = Math.max(
    0,
    Math.min(safeCurrentPage, Math.max(0, pages.length - 1))
  );

  const handlePageSelected = useCallback(
    (index: number) => {
      selectedPageRef.current = index;
      onPageSelected(index);
      if (index >= pages.length - 1) {
        onReachEnd();
      }
    },
    [onPageSelected, onReachEnd, pages.length]
  );

  return (
    <PagerView
      ref={pagerRef}
      key={chapterId}
      style={{ flex: 1, backgroundColor: "#000000" }}
      initialPage={safeInitialPage}
      layoutDirection="rtl"
      overScrollMode="never"
      offscreenPageLimit={1}
      onPageSelected={(event) => {
        handlePageSelected(event.nativeEvent.position);
      }}
      onPageScrollStateChanged={(event) => {
        onPageScrollStateChanged?.(event.nativeEvent.pageScrollState);
      }}
    >
      {pages.map((page, index) => (
        <Pressable key={`${chapterId}::${index}`} onPress={onTapPage} className="flex-1">
          <View className="flex-1 items-center justify-center bg-black">
            <Image
              source={{ uri: page.imageUrl, headers: page.headers }}
              contentFit="contain"
              transition={120}
              style={{ width: "100%", height: "100%" }}
            />
          </View>
        </Pressable>
      ))}
    </PagerView>
  );
};
