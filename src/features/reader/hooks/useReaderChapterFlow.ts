import { useCallback, useMemo } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { SourceChapter } from "@/services/source";
import { prefetchReaderChapterPages } from "../api/reader.queries";

interface UseReaderChapterFlowParams {
  sourceId: string;
  chapters: SourceChapter[];
  currentChapterId: string | null;
  loadedChapterIdsSet: string[];
  isLoadingNextChapter: boolean;
  queryClient: QueryClient;
  onAppendChapter: (chapter: SourceChapter, pages: Awaited<ReturnType<typeof prefetchReaderChapterPages>>) => void;
  setIsLoadingNextChapter: (isLoading: boolean) => void;
  setNextChapterError: (error: string | null) => void;
}

const resolveNextChapter = (
  chapters: SourceChapter[],
  currentChapterId: string,
  loadedChapterIdsSet: string[]
): SourceChapter | null => {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === currentChapterId);
  if (currentIndex < 0) {
    return null;
  }

  const current = chapters[currentIndex];
  if (current.number !== undefined && Number.isFinite(current.number)) {
    const nextByNumber = chapters
      .filter(
        (chapter) =>
          chapter.id !== current.id &&
          !loadedChapterIdsSet.includes(chapter.id) &&
          chapter.number !== undefined &&
          Number.isFinite(chapter.number) &&
          chapter.number > current.number!
      )
      .sort((first, second) => (first.number ?? 0) - (second.number ?? 0))[0];

    if (nextByNumber) {
      return nextByNumber;
    }
  }

  for (let index = currentIndex + 1; index < chapters.length; index += 1) {
    const candidate = chapters[index];
    if (!loadedChapterIdsSet.includes(candidate.id)) {
      return candidate;
    }
  }

  return null;
};

export const useReaderChapterFlow = ({
  sourceId,
  chapters,
  currentChapterId,
  loadedChapterIdsSet,
  isLoadingNextChapter,
  queryClient,
  onAppendChapter,
  setIsLoadingNextChapter,
  setNextChapterError,
}: UseReaderChapterFlowParams) => {
  const nextChapter = useMemo(() => {
    if (!currentChapterId) {
      return null;
    }

    return resolveNextChapter(chapters, currentChapterId, loadedChapterIdsSet);
  }, [chapters, currentChapterId, loadedChapterIdsSet]);

  const canLoadNextChapter = Boolean(
    nextChapter &&
      sourceId &&
      !isLoadingNextChapter &&
      !loadedChapterIdsSet.includes(nextChapter.id)
  );

  const loadNextChapter = useCallback(async () => {
    if (!nextChapter || !sourceId || isLoadingNextChapter) {
      return false;
    }

    if (loadedChapterIdsSet.includes(nextChapter.id)) {
      return false;
    }

    try {
      setIsLoadingNextChapter(true);
      setNextChapterError(null);
      const pages = await prefetchReaderChapterPages(queryClient, sourceId, nextChapter.id);
      onAppendChapter(nextChapter, pages);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load the next chapter.";
      setNextChapterError(message);
      return false;
    } finally {
      setIsLoadingNextChapter(false);
    }
  }, [
    isLoadingNextChapter,
    loadedChapterIdsSet,
    nextChapter,
    onAppendChapter,
    queryClient,
    setIsLoadingNextChapter,
    setNextChapterError,
    sourceId,
  ]);

  return {
    nextChapter,
    canLoadNextChapter,
    loadNextChapter,
  };
};
