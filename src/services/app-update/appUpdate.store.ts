import { create } from "zustand";
import type { AppUpdateSnapshot } from "./appUpdate.types";

interface AppUpdateStoreState {
  snapshot: AppUpdateSnapshot;
  setSnapshot: (input: Partial<AppUpdateSnapshot>) => void;
  resetSnapshot: () => void;
}

const initialSnapshot: AppUpdateSnapshot = {
  status: "idle",
  isUpdateReady: false,
  isChecking: false,
  isApplying: false,
  errorMessage: undefined,
  lastCheckedAt: undefined,
  lastSuccessfulCheckAt: undefined,
};

export const useAppUpdateStore = create<AppUpdateStoreState>((set) => ({
  snapshot: initialSnapshot,
  setSnapshot: (input) =>
    set((state) => ({
      snapshot: {
        ...state.snapshot,
        ...input,
      },
    })),
  resetSnapshot: () =>
    set({
      snapshot: initialSnapshot,
    }),
}));

export const getAppUpdateSnapshot = (): AppUpdateSnapshot =>
  useAppUpdateStore.getState().snapshot;
