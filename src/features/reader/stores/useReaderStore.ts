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
  initialMode?: ReaderMode;
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
  initializeSession: (input: InitializeReaderSessionInput) => void;
  appendChapterPages: (chapter: SourceChapter, pages: SourcePage[]) => void;
  pruneVerticalWindow: () => void;
  setCurrentFlatIndex: (index: number) => void;
  setCurrentHorizontalPosition: (chapterId: string, pageIndex: number) => void;
  setMode: (mode: ReaderMode) => void;
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
      mode: input.initialMode ?? "vertical",
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

  pruneVerticalWindow: () => {
    set((state) => {
      if (state.mode !== "vertical") {
        return state;
      }

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

  setCurrentHorizontalPosition: (chapterId, pageIndex) => {
    set((state) => {
      const loadedChapter = state.loadedChapters.find(
        (entry) => entry.chapter.id === chapterId
      );
      const safePageIndex = Math.max(
        0,
        Math.min(pageIndex, Math.max(0, (loadedChapter?.pages.length ?? 1) - 1))
      );
      const nextFlatIndex = state.flatPages.findIndex(
        (entry) => entry.chapterId === chapterId && entry.pageIndex === safePageIndex
      );

      return {
        ...state,
        currentChapterId: chapterId,
        currentPageIndex: safePageIndex,
        currentFlatIndex: nextFlatIndex >= 0 ? nextFlatIndex : state.currentFlatIndex,
      };
    });
  },

  setMode: (mode) => {
    set((state) => ({ ...state, mode }));
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
