import { create } from "zustand";
import type {
  LibraryUpdateRunCurrentItem,
  LibraryUpdateRunSnapshot,
  LibraryUpdateRunStatus,
} from "./libraryUpdate.types";

interface SetRunSnapshotInput {
  runId?: number | null;
  status?: LibraryUpdateRunStatus;
  total?: number;
  processed?: number;
  updated?: number;
  errors?: number;
  skipped?: number;
  startedAt?: number | null;
  endedAt?: number | null;
  current?: LibraryUpdateRunCurrentItem | null;
  pausedByAppState?: boolean;
  errorMessage?: string | null;
}

interface LibraryUpdateStoreState {
  snapshot: LibraryUpdateRunSnapshot;
  setRunSnapshot: (input: SetRunSnapshotInput) => void;
  resetRunSnapshot: () => void;
}

const initialSnapshot: LibraryUpdateRunSnapshot = {
  runId: null,
  status: "idle",
  total: 0,
  processed: 0,
  updated: 0,
  errors: 0,
  skipped: 0,
  startedAt: null,
  endedAt: null,
  current: null,
  pausedByAppState: false,
  errorMessage: null,
};

export const useLibraryUpdateStore = create<LibraryUpdateStoreState>((set) => ({
  snapshot: initialSnapshot,

  setRunSnapshot: (input) => {
    set((state) => ({
      snapshot: {
        ...state.snapshot,
        ...input,
      },
    }));
  },

  resetRunSnapshot: () => {
    set({
      snapshot: initialSnapshot,
    });
  },
}));

export const getLibraryUpdateRunSnapshot = (): LibraryUpdateRunSnapshot =>
  useLibraryUpdateStore.getState().snapshot;
