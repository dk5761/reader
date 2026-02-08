import * as Updates from "expo-updates";
import { AppState, type AppStateStatus } from "react-native";
import { getAppUpdateSnapshot, useAppUpdateStore } from "./appUpdate.store";
import type { AppUpdateSnapshot } from "./appUpdate.types";

const AUTO_CHECK_COOLDOWN_MS = 15 * 60 * 1000;

let checkPromise: Promise<AppUpdateSnapshot> | null = null;
let applyPromise: Promise<void> | null = null;
let foregroundSubscription: { remove: () => void } | null = null;

const setSnapshot = useAppUpdateStore.getState().setSnapshot;

const resolveErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Could not complete update operation.";
};

const isUpdatesSupported = (): boolean => {
  if (!Updates.isEnabled) {
    return false;
  }
  if (__DEV__) {
    return false;
  }
  if (Updates.channel !== "production") {
    return false;
  }
  return true;
};

const setUnsupportedState = (): AppUpdateSnapshot => {
  const current = getAppUpdateSnapshot();
  const nextSnapshot: Partial<AppUpdateSnapshot> = {
    status: "error",
    isChecking: false,
    isApplying: false,
    isUpdateReady: current.isUpdateReady,
    errorMessage: "OTA updates are available only in production release builds.",
  };
  setSnapshot(nextSnapshot);
  return getAppUpdateSnapshot();
};

export const checkForAppUpdate = async (input?: {
  manual?: boolean;
}): Promise<AppUpdateSnapshot> => {
  const manual = Boolean(input?.manual);
  const snapshot = getAppUpdateSnapshot();

  if (!isUpdatesSupported()) {
    if (!manual) {
      return snapshot;
    }
    return setUnsupportedState();
  }

  if (checkPromise) {
    return checkPromise;
  }

  if (!manual && snapshot.lastCheckedAt) {
    const elapsed = Date.now() - snapshot.lastCheckedAt;
    if (elapsed < AUTO_CHECK_COOLDOWN_MS) {
      return snapshot;
    }
  }

  checkPromise = (async () => {
    const startedAt = Date.now();
    setSnapshot({
      status: "checking",
      isChecking: true,
      errorMessage: undefined,
      lastCheckedAt: startedAt,
    });

    try {
      const updateCheckResult = await Updates.checkForUpdateAsync();
      if (!updateCheckResult.isAvailable) {
        setSnapshot({
          status: "up_to_date",
          isChecking: false,
          isUpdateReady: false,
          errorMessage: undefined,
          lastSuccessfulCheckAt: Date.now(),
        });
        return getAppUpdateSnapshot();
      }

      setSnapshot({
        status: "downloading",
        isChecking: false,
        errorMessage: undefined,
      });

      await Updates.fetchUpdateAsync();

      setSnapshot({
        status: "ready",
        isChecking: false,
        isUpdateReady: true,
        errorMessage: undefined,
        lastSuccessfulCheckAt: Date.now(),
      });

      return getAppUpdateSnapshot();
    } catch (error) {
      setSnapshot({
        status: "error",
        isChecking: false,
        errorMessage: resolveErrorMessage(error),
      });
      return getAppUpdateSnapshot();
    } finally {
      checkPromise = null;
    }
  })();

  return checkPromise;
};

export const applyDownloadedUpdate = async (): Promise<void> => {
  const snapshot = getAppUpdateSnapshot();

  if (!isUpdatesSupported()) {
    setUnsupportedState();
    return;
  }

  if (applyPromise) {
    return applyPromise;
  }

  if (!snapshot.isUpdateReady) {
    setSnapshot({
      errorMessage: "No downloaded update is ready yet.",
    });
    return;
  }

  applyPromise = (async () => {
    setSnapshot({
      isApplying: true,
      errorMessage: undefined,
    });

    try {
      await Updates.reloadAsync();
    } catch (error) {
      setSnapshot({
        status: "error",
        errorMessage: resolveErrorMessage(error),
      });
    } finally {
      setSnapshot({
        isApplying: false,
      });
      applyPromise = null;
    }
  })();

  return applyPromise;
};

const onAppStateChanged = (nextState: AppStateStatus) => {
  if (nextState !== "active") {
    return;
  }
  void checkForAppUpdate({ manual: false });
};

export const startAppUpdateForegroundListener = (): (() => void) => {
  if (!isUpdatesSupported()) {
    return () => {};
  }

  if (foregroundSubscription) {
    return () => {};
  }

  foregroundSubscription = AppState.addEventListener("change", onAppStateChanged);

  if (AppState.currentState === "active") {
    void checkForAppUpdate({ manual: false });
  }

  return () => {
    foregroundSubscription?.remove();
    foregroundSubscription = null;
  };
};
