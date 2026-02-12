import type { SourceChapter, SourcePage } from "@/services/source";
import type { ReaderFlatPage, ReaderLoadedChapter } from "../types/reader.types";

/**
 * Maximum number of chapters to keep in memory for vertical scroll mode.
 * This prevents unbounded memory growth when reading long series.
 */
export const MAX_VERTICAL_CHAPTERS_IN_MEMORY = 2;

/**
 * Gets the display title for a chapter, falling back to "Chapter X" if no title is set.
 */
export const getChapterDisplayTitle = (chapter: SourceChapter): string =>
  chapter.title || (chapter.number !== undefined ? `Chapter ${chapter.number}` : "Chapter");

/**
 * Flattens loaded chapters into a single array of flat pages.
 * This creates a linear representation of all pages across all loaded chapters.
 */
export const flattenLoadedChapters = (loadedChapters: ReaderLoadedChapter[]): ReaderFlatPage[] => {
  const pages: ReaderFlatPage[] = [];

  loadedChapters.forEach((loadedChapter, chapterIndex) => {
    const totalPagesInChapter = loadedChapter.pages.length;
    loadedChapter.pages.forEach((page, pageIndex) => {
      pages.push({
        key: `${loadedChapter.chapter.id}::${page.index}::${page.imageUrl}`,
        flatIndex: pages.length,
        chapterId: loadedChapter.chapter.id,
        chapterTitle: getChapterDisplayTitle(loadedChapter.chapter),
        chapterNumber: loadedChapter.chapter.number,
        chapterIndex,
        pageIndex,
        totalPagesInChapter,
        imageUrl: page.imageUrl,
        headers: page.headers,
      });
    });
  });

  return pages;
};

/**
 * Finds the index of an existing chapter in the loaded chapters array.
 * @returns The index of the chapter, or -1 if not found
 */
export const findExistingChapterIndex = (
  loadedChapters: ReaderLoadedChapter[],
  chapterId: string
): number => {
  return loadedChapters.findIndex((loaded) => loaded.chapter.id === chapterId);
};

/**
 * Checks if the chapter pages have actually changed.
 */
export const hasPagesChanged = (
  existingPages: SourcePage[],
  newPages: SourcePage[]
): boolean => {
  if (existingPages.length !== newPages.length) {
    return true;
  }

  return existingPages.some(
    (page, index) =>
      page.index !== newPages[index]?.index || page.imageUrl !== newPages[index]?.imageUrl
  );
};

/**
 * Calculates the remapped flat index after chapters have been updated.
 * This ensures the user stays on the same page after chapter loading.
 */
export const calculateRemappedFlatIndex = (
  flatPages: ReaderFlatPage[],
  currentFlatIndex: number,
  targetChapterId: string,
  targetPageIndex: number
): number => {
  const currentEntry = flatPages[currentFlatIndex];
  if (!currentEntry) {
    return Math.min(currentFlatIndex, Math.max(0, flatPages.length - 1));
  }

  const remappedIndex = flatPages.findIndex(
    (entry) =>
      entry.chapterId === targetChapterId && entry.pageIndex === targetPageIndex
  );

  if (remappedIndex >= 0) {
    return remappedIndex;
  }

  return Math.min(currentFlatIndex, Math.max(0, flatPages.length - 1));
};

/**
 * Determines which chapters to keep when pruning in vertical mode.
 * Keeps the active chapter and surrounding chapters up to the max limit.
 */
export const calculateKeptChapters = (
  loadedChapters: ReaderLoadedChapter[],
  activeChapterId: string | null,
  maxChapters: number
): ReaderLoadedChapter[] => {
  if (loadedChapters.length <= maxChapters) {
    return loadedChapters;
  }

  const activeIndex = activeChapterId
    ? loadedChapters.findIndex((entry) => entry.chapter.id === activeChapterId)
    : -1;

  // If we can't find the active chapter, keep the most recent chapters
  if (activeIndex < 0) {
    return loadedChapters.slice(-maxChapters);
  }

  const hasLoadedNextChapter = activeIndex < loadedChapters.length - 1;

  // Don't prune if we're not on the latest loaded chapter yet
  // Pruning here would remove items above the viewport and cause scroll jumps
  if (hasLoadedNextChapter) {
    return loadedChapters;
  }

  // Keep the active chapter and the chapters before it
  const startIndex = Math.max(0, activeIndex - (maxChapters - 1));
  let keptChapters = loadedChapters.slice(startIndex, activeIndex + 1);

  // Ensure we don't exceed the max
  if (keptChapters.length > maxChapters) {
    keptChapters = keptChapters.slice(-maxChapters);
  }

  return keptChapters;
};

/**
 * Calculates the new flat index after pruning chapters.
 * Prioritizes staying on the current chapter, then falls back to the current position.
 */
export const calculatePrunedFlatIndex = (
  flatPages: ReaderFlatPage[],
  currentFlatIndex: number,
  currentChapterId: string | null,
  currentPageIndex: number
): number => {
  if (flatPages.length === 0) {
    return 0;
  }

  // First try to find the exact position we're currently on
  const preferredFlatIndex = flatPages.findIndex(
    (entry) => entry.chapterId === currentChapterId && entry.pageIndex === currentPageIndex
  );

  if (preferredFlatIndex >= 0) {
    return preferredFlatIndex;
  }

  // Fall back to the current index, clamped to valid range
  return Math.max(0, Math.min(currentFlatIndex, flatPages.length - 1));
};
