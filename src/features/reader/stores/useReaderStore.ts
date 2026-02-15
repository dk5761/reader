import { create } from "zustand";
import type { SourceChapter, SourcePage } from "@/services/source";
import type {
  ReaderFlatPage,
  ReaderLoadedChapter,
  ReaderMode,
  ReaderSessionMeta,
} from "../types/reader.types";
import {
  MAX_VERTICAL_CHAPTERS_IN_MEMORY,
  flattenLoadedChapters,
  findExistingChapterIndex,
  hasPagesChanged,
  calculateRemappedFlatIndex,
  calculateKeptChapters,
  calculatePrunedFlatIndex,
} from "../utils/readerStoreUtils";

interface InitializeReaderSessionInput {
  sessionKey: string;
  meta: ReaderSessionMeta;
  chapters: SourceChapter[];
  initialChapter: SourceChapter;
  initialPages: SourcePage[];
  initialPageIndex: number;
}

interface ReaderStoreState {
  mode: ReaderMode;
  isOverlayVisible: boolean;
  sessionKey: string | null;
  meta: ReaderSessionMeta | null;
  chapters: SourceChapter[];
  loadedChapters: ReaderLoadedChapter[];
  loadedChapterIdsSet: string[];
  flatPages: ReaderFlatPage[];
  currentFlatIndex: number;
  currentChapterId: string | null;
  currentPageIndex: number;
  isLoadingNextChapter: boolean;
  nextChapterError: string | null;
  isLoadingPreviousChapter: boolean;
  previousChapterError: string | null;
  // State for showing previous chapter prompt instead of auto-loading
  showPreviousChapterPrompt: boolean;
  pendingPreviousChapter: SourceChapter | null;
  hasViewedCurrentChapter: boolean; // Track if user has viewed some content before showing prompt
  currentChapterViewedPageIndex: number | null; // Track highest page viewed in current chapter
  initializeSession: (input: InitializeReaderSessionInput) => void;
  appendChapterPages: (chapter: SourceChapter, pages: SourcePage[]) => void;
  // Atomic methods that pre-calculate all state changes before applying
  appendChapterPagesAtomic: (
    chapter: SourceChapter,
    pages: SourcePage[],
    targetPageIndex?: number
  ) => void;
  appendPreviousChapterAtomic: (chapter: SourceChapter, pages: SourcePage[]) => void;
  // Show prompt to user instead of auto-loading previous chapter
  setShowPreviousChapterPrompt: (chapter: SourceChapter) => void;
  hidePreviousChapterPrompt: () => void;
  // Mark that user has viewed some content in current chapter (enables showing previous chapter prompt)
  markChapterViewed: (pageIndex: number) => void;
  // Reset viewing state when chapter changes
  resetChapterViewState: () => void;
  pruneVerticalWindow: () => void;
  setCurrentFlatIndex: (index: number) => void;
  // Atomic position update that sets all position-related state at once
  setCurrentPositionAtomic: (chapterId: string, pageIndex: number, flatIndex: number) => void;
  toggleOverlay: () => void;
  showOverlay: () => void;
  hideOverlay: () => void;
  setIsLoadingNextChapter: (isLoading: boolean) => void;
  setNextChapterError: (error: string | null) => void;
  setIsLoadingPreviousChapter: (isLoading: boolean) => void;
  setPreviousChapterError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  mode: "vertical" as ReaderMode,
  isOverlayVisible: true,
  sessionKey: null as string | null,
  meta: null as ReaderSessionMeta | null,
  chapters: [] as SourceChapter[],
  loadedChapters: [] as ReaderLoadedChapter[],
  loadedChapterIdsSet: [] as string[],
  flatPages: [] as ReaderFlatPage[],
  currentFlatIndex: 0,
  currentChapterId: null as string | null,
  currentPageIndex: 0,
  isLoadingNextChapter: false,
  nextChapterError: null as string | null,
  isLoadingPreviousChapter: false,
  previousChapterError: null as string | null,
  showPreviousChapterPrompt: false,
  pendingPreviousChapter: null as SourceChapter | null,
  hasViewedCurrentChapter: false,
  currentChapterViewedPageIndex: null as number | null,
};

