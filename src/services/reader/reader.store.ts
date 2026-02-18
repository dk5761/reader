import { create } from "zustand";
import type { ReaderChapter } from "./reader.types";

interface ReaderState {
  chapter: ReaderChapter | null;
  currentPageIndex: number;
  isLoading: boolean;
  error: string | null;
  setChapter: (chapter: ReaderChapter) => void;
  setCurrentPage: (index: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  chapter: null,
  currentPageIndex: 0,
  isLoading: true,
  error: null,
};

export const useReaderStore = create<ReaderState>((set) => ({
  ...initialState,
  setChapter: (chapter) => set({ chapter, isLoading: false, error: null }),
  setCurrentPage: (currentPageIndex) => set({ currentPageIndex }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () => set(initialState),
}));
