import { useCallback, useMemo } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { SourceChapter } from "@/services/source";
import { prefetchReaderChapterPages } from "../api/reader.queries";

interface UseReaderChapterFlowParams {
  sourceId: string;
  chapters: SourceChapter[];
  currentChapterId: string | null;
  loadedChapterIds: string[];
  isLoadingNextChapter: boolean;
  queryClient: QueryClient;
  onAppendChapter: (chapter: SourceChapter, pages: Awaited<ReturnType<typeof prefetchReaderChapterPages>>) => void;
  setIsLoadingNextChapter: (isLoading: boolean) => void;
  setNextChapterError: (error: string | null) => void;
}

const resolveNextChapter = (
  chapters: SourceChapter[],
  currentChapterId: string,
  loadedChapterIds: string[]
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
          !loadedChapterIds.includes(chapter.id) &&
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
    if (!loadedChapterIds.includes(candidate.id)) {
      return candidate;
    }
  }

  return null;
};

export const useReaderChapterFlow = ({
  sourceId,
  chapters,
  currentChapterId,
  loadedChapterIds,
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

    return resolveNextChapter(chapters, currentChapterId, loadedChapterIds);
  }, [chapters, currentChapterId, loadedChapterIds]);

  const canLoadNextChapter = Boolean(
    nextChapter &&
      sourceId &&
      !isLoadingNextChapter &&
      !loadedChapterIds.includes(nextChapter.id)
  );

  const loadNextChapter = useCallback(async () => {
    if (!nextChapter || !sourceId || isLoadingNextChapter) {
      return false;
    }

    if (loadedChapterIds.includes(nextChapter.id)) {
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
    loadedChapterIds,
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
