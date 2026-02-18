import { useEffect } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { ReaderLoadingScreen } from "./components/ReaderLoadingScreen";
import { WebtoonReader } from "./components/WebtoonReader";
import { useReaderStore } from "@/services/reader";
import { getSourceChapterPages } from "@/services/source/core/runtime";
import { sourceQueryFactory } from "@/services/source/core/queryFactory";
import type { ReaderChapter, ReaderPage } from "@/services/reader";

export default function ReaderScreen() {
  const params = useLocalSearchParams<{
    sourceId?: string | string[];
    mangaId?: string | string[];
    chapterId?: string | string[];
    initialPage?: string | string[];
  }>();

  const sourceId = Array.isArray(params.sourceId) ? params.sourceId[0] : params.sourceId || "";
  const mangaId = Array.isArray(params.mangaId) ? params.mangaId[0] : params.mangaId || "";
  const chapterId = Array.isArray(params.chapterId) ? params.chapterId[0] : params.chapterId || "";
  const initialPage = Array.isArray(params.initialPage)
    ? parseInt(params.initialPage[0], 10)
    : parseInt(params.initialPage || "0", 10);

  const { setChapter, setCurrentPage, chapter } = useReaderStore();

  const chapterPagesQuery = useQuery({
    queryKey: sourceQueryFactory.chapterPages(sourceId, chapterId),
    queryFn: ({ signal }) => getSourceChapterPages(sourceId, chapterId, signal),
    staleTime: Infinity,
    enabled: Boolean(sourceId && chapterId),
  });

  useEffect(() => {
    if (chapterPagesQuery.data) {
      const pages: ReaderPage[] = chapterPagesQuery.data.map(
        (page, index) => ({
          index,
          pageId: `${chapterId}-${index}`,
          imageUrl: page.imageUrl,
          headers: page.headers,
          width: page.width,
          height: page.height,
          state: { status: "ready", imageUrl: page.imageUrl },
        })
      );

      const readerChapter: ReaderChapter = {
        id: chapterId,
        sourceId,
        mangaId,
        pages,
        state: { status: "loaded" },
      };

      setChapter(readerChapter);

      if (initialPage > 0) {
        setCurrentPage(initialPage);
      }
    }
  }, [chapterPagesQuery.data, chapterId, sourceId, mangaId, initialPage, setChapter, setCurrentPage]);

  if (chapterPagesQuery.isPending || !chapterPagesQuery.data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ReaderLoadingScreen />
      </>
    );
  }

  if (chapterPagesQuery.isError) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center bg-[#0F0F12]">
          <ReaderLoadingScreen
            chapterTitle={chapterPagesQuery.error?.message || "Failed to load chapter"}
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

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <WebtoonReader />
    </>
  );
}
