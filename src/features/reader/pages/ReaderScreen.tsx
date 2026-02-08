import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useReaderChapterFlow, useReaderProgressSync, useReaderSession } from "../hooks";
import { useReaderStore } from "../stores/useReaderStore";
import type { ReaderCurrentProgressPayload } from "../types/reader.types";
import {
  ReaderBottomBar,
  ReaderHorizontalPager,
  ReaderTopBar,
  ReaderVerticalList,
} from "../components";
import { ActionPillButton, BackButton, CenteredLoadingState, CenteredState } from "@/shared/ui";

const getDecodedParam = (value: string | string[] | undefined): string => {
  const param = Array.isArray(value) ? value[0] : value;
  if (!param) {
    return "";
  }

  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
};

export default function ReaderScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    sourceId?: string | string[];
    mangaId?: string | string[];
    chapterId?: string | string[];
    initialPage?: string | string[];
  }>();

  const sourceId = getDecodedParam(params.sourceId);
  const mangaId = getDecodedParam(params.mangaId);
  const chapterId = getDecodedParam(params.chapterId);
  const initialPageParam = getDecodedParam(params.initialPage) || undefined;

  const session = useReaderSession({
    sourceId,
    mangaId,
    chapterId,
    initialPageParam,
  });

  const {
    mode,
    sessionKey,
    meta,
    chapters,
    loadedChapters,
    flatPages,
    currentFlatIndex,
    currentChapterId,
    currentPageIndex,
    isOverlayVisible,
    isLoadingNextChapter,
    nextChapterError,
    initializeSession,
    appendChapterPages,
    setCurrentFlatIndex,
    setCurrentHorizontalPosition,
    setMode,
    toggleOverlay,
    hideOverlay,
    setIsLoadingNextChapter,
    setNextChapterError,
    reset,
  } = useReaderStore();

  const readerSessionKey = `${sourceId}::${mangaId}::${chapterId}`;

  useEffect(() => {
    if (!session.resolvedData) {
      return;
    }

    if (sessionKey === readerSessionKey) {
      return;
    }

    initializeSession({
      sessionKey: readerSessionKey,
      meta: session.resolvedData.meta,
      chapters: session.resolvedData.chapters,
      initialChapter: session.resolvedData.initialChapter,
      initialPages: session.resolvedData.initialPages,
      initialPageIndex: session.resolvedData.initialPage,
    });
  }, [initializeSession, readerSessionKey, session.resolvedData, sessionKey]);

  useEffect(
    () => () => {
      reset();
    },
    [reset]
  );

  const currentFlatPage = flatPages[currentFlatIndex] ?? null;
  const currentLoadedChapter =
    loadedChapters.find((entry) => entry.chapter.id === currentChapterId) ?? null;
  const currentHorizontalPage =
    currentLoadedChapter?.pages[currentPageIndex] ?? null;

  const progressPayload = useMemo<ReaderCurrentProgressPayload | null>(() => {
    if (!meta || !currentChapterId) {
      return null;
    }

    if (mode === "vertical") {
      if (!currentFlatPage) {
        return null;
      }

      return {
        sourceId: meta.sourceId,
        mangaId: meta.mangaId,
        chapterId: currentFlatPage.chapterId,
        chapterTitle: currentFlatPage.chapterTitle,
        chapterNumber: currentFlatPage.chapterNumber,
        mangaTitle: meta.mangaTitle,
        mangaThumbnailUrl: meta.mangaThumbnailUrl,
        pageIndex: currentFlatPage.pageIndex,
        totalPages: currentFlatPage.totalPagesInChapter,
      };
    }

    if (!currentLoadedChapter || !currentHorizontalPage) {
      return null;
    }

    return {
      sourceId: meta.sourceId,
      mangaId: meta.mangaId,
      chapterId: currentLoadedChapter.chapter.id,
      chapterTitle:
        currentLoadedChapter.chapter.title ||
        (currentLoadedChapter.chapter.number !== undefined
          ? `Chapter ${currentLoadedChapter.chapter.number}`
          : undefined),
      chapterNumber: currentLoadedChapter.chapter.number,
      mangaTitle: meta.mangaTitle,
      mangaThumbnailUrl: meta.mangaThumbnailUrl,
      pageIndex: currentPageIndex,
      totalPages: currentLoadedChapter.pages.length,
    };
  }, [
    currentChapterId,
    currentFlatPage,
    currentHorizontalPage,
    currentLoadedChapter,
    currentPageIndex,
    meta,
    mode,
  ]);

  useReaderProgressSync({
    payload: progressPayload,
    enabled: Boolean(meta),
  });

  const loadedChapterIds = useMemo(
    () => loadedChapters.map((entry) => entry.chapter.id),
    [loadedChapters]
  );

  const chapterFlow = useReaderChapterFlow({
    sourceId,
    chapters,
    currentChapterId,
    loadedChapterIds,
    isLoadingNextChapter,
    queryClient,
    onAppendChapter: appendChapterPages,
    setIsLoadingNextChapter,
    setNextChapterError,
  });

  const handleHorizontalReachEnd = useCallback(async () => {
    if (!chapterFlow.nextChapter || !chapterFlow.canLoadNextChapter) {
      return;
    }

    const nextChapterId = chapterFlow.nextChapter.id;
    const didLoad = await chapterFlow.loadNextChapter();
    if (didLoad) {
      setCurrentHorizontalPosition(nextChapterId, 0);
    }
  }, [chapterFlow, setCurrentHorizontalPosition]);

  const pageLabel = useMemo(() => {
    if (mode === "vertical") {
      if (!currentFlatPage) {
        return "Page 0 / 0";
      }

      return `Page ${currentFlatPage.pageIndex + 1} / ${currentFlatPage.totalPagesInChapter}`;
    }

    if (!currentLoadedChapter) {
      return "Page 0 / 0";
    }

    return `Page ${currentPageIndex + 1} / ${currentLoadedChapter.pages.length}`;
  }, [currentFlatPage, currentLoadedChapter, currentPageIndex, mode]);

  const chapterTitle = useMemo(() => {
    if (mode === "vertical") {
      if (!currentFlatPage) {
        return "";
      }
      return currentFlatPage.chapterTitle;
    }

    if (!currentLoadedChapter) {
      return "";
    }

    return (
      currentLoadedChapter.chapter.title ||
      (currentLoadedChapter.chapter.number !== undefined
        ? `Chapter ${currentLoadedChapter.chapter.number}`
        : "")
    );
  }, [currentFlatPage, currentLoadedChapter, mode]);

  if (!sourceId || !mangaId || !chapterId) {
    return (
      <CenteredState
        title="Reader Not Available"
        message="Missing source, manga, or chapter identifier."
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="mt-2">
          <BackButton onPress={() => router.back()} variant="pill" />
        </View>
      </CenteredState>
    );
  }

  if (session.isPending && flatPages.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CenteredLoadingState message="Loading chapter..." />
      </>
    );
  }

  if (session.error && flatPages.length === 0) {
    return (
      <CenteredState
        title="Could not load reader"
        message={session.error.message}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="mt-4 flex-row gap-2">
          <ActionPillButton
            label="Retry"
            onPress={() => {
              void Promise.all([
                session.mangaQuery.refetch(),
                session.chaptersQuery.refetch(),
                session.chapterPagesQuery.refetch(),
              ]);
            }}
          />
          <BackButton onPress={() => router.back()} variant="pill" />
        </View>
      </CenteredState>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" hidden={!isOverlayVisible} />

      {mode === "vertical" ? (
        <ReaderVerticalList
          pages={flatPages}
          initialFlatIndex={currentFlatIndex}
          onVisibleFlatIndexChange={(index) => {
            setCurrentFlatIndex(index);
          }}
          onNearEnd={() => {
            void chapterFlow.loadNextChapter();
          }}
          onTapPage={toggleOverlay}
          onScrollBeginDrag={hideOverlay}
        />
      ) : currentLoadedChapter ? (
        <ReaderHorizontalPager
          chapterId={currentLoadedChapter.chapter.id}
          pages={currentLoadedChapter.pages}
          initialPageIndex={currentPageIndex}
          onPageSelected={(pageIndex) => {
            setCurrentHorizontalPosition(currentLoadedChapter.chapter.id, pageIndex);
          }}
          onReachEnd={() => {
            void handleHorizontalReachEnd();
          }}
          onTapPage={toggleOverlay}
          onPageScrollStateChanged={(state) => {
            if (state === "dragging") {
              hideOverlay();
            }
          }}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#67A4FF" />
          <Text className="mt-3 text-sm text-[#9B9CA6]">Loading chapter pages...</Text>
        </View>
      )}

      <ReaderTopBar
        visible={isOverlayVisible}
        mangaTitle={meta?.mangaTitle ?? session.resolvedData?.manga.title ?? ""}
        chapterTitle={chapterTitle}
      />
      <ReaderBottomBar
        visible={isOverlayVisible}
        mode={mode}
        onModeChange={setMode}
        pageLabel={pageLabel}
        nextChapterError={nextChapterError}
        onRetryNextChapter={() => {
          void chapterFlow.loadNextChapter();
        }}
      />

      {isLoadingNextChapter ? (
        <View className="absolute bottom-28 self-center rounded-full bg-black/70 p-3">
          <ActivityIndicator color="#67A4FF" />
        </View>
      ) : null}
    </View>
  );
}
