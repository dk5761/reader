import { useMemo, useCallback } from "react";
import type {
  LibrarySortDirection,
  LibrarySortKey,
  LibraryStatusFilter,
} from "@/services/library";

interface UseLibraryFiltersOptions {
  settingsData: {
    sourceFilterSourceIds?: string[];
    sortKey?: LibrarySortKey;
    sortDirection?: LibrarySortDirection;
    statusFilter?: LibraryStatusFilter;
  } | null;
  allowedSourceIds: string[];
  updateSettings: (input: {
    sortKey?: LibrarySortKey;
    sortDirection?: LibrarySortDirection;
    statusFilter?: LibraryStatusFilter;
    sourceFilterSourceIds?: string[];
  }) => void;
}

interface UseLibraryFiltersReturn {
  normalizedSourceFilterIds: string[];
  filters: {
    activeCategory: "all";
    sortKey: LibrarySortKey;
    sortDirection: LibrarySortDirection;
    statusFilter: LibraryStatusFilter;
    sourceIds: string[];
  };
  toggleSourceFilter: (sourceId: string) => void;
  resetSourceFilters: () => void;
  updateSortKey: (sortKey: LibrarySortKey) => void;
  updateSortDirection: (sortDirection: LibrarySortDirection) => void;
  updateStatusFilter: (statusFilter: LibraryStatusFilter) => void;
}

export function useLibraryFilters({
  settingsData,
  allowedSourceIds,
  updateSettings,
}: UseLibraryFiltersOptions): UseLibraryFiltersReturn {
  const allowedSourceIdSet = useMemo(
    () => new Set(allowedSourceIds),
    [allowedSourceIds]
  );

  const normalizedSourceFilterIds = useMemo(() => {
    const sourceFilterIds = settingsData?.sourceFilterSourceIds ?? [];
    return sourceFilterIds.filter((id) => allowedSourceIdSet.has(id));
  }, [settingsData?.sourceFilterSourceIds, allowedSourceIdSet]);

  const filters = useMemo(
    () => ({
      activeCategory: "all" as const,
      sortKey: settingsData?.sortKey ?? "updatedAt",
      sortDirection: settingsData?.sortDirection ?? "desc",
      statusFilter: settingsData?.statusFilter ?? "all",
      sourceIds: normalizedSourceFilterIds,
    }),
    [
      normalizedSourceFilterIds,
      settingsData?.sortDirection,
      settingsData?.sortKey,
      settingsData?.statusFilter,
    ]
  );

  const toggleSourceFilter = useCallback(
    (sourceId: string) => {
      const current = normalizedSourceFilterIds;
      const isSelected = current.includes(sourceId);
      const next = isSelected
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId];

      const normalizedNext =
        next.length === 0 || next.length === allowedSourceIds.length ? [] : next;

      updateSettings({ sourceFilterSourceIds: normalizedNext });
    },
    [allowedSourceIds, normalizedSourceFilterIds, updateSettings]
  );

  const resetSourceFilters = useCallback(() => {
    updateSettings({ sourceFilterSourceIds: [] });
  }, [updateSettings]);

  const updateSortKey = useCallback(
    (sortKey: LibrarySortKey) => {
      updateSettings({ sortKey });
    },
    [updateSettings]
  );

  const updateSortDirection = useCallback(
    (sortDirection: LibrarySortDirection) => {
      updateSettings({ sortDirection });
    },
    [updateSettings]
  );

  const updateStatusFilter = useCallback(
    (statusFilter: LibraryStatusFilter) => {
      updateSettings({ statusFilter });
    },
    [updateSettings]
  );

  return {
    normalizedSourceFilterIds,
    filters,
    toggleSourceFilter,
    resetSourceFilters,
    updateSortKey,
    updateSortDirection,
    updateStatusFilter,
  };
}
