import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
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
  const [sources, setSources] = useState<SourceDescriptor[]>(() =>
    sourceRegistry.list()
  );

  const [selectedSourceIdState, setSelectedSourceIdState] =
    useState<SourceId | null>(() => (sources[0] ? sources[0].id : null));

  const refreshSources = useCallback(() => {
    const nextSources = sourceRegistry.list();
    setSources(nextSources);

    setSelectedSourceIdState((currentId) => {
      if (currentId && nextSources.some((source) => source.id === currentId)) {
        return currentId;
      }

      return nextSources[0]?.id ?? null;
    });
  }, []);

  const setSelectedSourceId = useCallback((sourceId: SourceId) => {
    if (!sourceRegistry.has(sourceId)) {
      throw new SourceNotFoundError(sourceId);
    }

    setSelectedSourceIdState(sourceId);
  }, []);

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
