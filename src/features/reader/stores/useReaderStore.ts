import { create } from "zustand";
import type { SourceChapter, SourcePage } from "@/services/source";
import type {
  ReaderFlatPage,
  ReaderLoadedChapter,
  ReaderMode,
  ReaderSessionMeta,
} from "../types/reader.types";

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
  reset: () => void;
}

const getChapterDisplayTitle = (chapter: SourceChapter): string =>
  chapter.title || (chapter.number !== undefined ? `Chapter ${chapter.number}` : "Chapter");

const MAX_VERTICAL_CHAPTERS_IN_MEMORY = 2;

const flattenLoadedChapters = (loadedChapters: ReaderLoadedChapter[]): ReaderFlatPage[] => {
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
    });
  },

  appendChapterPages: (chapter, pages) => {
    set((state) => {
      const existingChapterIndex = state.loadedChapters.findIndex(
        (loaded) => loaded.chapter.id === chapter.id
      );
      if (existingChapterIndex >= 0) {
        const existingChapter = state.loadedChapters[existingChapterIndex];
        const hasTrackedId = state.loadedChapterIdsSet.includes(chapter.id);
        const canReplacePages = pages.length > 0;
        const hasDifferentPages =
          existingChapter.pages.length !== pages.length ||
          existingChapter.pages.some(
            (page, index) =>
              page.index !== pages[index]?.index || page.imageUrl !== pages[index]?.imageUrl
          );

        if (!canReplacePages || !hasDifferentPages) {
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

        let nextFlatIndex = state.currentFlatIndex;
        if (currentEntry) {
          const remappedIndex = flatPages.findIndex(
            (entry) =>
              entry.chapterId === currentEntry.chapterId &&
              entry.pageIndex === currentEntry.pageIndex
          );
          if (remappedIndex >= 0) {
            nextFlatIndex = remappedIndex;
          } else if (flatPages.length > 0) {
            nextFlatIndex = Math.min(state.currentFlatIndex, flatPages.length - 1);
          }
        } else if (flatPages.length > 0) {
          nextFlatIndex = Math.min(state.currentFlatIndex, flatPages.length - 1);
        }

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

      let nextFlatIndex = state.currentFlatIndex;
      if (currentEntry) {
        const remappedIndex = flatPages.findIndex(
          (entry) =>
            entry.chapterId === currentEntry.chapterId &&
            entry.pageIndex === currentEntry.pageIndex
        );
        if (remappedIndex >= 0) {
          nextFlatIndex = remappedIndex;
        } else if (flatPages.length > 0) {
          nextFlatIndex = Math.min(state.currentFlatIndex, flatPages.length - 1);
        }
      } else if (flatPages.length > 0) {
        nextFlatIndex = Math.min(state.currentFlatIndex, flatPages.length - 1);
      }

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

      if (state.loadedChapters.length <= MAX_VERTICAL_CHAPTERS_IN_MEMORY) {
        return state;
      }

      const activeChapterId = state.currentChapterId;
      const activeIndex = activeChapterId
        ? state.loadedChapters.findIndex((entry) => entry.chapter.id === activeChapterId)
        : -1;

      let keptChapters: ReaderLoadedChapter[];
      if (activeIndex < 0) {
        keptChapters = state.loadedChapters.slice(-MAX_VERTICAL_CHAPTERS_IN_MEMORY);
      } else {
        const hasLoadedNextChapter = activeIndex < state.loadedChapters.length - 1;
        if (hasLoadedNextChapter) {
          // Defer pruning until the current chapter becomes the latest loaded chapter.
          // Pruning here would remove items above the viewport and can jump scroll position.
          return state;
        }

        const startIndex = Math.max(
          0,
          activeIndex - (MAX_VERTICAL_CHAPTERS_IN_MEMORY - 1)
        );
        keptChapters = state.loadedChapters.slice(startIndex, activeIndex + 1);

        if (keptChapters.length > MAX_VERTICAL_CHAPTERS_IN_MEMORY) {
          keptChapters = keptChapters.slice(-MAX_VERTICAL_CHAPTERS_IN_MEMORY);
        }
      }

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

      const preferredFlatIndex = flatPages.findIndex(
        (entry) =>
          entry.chapterId === state.currentChapterId &&
          entry.pageIndex === state.currentPageIndex
      );

      const currentEntry = state.flatPages[state.currentFlatIndex];
      const currentEntryIndex =
        currentEntry &&
        flatPages.findIndex(
          (entry) =>
            entry.chapterId === currentEntry.chapterId &&
            entry.pageIndex === currentEntry.pageIndex
        );

      const nextFlatIndex =
        preferredFlatIndex >= 0
          ? preferredFlatIndex
          : currentEntryIndex !== undefined && currentEntryIndex >= 0
            ? currentEntryIndex
            : Math.max(0, Math.min(state.currentFlatIndex, flatPages.length - 1));

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
