import { useCallback, useMemo } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { SourceChapter } from "@/services/source";
import { prefetchReaderChapterPages } from "../api/reader.queries";

interface UseReaderChapterFlowParams {
  sourceId: string;
  chapters: SourceChapter[];
  currentChapterId: string | null;
  loadedChapterIdsInMemory: string[];
  isLoadingNextChapter: boolean;
  isLoadingPreviousChapter: boolean;
  queryClient: QueryClient;
  onAppendChapter: (chapter: SourceChapter, pages: Awaited<ReturnType<typeof prefetchReaderChapterPages>>) => void;
  setIsLoadingNextChapter: (isLoading: boolean) => void;
  setNextChapterError: (error: string | null) => void;
  setIsLoadingPreviousChapter: (isLoading: boolean) => void;
  setPreviousChapterError: (error: string | null) => void;
}

const resolveNextChapter = (
  chapters: SourceChapter[],
  currentChapterId: string
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
          chapter.number !== undefined &&
          Number.isFinite(chapter.number) &&
          chapter.number > current.number!
      )
      .sort((first, second) => (first.number ?? 0) - (second.number ?? 0))[0];

    if (nextByNumber) {
      return nextByNumber;
    }

    // For numeric chapter flows, reaching here means there is no higher chapter.
    // Do not fallback by array index, because many sources return chapters in
    // descending order (latest -> oldest), which would incorrectly move backward.
    return null;
  }

  for (let index = currentIndex + 1; index < chapters.length; index += 1) {
    const candidate = chapters[index];
    if (candidate.id !== current.id) {
      return candidate;
    }
  }

  return null;
};

const resolvePreviousChapter = (
  chapters: SourceChapter[],
  currentChapterId: string
): SourceChapter | null => {
  const currentIndex = chapters.findIndex((chapter) => chapter.id === currentChapterId);
  if (currentIndex < 0) {
    return null;
  }

  const current = chapters[currentIndex];
  if (current.number !== undefined && Number.isFinite(current.number)) {
    const previousByNumber = chapters
      .filter(
        (chapter) =>
          chapter.id !== current.id &&
          chapter.number !== undefined &&
          Number.isFinite(chapter.number) &&
          chapter.number < current.number!
      )
      .sort((first, second) => (second.number ?? 0) - (first.number ?? 0))[0];

    if (previousByNumber) {
      return previousByNumber;
    }

    // For numeric chapter flows, reaching here means there is no lower chapter.
    // Do not fallback by array index, because many sources return chapters in
    // descending order (latest -> oldest), which would incorrectly move forward.
    return null;
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = chapters[index];
    if (candidate.id !== current.id) {
      return candidate;
    }
  }

  return null;
};

export const useReaderChapterFlow = ({
  sourceId,
  chapters,
  currentChapterId,
  loadedChapterIdsInMemory,
  isLoadingNextChapter,
  isLoadingPreviousChapter,
  queryClient,
  onAppendChapter,
  setIsLoadingNextChapter,
  setNextChapterError,
  setIsLoadingPreviousChapter,
  setPreviousChapterError,
}: UseReaderChapterFlowParams) => {
  const nextChapter = useMemo(() => {
    if (!currentChapterId) {
      return null;
    }

    return resolveNextChapter(chapters, currentChapterId);
  }, [chapters, currentChapterId]);

  const previousChapter = useMemo(() => {
    if (!currentChapterId) {
      return null;
    }

    return resolvePreviousChapter(chapters, currentChapterId);
  }, [chapters, currentChapterId]);

  const canLoadNextChapter = Boolean(
    nextChapter &&
      sourceId &&
      !isLoadingNextChapter &&
      !loadedChapterIdsInMemory.includes(nextChapter.id)
  );

  const canLoadPreviousChapter = Boolean(
    previousChapter &&
      sourceId &&
      !isLoadingPreviousChapter &&
      !loadedChapterIdsInMemory.includes(previousChapter.id)
  );

  const loadNextChapter = useCallback(async () => {
    if (!nextChapter || !sourceId || isLoadingNextChapter) {
      return null;
    }

    if (loadedChapterIdsInMemory.includes(nextChapter.id)) {
      return null;
    }

    try {
      setIsLoadingNextChapter(true);
      setNextChapterError(null);
      const pages = await prefetchReaderChapterPages(queryClient, sourceId, nextChapter.id);
      onAppendChapter(nextChapter, pages);
      return nextChapter;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load the next chapter.";
      setNextChapterError(message);
      return null;
    } finally {
      setIsLoadingNextChapter(false);
    }
  }, [
    isLoadingNextChapter,
    loadedChapterIdsInMemory,
    nextChapter,
    onAppendChapter,
    queryClient,
    setIsLoadingNextChapter,
    setNextChapterError,
    sourceId,
  ]);

  const loadPreviousChapter = useCallback(async () => {
    if (!previousChapter || !sourceId || isLoadingPreviousChapter) {
      return null;
    }

    if (loadedChapterIdsInMemory.includes(previousChapter.id)) {
      return null;
    }

    try {
      setIsLoadingPreviousChapter(true);
      setPreviousChapterError(null);
      const pages = await prefetchReaderChapterPages(queryClient, sourceId, previousChapter.id);
      onAppendChapter(previousChapter, pages);
      return previousChapter;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load the previous chapter.";
      setPreviousChapterError(message);
      return null;
    } finally {
      setIsLoadingPreviousChapter(false);
    }
  }, [
    isLoadingPreviousChapter,
    loadedChapterIdsInMemory,
    previousChapter,
    onAppendChapter,
    queryClient,
    setIsLoadingPreviousChapter,
    setPreviousChapterError,
    sourceId,
  ]);

  return {
    nextChapter,
    previousChapter,
    canLoadNextChapter,
    canLoadPreviousChapter,
    loadNextChapter,
    loadPreviousChapter,
  };
};
