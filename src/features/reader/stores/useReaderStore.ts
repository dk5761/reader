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
  flatPages: ReaderFlatPage[];
  currentFlatIndex: number;
  currentChapterId: string | null;
  currentPageIndex: number;
  isLoadingNextChapter: boolean;
  nextChapterError: string | null;
  initializeSession: (input: InitializeReaderSessionInput) => void;
  appendChapterPages: (chapter: SourceChapter, pages: SourcePage[]) => void;
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
      if (state.loadedChapters.some((loaded) => loaded.chapter.id === chapter.id)) {
        return state;
      }

      const loadedChapters = [...state.loadedChapters, { chapter, pages }];
      const flatPages = flattenLoadedChapters(loadedChapters);
      return { ...state, loadedChapters, flatPages };
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
