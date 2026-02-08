import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getAppSettings } from "@/services/settings";
import {
  SourceNotFoundError,
  sourceRegistry,
  type SourceDescriptor,
  type SourceId,
} from "./core";
import { initializeSourceSystem } from "./setup";

interface SourceContextValue {
  sources: SourceDescriptor[];
  selectedSourceId: SourceId | null;
  selectedSource: SourceDescriptor | null;
  setSelectedSourceId: (sourceId: SourceId) => void;
  refreshSources: () => void;
}

const SourceContext = createContext<SourceContextValue | undefined>(undefined);

initializeSourceSystem();

export const SourceProvider = ({ children }: { children: ReactNode }) => {
  const [registeredSources, setRegisteredSources] = useState<SourceDescriptor[]>(() =>
    sourceRegistry.list()
  );

  const [selectedSourceIdState, setSelectedSourceIdState] =
    useState<SourceId | null>(() =>
      sourceRegistry.list()[0] ? sourceRegistry.list()[0].id : null
    );

  const appSettingsQuery = useQuery({
    queryKey: ["settings", "app"],
    queryFn: () => getAppSettings(),
  });

  const allowNsfwSources = appSettingsQuery.data?.allowNsfwSources ?? false;
  const sources = useMemo(
    () =>
      allowNsfwSources
        ? registeredSources
        : registeredSources.filter((source) => !source.isNsfw),
    [allowNsfwSources, registeredSources]
  );

  const refreshSources = useCallback(() => {
    const nextSources = sourceRegistry.list();
    setRegisteredSources(nextSources);
  }, []);

  useEffect(() => {
    setSelectedSourceIdState((currentId) => {
      if (currentId && sources.some((source) => source.id === currentId)) {
        return currentId;
      }

      return sources[0]?.id ?? null;
    });
  }, [sources]);

  const setSelectedSourceId = useCallback(
    (sourceId: SourceId) => {
      if (!sources.some((source) => source.id === sourceId)) {
        throw new SourceNotFoundError(sourceId);
      }

      setSelectedSourceIdState(sourceId);
    },
    [sources]
  );

  const selectedSource = useMemo(
    () =>
      selectedSourceIdState
        ? sources.find((source) => source.id === selectedSourceIdState) ?? null
        : null,
    [selectedSourceIdState, sources]
  );

  const value = useMemo(
    () => ({
      sources,
      selectedSourceId: selectedSourceIdState,
      selectedSource,
      setSelectedSourceId,
      refreshSources,
    }),
    [refreshSources, selectedSource, selectedSourceIdState, setSelectedSourceId, sources]
  );

  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>;
};

export const useSource = (): SourceContextValue => {
  const context = useContext(SourceContext);
  if (!context) {
    throw new Error("useSource must be used within SourceProvider.");
  }

  return context;
};
