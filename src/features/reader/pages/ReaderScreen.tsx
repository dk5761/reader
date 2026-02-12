import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { appSettingsQueryOptions } from "@/features/settings/api";
import { useSource } from "@/services/source";
import { useReaderChapterFlow, useReaderProgressSync, useReaderSession } from "../hooks";
import { useReaderStore } from "../stores/useReaderStore";
import type {
  ReaderCurrentProgressPayload,
  ReaderPageMetrics,
} from "../types/reader.types";
import {
  ReaderBottomBar,
  ReaderHorizontalPager,
  ReaderTopBar,
  ReaderVerticalList,
} from "../components";
import { ActionPillButton, BackButton, CenteredLoadingState, CenteredState } from "@/shared/ui";
import { getDecodedParam } from "@/shared/utils";

export default function ReaderScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sources } = useSource();
  const [requestedFlatIndex, setRequestedFlatIndex] = useState<number | null>(null);
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
  const source = useMemo(
    () => sources.find((entry) => entry.id === sourceId) ?? null,
    [sourceId, sources]
  );

  const session = useReaderSession({
    sourceId: source ? sourceId : "",
    mangaId,
    chapterId,
    initialPageParam,
  });
  const settingsQuery = useQuery(appSettingsQueryOptions());
  const defaultReaderMode = settingsQuery.data?.defaultReaderMode ?? "vertical";

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
    isLoadingPreviousChapter,
    previousChapterError,
    showPreviousChapterPrompt,
    pendingPreviousChapter,
    hasViewedCurrentChapter,
    initializeSession,
    appendChapterPages,
    appendChapterPagesAtomic,
    appendPreviousChapterAtomic,
    setShowPreviousChapterPrompt,
    hidePreviousChapterPrompt,
    markChapterViewed,
    resetChapterViewState,
    pruneVerticalWindow,
    setCurrentFlatIndex,
    setCurrentHorizontalPosition,
    setCurrentPositionAtomic,
    setMode,
    toggleOverlay,
    hideOverlay,
    setIsLoadingNextChapter,
    setNextChapterError,
    setIsLoadingPreviousChapter,
    setPreviousChapterError,
    reset,
  } = useReaderStore();

  const readerSessionKey = `${sourceId}::${mangaId}::${chapterId}`;

  useEffect(() => {
    if (!source) {
      return;
    }

    if (!session.resolvedData) {
      return;
    }

    if (settingsQuery.isPending) {
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
      initialMode: defaultReaderMode,
    });
  }, [
    defaultReaderMode,
    initializeSession,
    readerSessionKey,
    session.resolvedData,
    sessionKey,
    settingsQuery.isPending,
    source,
  ]);

  useEffect(
    () => () => {
      reset();
    },
    [reset]
  );

  // Track chapter changes and reset view state when chapter changes
  const previousChapterIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentChapterId && previousChapterIdRef.current !== currentChapterId) {
      // Chapter changed, reset view state
      previousChapterIdRef.current = currentChapterId;
      // Only reset if this isn't the initial load
      if (sessionKey) {
        resetChapterViewState();
      }
    }
  }, [currentChapterId, sessionKey, resetChapterViewState]);

  useEffect(() => {
    if (mode !== "vertical" && requestedFlatIndex !== null) {
      setRequestedFlatIndex(null);
    }
  }, [mode, requestedFlatIndex]);

  useEffect(() => {
    if (mode !== "vertical") {
      return;
    }

    if (!currentChapterId) {
      return;
    }

    if (loadedChapters.length <= 2) {
      return;
    }

    if (requestedFlatIndex !== null) {
      setRequestedFlatIndex(null);
    }

    pruneVerticalWindow();
  }, [
    currentChapterId,
    loadedChapters.length,
    mode,
    pruneVerticalWindow,
    requestedFlatIndex,
  ]);

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

  const chapterFlow = useReaderChapterFlow({
    sourceId,
    chapters,
    currentChapterId,
    loadedChapterIdsInMemory: loadedChapters.map((entry) => entry.chapter.id),
    isLoadingNextChapter,
    isLoadingPreviousChapter,
    queryClient,
    onAppendChapter: appendChapterPages,
    setIsLoadingNextChapter,
    setNextChapterError,
    setIsLoadingPreviousChapter,
    setPreviousChapterError,
  });

  const handleHorizontalReachEnd = useCallback(async () => {
    if (!chapterFlow.nextChapter || !chapterFlow.canLoadNextChapter) {
      return;
    }

    const nextChapterId = chapterFlow.nextChapter.id;
    const loadedChapter = await chapterFlow.loadNextChapter();
    if (loadedChapter && loadedChapter.id === nextChapterId) {
      setCurrentHorizontalPosition(nextChapterId, 0);
    }
  }, [chapterFlow, setCurrentHorizontalPosition]);

  const handleVerticalNearEnd = useCallback(async () => {
    if (mode !== "vertical") {
      return;
    }

    const originChapterId = useReaderStore.getState().currentChapterId;
    if (!originChapterId) {
      return;
    }

    const loadedChapter = await chapterFlow.loadNextChapterAtomic(appendChapterPagesAtomic);
    if (!loadedChapter) {
      return;
    }

    // The atomic method already handles position update, just set requested index for sync
    const latestState = useReaderStore.getState();
    const targetFlatIndex = latestState.flatPages.findIndex(
      (entry) => entry.chapterId === loadedChapter.id && entry.pageIndex === 0
    );

    if (targetFlatIndex >= 0) {
      setRequestedFlatIndex(targetFlatIndex);
    }
  }, [chapterFlow, mode, appendChapterPagesAtomic, setRequestedFlatIndex]);

  const handleHorizontalReachStart = useCallback(async () => {
    if (!chapterFlow.previousChapter || !chapterFlow.canLoadPreviousChapter) {
      return;
    }

    const prevChapterId = chapterFlow.previousChapter.id;
    const loadedChapter = await chapterFlow.loadPreviousChapter();
    if (loadedChapter && loadedChapter.id === prevChapterId) {
      const latestState = useReaderStore.getState();
      const prevChapter = latestState.loadedChapters.find(
        (entry) => entry.chapter.id === prevChapterId
      );
      if (prevChapter) {
        setCurrentHorizontalPosition(prevChapterId, prevChapter.pages.length - 1);
      }
    }
  }, [chapterFlow, setCurrentHorizontalPosition]);

  const handleVerticalNearStart = useCallback(async () => {
    if (mode !== "vertical") {
      return;
    }

    const originChapterId = useReaderStore.getState().currentChapterId;
    if (!originChapterId) {
      return;
    }

    // If prompt is already showing, load the chapter
    if (showPreviousChapterPrompt && pendingPreviousChapter) {
      // User has scrolled down to confirm, load the chapter
      const loadedChapter = await chapterFlow.loadPreviousChapterAtomic(appendPreviousChapterAtomic);
      if (loadedChapter) {
        // Hide the prompt after loading
        hidePreviousChapterPrompt();

        // Reset view state for new chapter
        resetChapterViewState();

        // Set requested index for sync
        const latestState = useReaderStore.getState();
        const targetFlatIndex = latestState.flatPages.findIndex(
          (entry) => entry.chapterId === loadedChapter.id
        );
        if (targetFlatIndex >= 0) {
          setRequestedFlatIndex(targetFlatIndex);
        }
      }
      return;
    }

    // Check if previous chapter exists
    if (!chapterFlow.previousChapter) {
      return;
    }

    // Check if already loaded
    if (loadedChapters.some((entry) => entry.chapter.id === chapterFlow.previousChapter?.id)) {
      // Already loaded, no need to show prompt
      return;
    }

    // Only show prompt if user has viewed some content in current chapter
    // This prevents showing prompt on initial load when user hasn't read yet
    if (!hasViewedCurrentChapter) {
      return;
    }

    // Show prompt instead of auto-loading
    setShowPreviousChapterPrompt(chapterFlow.previousChapter);
  }, [
    mode,
    showPreviousChapterPrompt,
    pendingPreviousChapter,
    hasViewedCurrentChapter,
    chapterFlow.previousChapter,
    loadedChapters,
    setShowPreviousChapterPrompt,
    hidePreviousChapterPrompt,
    resetChapterViewState,
    chapterFlow,
    appendPreviousChapterAtomic,
    setRequestedFlatIndex,
  ]);

  // Handle scrolling down after prompt is shown - this loads the previous chapter
  const handleVisibleIndexChange = useCallback(
    (index: number) => {
      // If prompt is showing and user scrolls down (index increases), load the chapter
      if (showPreviousChapterPrompt && pendingPreviousChapter && index > 0) {
        // Clear the prompt and let the nearStart handler deal with loading
        hidePreviousChapterPrompt();
        // Trigger near start which will now load the chapter
        setTimeout(() => {
          void handleVerticalNearStart();
        }, 100);
      }
    },
    [showPreviousChapterPrompt, pendingPreviousChapter, hidePreviousChapterPrompt, handleVerticalNearStart]
  );

  const handleVisibleIndexChangeWithState = useCallback(
    (index: number) => {
      setCurrentFlatIndex(index);
      // Track that user has viewed this page
      const currentPage = flatPages[index];
      if (currentPage) {
        markChapterViewed(currentPage.pageIndex);
      }
      handleVisibleIndexChange(index);
      if (requestedFlatIndex !== null && index === requestedFlatIndex) {
        setRequestedFlatIndex(null);
      }
    },
    [setCurrentFlatIndex, handleVisibleIndexChange, requestedFlatIndex, setRequestedFlatIndex, flatPages, markChapterViewed]
  );

  const pageMetrics = useMemo<ReaderPageMetrics>(() => {
    if (mode === "vertical") {
      if (!currentFlatPage) {
        return {
          currentPage: 0,
          totalPages: 0,
          chapterId: currentChapterId,
        };
      }

      return {
        currentPage: currentFlatPage.pageIndex,
        totalPages: currentFlatPage.totalPagesInChapter,
        chapterId: currentFlatPage.chapterId,
      };
    }

    if (!currentLoadedChapter) {
      return {
        currentPage: 0,
        totalPages: 0,
        chapterId: currentChapterId,
      };
    }

    return {
      currentPage: currentPageIndex,
      totalPages: currentLoadedChapter.pages.length,
      chapterId: currentLoadedChapter.chapter.id,
    };
  }, [currentChapterId, currentFlatPage, currentLoadedChapter, currentPageIndex, mode]);

  const handleSeekPage = useCallback(
    (targetPageIndex: number) => {
      const activeChapterId = pageMetrics.chapterId;
      if (!activeChapterId) {
        return;
      }

      if (mode === "vertical") {
        if (targetPageIndex < 0 || targetPageIndex >= pageMetrics.totalPages) {
          return;
        }

        const targetFlatIndex = flatPages.findIndex(
          (entry) =>
            entry.chapterId === activeChapterId && entry.pageIndex === targetPageIndex
        );

        if (targetFlatIndex >= 0) {
          setCurrentFlatIndex(targetFlatIndex);
          setRequestedFlatIndex(targetFlatIndex);
        }
        return;
      }

      setCurrentHorizontalPosition(activeChapterId, targetPageIndex);
    },
    [
      flatPages,
      mode,
      pageMetrics.chapterId,
      pageMetrics.totalPages,
      setCurrentFlatIndex,
      setCurrentHorizontalPosition,
    ]
  );

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

  if (!source) {
    return (
      <CenteredState
        title="Reader Not Available"
        message="This source is unavailable. It may be hidden by your 18+ source setting."
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
        <>
          <ReaderVerticalList
            pages={flatPages}
            initialFlatIndex={currentFlatIndex}
            requestedFlatIndex={requestedFlatIndex}
            onVisibleFlatIndexChange={handleVisibleIndexChangeWithState}
            onNearEnd={() => {
              void handleVerticalNearEnd();
            }}
            onNearStart={() => {
              void handleVerticalNearStart();
            }}
            onTapPage={toggleOverlay}
            onScrollBeginDrag={hideOverlay}
          />
          {/* Previous Chapter Prompt */}
          {showPreviousChapterPrompt && pendingPreviousChapter && (
            <View className="absolute bottom-24 left-4 right-4 items-center">
              <View className="w-full max-w-sm items-center rounded-xl bg-black/80 p-4">
                <Text className="text-base font-medium text-white">
                  Previous chapter available
                </Text>
                <Text className="mt-1 text-sm text-gray-300">
                  {pendingPreviousChapter.title || `Chapter ${pendingPreviousChapter.number}`}
                </Text>
                <Text className="mt-2 text-xs text-gray-400">
                  Scroll down to load
                </Text>
              </View>
            </View>
          )}
        </>
      ) : currentLoadedChapter ? (
        <ReaderHorizontalPager
          chapterId={currentLoadedChapter.chapter.id}
          pages={currentLoadedChapter.pages}
          currentPageIndex={currentPageIndex}
          onPageSelected={(pageIndex) => {
            setCurrentHorizontalPosition(currentLoadedChapter.chapter.id, pageIndex);
          }}
          onReachEnd={() => {
            void handleHorizontalReachEnd();
          }}
          onReachStart={() => {
            void handleHorizontalReachStart();
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
        currentPage={pageMetrics.currentPage}
        totalPages={pageMetrics.totalPages}
        onSeekPage={handleSeekPage}
        nextChapterError={nextChapterError}
        previousChapterError={previousChapterError}
        onRetryNextChapter={() => {
          void chapterFlow.loadNextChapter();
        }}
        onRetryPreviousChapter={() => {
          void chapterFlow.loadPreviousChapter();
        }}
      />

      {isLoadingNextChapter ? (
        <View className="absolute bottom-28 self-center rounded-full bg-black/70 p-3">
          <ActivityIndicator color="#67A4FF" />
        </View>
      ) : null}

      {isLoadingPreviousChapter ? (
        <View className="absolute bottom-40 self-center rounded-full bg-black/70 p-3">
          <ActivityIndicator color="#67A4FF" />
        </View>
      ) : null}
    </View>
  );
}