export const useReaderStore = create<ReaderStoreState>((set) => ({
  ...initialState,

  initializeSession: (input) => {
    const initialChapterPages: ReaderLoadedChapter[] = [
      {
        chapter: input.initialChapter,
        pages: input.initialPages,
      },
    ];
    const flatPages = flattenLoadedChapters(initialChapterPages);
    const safeInitialPage = Math.max(
      0,
      Math.min(input.initialPageIndex, Math.max(0, input.initialPages.length - 1))
    );
    const flatIndex = flatPages.findIndex(
      (entry) =>
        entry.chapterId === input.initialChapter.id && entry.pageIndex === safeInitialPage
    );

    set({
      mode: "vertical",
      sessionKey: input.sessionKey,
      meta: input.meta,
      chapters: input.chapters,
      loadedChapters: initialChapterPages,
      loadedChapterIdsSet: [input.initialChapter.id],
      flatPages,
      currentFlatIndex: flatIndex >= 0 ? flatIndex : 0,
      currentChapterId: input.initialChapter.id,
      currentPageIndex: safeInitialPage,
      isOverlayVisible: true,
      isLoadingNextChapter: false,
      nextChapterError: null,
      isLoadingPreviousChapter: false,
      previousChapterError: null,
      showPreviousChapterPrompt: false,
      pendingPreviousChapter: null,
      hasViewedCurrentChapter: false,
      currentChapterViewedPageIndex: null,
    });
  },

  appendChapterPages: (chapter, pages) => {
    set((state) => {
      const existingChapterIndex = findExistingChapterIndex(state.loadedChapters, chapter.id);

      if (existingChapterIndex >= 0) {
        const existingChapter = state.loadedChapters[existingChapterIndex];
        const hasTrackedId = state.loadedChapterIdsSet.includes(chapter.id);
        const canReplacePages = pages.length > 0;
        const pagesDifferent = hasPagesChanged(existingChapter.pages, pages);

        if (!canReplacePages || !pagesDifferent) {
          if (hasTrackedId) {
            return state;
          }

          return {
            ...state,
            loadedChapterIdsSet: [...state.loadedChapterIdsSet, chapter.id],
          };
        }

        const currentEntry = state.flatPages[state.currentFlatIndex];
        const loadedChapters = state.loadedChapters.map((loadedChapter, index) =>
          index === existingChapterIndex ? { chapter, pages } : loadedChapter
        );
        const flatPages = flattenLoadedChapters(loadedChapters);
        const loadedChapterIdsSet = hasTrackedId
          ? state.loadedChapterIdsSet
          : [...state.loadedChapterIdsSet, chapter.id];

        const nextFlatIndex = calculateRemappedFlatIndex(
          flatPages,
          state.currentFlatIndex,
          currentEntry?.chapterId ?? "",
          currentEntry?.pageIndex ?? 0
        );

        return {
          ...state,
          loadedChapters,
          loadedChapterIdsSet,
          flatPages,
          currentFlatIndex: nextFlatIndex,
        };
      }

      const hasTrackedId = state.loadedChapterIdsSet.includes(chapter.id);
      if (hasTrackedId && pages.length === 0) {
        return state;
      }

      const currentEntry = state.flatPages[state.currentFlatIndex];
      const loadedChapters = [...state.loadedChapters, { chapter, pages }];
      const flatPages = flattenLoadedChapters(loadedChapters);
      const loadedChapterIdsSet = state.loadedChapterIdsSet.includes(chapter.id)
        ? state.loadedChapterIdsSet
        : [...state.loadedChapterIdsSet, chapter.id];

      const nextFlatIndex = calculateRemappedFlatIndex(
        flatPages,
        state.currentFlatIndex,
        currentEntry?.chapterId ?? "",
        currentEntry?.pageIndex ?? 0
      );

      return {
        ...state,
        loadedChapters,
        loadedChapterIdsSet,
        flatPages,
        currentFlatIndex: nextFlatIndex,
      };
    });
  },

  // Atomic method that adds next chapter and sets position in one update
  appendChapterPagesAtomic: (chapter, pages, targetPageIndex = 0) => {
    set((state) => {
      // Check if already loaded
      const existingIndex = findExistingChapterIndex(state.loadedChapters, chapter.id);
      if (existingIndex >= 0) {
        // Chapter already loaded, just navigate to it
        const targetFlatIndex = state.flatPages.findIndex(
          (entry) => entry.chapterId === chapter.id && entry.pageIndex === targetPageIndex
        );
        if (targetFlatIndex >= 0) {
          const targetPage = state.flatPages[targetFlatIndex];
          return {
            ...state,
            currentFlatIndex: targetFlatIndex,
            currentChapterId: targetPage?.chapterId ?? state.currentChapterId,
            currentPageIndex: targetPage?.pageIndex ?? state.currentPageIndex,
          };
        }
        return state;
      }

      // Add new chapter and compute all state at once
      const newLoadedChapters = [...state.loadedChapters, { chapter, pages }];
      const newFlatPages = flattenLoadedChapters(newLoadedChapters);

      // Find target position in the NEW flat pages
      const targetFlatIndex = newFlatPages.findIndex(
        (entry) => entry.chapterId === chapter.id && entry.pageIndex === targetPageIndex
      );

      const targetPage = newFlatPages[targetFlatIndex >= 0 ? targetFlatIndex : 0];

      return {
        ...state,
        loadedChapters: newLoadedChapters,
        loadedChapterIdsSet: [...state.loadedChapterIdsSet, chapter.id],
        flatPages: newFlatPages,
        currentFlatIndex: targetFlatIndex >= 0 ? targetFlatIndex : state.currentFlatIndex,
        currentChapterId: targetPage?.chapterId ?? state.currentChapterId,
        currentPageIndex: targetPage?.pageIndex ?? state.currentPageIndex,
      };
    });
  },

  // Atomic method for adding previous chapter (goes to last page of that chapter)
  appendPreviousChapterAtomic: (chapter, pages) => {
    set((state) => {
      // Check if already loaded
      const existingIndex = findExistingChapterIndex(state.loadedChapters, chapter.id);
      if (existingIndex >= 0) {
        // Chapter already loaded, navigate to its last page
        const targetFlatIndex = state.flatPages.findIndex(
          (entry) => entry.chapterId === chapter.id && entry.pageIndex === pages.length - 1
        );
        if (targetFlatIndex >= 0) {
          const targetPage = state.flatPages[targetFlatIndex];
          return {
            ...state,
            currentFlatIndex: targetFlatIndex,
            currentChapterId: targetPage?.chapterId ?? state.currentChapterId,
            currentPageIndex: targetPage?.pageIndex ?? state.currentPageIndex,
          };
        }
        return state;
      }

      // Add new chapter at the beginning (for previous chapter) and compute all state
      const newLoadedChapters = [{ chapter, pages }, ...state.loadedChapters];
      const newFlatPages = flattenLoadedChapters(newLoadedChapters);

      // Target is the last page of the new previous chapter
      const targetPageIndex = pages.length - 1;
      const targetFlatIndex = newFlatPages.findIndex(
        (entry) => entry.chapterId === chapter.id && entry.pageIndex === targetPageIndex
      );

      const targetPage = newFlatPages[targetFlatIndex >= 0 ? targetFlatIndex : 0];

      return {
        ...state,
        loadedChapters: newLoadedChapters,
        loadedChapterIdsSet: [...state.loadedChapterIdsSet, chapter.id],
        flatPages: newFlatPages,
        currentFlatIndex: targetFlatIndex >= 0 ? targetFlatIndex : state.currentFlatIndex,
        currentChapterId: targetPage?.chapterId ?? state.currentChapterId,
        currentPageIndex: targetPage?.pageIndex ?? state.currentPageIndex,
      };
    });
  },

  // Atomic position update - sets all position state at once
  setCurrentPositionAtomic: (chapterId, pageIndex, flatIndex) => {
    set((state) => {
      const safeFlatIndex = Math.max(0, Math.min(flatIndex, state.flatPages.length - 1));
      const currentPage = state.flatPages[safeFlatIndex];

      return {
        ...state,
        currentFlatIndex: safeFlatIndex,
        currentChapterId: currentPage?.chapterId ?? chapterId,
        currentPageIndex: currentPage?.pageIndex ?? pageIndex,
      };
    });
  },

  pruneVerticalWindow: () => {
    set((state) => {
      const keptChapters = calculateKeptChapters(
        state.loadedChapters,
        state.currentChapterId,
        MAX_VERTICAL_CHAPTERS_IN_MEMORY
      );

      if (keptChapters.length === state.loadedChapters.length) {
        return state;
      }

      const flatPages = flattenLoadedChapters(keptChapters);
      if (flatPages.length === 0) {
        return {
          ...state,
          loadedChapters: keptChapters,
          flatPages,
          currentFlatIndex: 0,
        };
      }

      const nextFlatIndex = calculatePrunedFlatIndex(
        flatPages,
        state.currentFlatIndex,
        state.currentChapterId,
        state.currentPageIndex
      );

      const nextCurrentPage = flatPages[nextFlatIndex];

      return {
        ...state,
        loadedChapters: keptChapters,
        flatPages,
        currentFlatIndex: nextFlatIndex,
        currentChapterId: nextCurrentPage?.chapterId ?? state.currentChapterId,
        currentPageIndex: nextCurrentPage?.pageIndex ?? state.currentPageIndex,
      };
    });
  },

  setCurrentFlatIndex: (index) => {
    set((state) => {
      if (state.flatPages.length === 0) {
        return state;
      }

      const clampedIndex = Math.max(0, Math.min(index, state.flatPages.length - 1));
      const currentPage = state.flatPages[clampedIndex];

      return {
        ...state,
        currentFlatIndex: clampedIndex,
        currentChapterId: currentPage?.chapterId ?? state.currentChapterId,
        currentPageIndex: currentPage?.pageIndex ?? state.currentPageIndex,
      };
    });
  },

  toggleOverlay: () => {
    set((state) => ({ ...state, isOverlayVisible: !state.isOverlayVisible }));
  },

  showOverlay: () => {
    set((state) => ({ ...state, isOverlayVisible: true }));
  },

  hideOverlay: () => {
    set((state) => ({ ...state, isOverlayVisible: false }));
  },

  setIsLoadingNextChapter: (isLoading) => {
    set((state) => ({ ...state, isLoadingNextChapter: isLoading }));
  },

  setNextChapterError: (error) => {
    set((state) => ({ ...state, nextChapterError: error }));
  },

  setIsLoadingPreviousChapter: (isLoading) => {
    set((state) => ({ ...state, isLoadingPreviousChapter: isLoading }));
  },

  setPreviousChapterError: (error) => {
    set((state) => ({ ...state, previousChapterError: error }));
  },

  // Show prompt to user instead of auto-loading previous chapter
  setShowPreviousChapterPrompt: (chapter) => {
    set((state) => ({
      ...state,
      showPreviousChapterPrompt: true,
      pendingPreviousChapter: chapter,
    }));
  },

  hidePreviousChapterPrompt: () => {
    set((state) => ({
      ...state,
      showPreviousChapterPrompt: false,
      pendingPreviousChapter: null,
    }));
  },

  // Mark that user has viewed some content in current chapter
  markChapterViewed: (pageIndex) => {
    set((state) => {
      // Only mark as viewed if user has scrolled past initial page (at least page 1 or 2)
      const hasScrolledPastStart = pageIndex >= 1;
      const isHighestPageViewed = state.currentChapterViewedPageIndex === null ||
        pageIndex > state.currentChapterViewedPageIndex;

      if (!hasScrolledPastStart && !isHighestPageViewed) {
        return state;
      }

      return {
        ...state,
        hasViewedCurrentChapter: hasScrolledPastStart || state.hasViewedCurrentChapter,
        currentChapterViewedPageIndex: isHighestPageViewed ? pageIndex : state.currentChapterViewedPageIndex,
      };
    });
  },

  // Reset viewing state when chapter changes
  resetChapterViewState: () => {
    set((state) => ({
      ...state,
      hasViewedCurrentChapter: false,
      currentChapterViewedPageIndex: null,
      showPreviousChapterPrompt: false,
      pendingPreviousChapter: null,
    }));
  },

  reset: () => {
    set(initialState);
  },
}));

export const selectCurrentFlatPage = (
  state: ReaderStoreState
): ReaderFlatPage | null => state.flatPages[state.currentFlatIndex] ?? null;

export const selectCurrentLoadedChapter = (
  state: ReaderStoreState
): ReaderLoadedChapter | null => {
  if (!state.currentChapterId) {
    return null;
  }

  return state.loadedChapters.find((entry) => entry.chapter.id === state.currentChapterId) ?? null;
};
