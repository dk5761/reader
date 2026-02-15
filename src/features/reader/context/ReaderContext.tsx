import { createContext, useContext, type ReactNode } from "react";
import { useReaderStore } from "../stores/useReaderStore";
import type { ReaderMode, ReaderFlatPage, ReaderLoadedChapter } from "../types/reader.types";

/**
 * Reader context value that provides access to reader state and actions.
 * This reduces prop drilling in deeply nested reader components.
 */
interface ReaderContextValue {
  // State
  mode: ReaderMode;
  isOverlayVisible: boolean;
  sessionKey: string | null;
  meta: ReturnType<typeof useReaderStore.getState>["meta"];
  chapters: ReturnType<typeof useReaderStore.getState>["chapters"];
  loadedChapters: ReaderLoadedChapter[];
  flatPages: ReaderFlatPage[];
  currentFlatIndex: number;
  currentChapterId: string | null;
  currentPageIndex: number;
  isLoadingNextChapter: boolean;
  nextChapterError: string | null;
  isLoadingPreviousChapter: boolean;
  previousChapterError: string | null;

  // Derived state
  currentFlatPage: ReaderFlatPage | null;
  currentLoadedChapter: ReaderLoadedChapter | null;

  // Actions
  initializeSession: ReturnType<typeof useReaderStore.getState>["initializeSession"];
  appendChapterPages: ReturnType<typeof useReaderStore.getState>["appendChapterPages"];
  pruneVerticalWindow: ReturnType<typeof useReaderStore.getState>["pruneVerticalWindow"];
  setCurrentFlatIndex: ReturnType<typeof useReaderStore.getState>["setCurrentFlatIndex"];
  toggleOverlay: ReturnType<typeof useReaderStore.getState>["toggleOverlay"];
  showOverlay: ReturnType<typeof useReaderStore.getState>["showOverlay"];
  hideOverlay: ReturnType<typeof useReaderStore.getState>["hideOverlay"];
  setIsLoadingNextChapter: ReturnType<typeof useReaderStore.getState>["setIsLoadingNextChapter"];
  setNextChapterError: ReturnType<typeof useReaderStore.getState>["setNextChapterError"];
  setIsLoadingPreviousChapter: ReturnType<typeof useReaderStore.getState>["setIsLoadingPreviousChapter"];
  setPreviousChapterError: ReturnType<typeof useReaderStore.getState>["setPreviousChapterError"];
  reset: ReturnType<typeof useReaderStore.getState>["reset"];
}

const ReaderContext = createContext<ReaderContextValue | null>(null);

interface ReaderProviderProps {
  children: ReactNode;
}

/**
 * Reader provider that encapsulates reader state and actions.
 * Use this for deeply nested reader components that need access to reader state.
 *
 * @example
 * ```tsx
 * function MyReaderComponent() {
 *   return (
 *     <ReaderProvider>
 *       <ReaderContent />
 *     </ReaderProvider>
 *   );
 * }
 *
 * function ReaderContent() {
 *   const { currentFlatPage } = useReaderContext();
 *   // ...
 * }
 * ```
 */
export function ReaderProvider({ children }: ReaderProviderProps) {
  const store = useReaderStore();

  const value: ReaderContextValue = {
    // State
    mode: store.mode,
    isOverlayVisible: store.isOverlayVisible,
    sessionKey: store.sessionKey,
    meta: store.meta,
    chapters: store.chapters,
    loadedChapters: store.loadedChapters,
    flatPages: store.flatPages,
    currentFlatIndex: store.currentFlatIndex,
    currentChapterId: store.currentChapterId,
    currentPageIndex: store.currentPageIndex,
    isLoadingNextChapter: store.isLoadingNextChapter,
    nextChapterError: store.nextChapterError,
    isLoadingPreviousChapter: store.isLoadingPreviousChapter,
    previousChapterError: store.previousChapterError,

    // Derived state
    currentFlatPage: store.flatPages[store.currentFlatIndex] ?? null,
    currentLoadedChapter: store.loadedChapters.find(
      (entry) => entry.chapter.id === store.currentChapterId
    ) ?? null,

    // Actions
    initializeSession: store.initializeSession,
    appendChapterPages: store.appendChapterPages,
    pruneVerticalWindow: store.pruneVerticalWindow,
    setCurrentFlatIndex: store.setCurrentFlatIndex,
    toggleOverlay: store.toggleOverlay,
    showOverlay: store.showOverlay,
    hideOverlay: store.hideOverlay,
    setIsLoadingNextChapter: store.setIsLoadingNextChapter,
    setNextChapterError: store.setNextChapterError,
    setIsLoadingPreviousChapter: store.setIsLoadingPreviousChapter,
    setPreviousChapterError: store.setPreviousChapterError,
    reset: store.reset,
  };

  return (
    <ReaderContext.Provider value={value}>
      {children}
    </ReaderContext.Provider>
  );
}

/**
 * Hook to access the reader context.
 * Throws an error if used outside of a ReaderProvider.
 *
 * @example
 * ```tsx
 * function ReaderPage() {
 *   const { mode } = useReaderContext();
 *   return <p>Mode: {mode}</p>;
 * }
 * ```
 */
export function useReaderContext(): ReaderContextValue {
  const context = useContext(ReaderContext);
  if (!context) {
    throw new Error("useReaderContext must be used within a ReaderProvider");
  }
  return context;
}

/**
 * Selector hook for specific parts of the reader context.
 * Use this for optimized renders when you only need specific state.
 *
 * @example
 * ```tsx
 * // Only re-render when mode changes
 * const mode = useReaderContextSelector(state => state.mode);
 *
 * // Only re-render when current page changes
 * const currentPage = useReaderContextSelector(state => state.currentPageIndex);
 * ```
 */
export function useReaderContextSelector<T>(selector: (value: ReaderContextValue) => T): T {
  const context = useContext(ReaderContext);
  if (!context) {
    throw new Error("useReaderContextSelector must be used within a ReaderProvider");
  }
  return selector(context);
}
