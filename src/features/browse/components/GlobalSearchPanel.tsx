import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { SourceDescriptor } from "@/services/source";
import { SearchInput } from "@/shared/ui";
import { appSettingsQueryOptions, useUpdateAppSettingsMutation } from "@/features/settings/api";
import { globalSearchQueryFactory } from "../api";
import { GlobalSearchSourceSection } from "./GlobalSearchSourceSection";
import { GlobalSearchSourceSelector } from "./GlobalSearchSourceSelector";

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_SOURCE_IDS: string[] = [];

const normalizeSelectedSourceIds = (
  selectedSourceIds: string[],
  searchableSourceIds: string[]
): string[] => {
  if (searchableSourceIds.length === 0) {
    return [];
  }

  const sourceIdSet = new Set(
    selectedSourceIds.map((sourceId) => sourceId.trim()).filter(Boolean)
  );
  const normalized = searchableSourceIds.filter((sourceId) => sourceIdSet.has(sourceId));

  if (normalized.length === 0) {
    return searchableSourceIds;
  }

  return normalized;
};

const areSameSourceIdList = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
};

interface GlobalSearchPanelProps {
  sources: SourceDescriptor[];
  onSearchActiveChange?: (isActive: boolean) => void;
}

export const GlobalSearchPanel = ({
  sources,
  onSearchActiveChange,
}: GlobalSearchPanelProps) => {
  const queryClient = useQueryClient();
  const appSettingsQuery = useQuery(appSettingsQueryOptions());
  const updateSettingsMutation = useUpdateAppSettingsMutation();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const searchableSources = useMemo(
    () => sources.filter((source) => source.supportsSearch !== false),
    [sources]
  );
  const searchableSourceIds = useMemo(
    () => searchableSources.map((source) => source.id),
    [searchableSources]
  );

  const persistedSelectedSourceIds =
    appSettingsQuery.data?.globalSearchSelectedSourceIds ?? EMPTY_SOURCE_IDS;
  const effectiveSelectedSourceIds = useMemo(() => {
    const pendingSelectedSourceIds = updateSettingsMutation.variables?.globalSearchSelectedSourceIds;
    return pendingSelectedSourceIds ?? persistedSelectedSourceIds;
  }, [persistedSelectedSourceIds, updateSettingsMutation.variables]);

  const selectedSourceIds = useMemo(
    () => normalizeSelectedSourceIds(effectiveSelectedSourceIds, searchableSourceIds),
    [effectiveSelectedSourceIds, searchableSourceIds]
  );

  const selectedSources = useMemo(
    () => searchableSources.filter((source) => selectedSourceIds.includes(source.id)),
    [searchableSources, selectedSourceIds]
  );

  const trimmedInput = searchInput.trim();
  const hasSearchInput = trimmedInput.length > 0;
  const hasSearchableSources = searchableSources.length > 0;
  const hasSearchSelection = selectedSourceIds.length > 0;
  const activeQuery = debouncedQuery.trim();
  const canSearch = activeQuery.length >= MIN_QUERY_LENGTH && hasSearchSelection;

  useEffect(() => {
    onSearchActiveChange?.(hasSearchInput);
  }, [hasSearchInput, onSearchActiveChange]);

  useEffect(() => {
    if (!hasSearchInput) {
      setDebouncedQuery("");
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setDebouncedQuery(trimmedInput);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
      void queryClient.cancelQueries({
        queryKey: globalSearchQueryFactory.all(),
      });
    };
  }, [hasSearchInput, queryClient, trimmedInput]);

  useEffect(() => {
    if (!appSettingsQuery.data || updateSettingsMutation.isPending) {
      return;
    }

    const normalizedPersisted = normalizeSelectedSourceIds(
      appSettingsQuery.data.globalSearchSelectedSourceIds,
      searchableSourceIds
    );

    if (
      areSameSourceIdList(
        normalizedPersisted,
        appSettingsQuery.data.globalSearchSelectedSourceIds
      )
    ) {
      return;
    }

    updateSettingsMutation.mutate({
      globalSearchSelectedSourceIds: normalizedPersisted,
    });
  }, [appSettingsQuery.data, searchableSourceIds, updateSettingsMutation]);

  const updateSelectedSourceIds = (nextSelectedSourceIds: string[]) => {
    const normalized = normalizeSelectedSourceIds(nextSelectedSourceIds, searchableSourceIds);

    if (areSameSourceIdList(normalized, selectedSourceIds)) {
      return;
    }

    updateSettingsMutation.mutate({
      globalSearchSelectedSourceIds: normalized,
    });
  };

  return (
    <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
      <Text className="text-base font-semibold text-white">Global Search</Text>
      <Text className="mt-1 text-xs text-[#8B8D98]">
        Search across selected source adapters.
      </Text>

      <View className="mt-3">
        <SearchInput
          placeholder="Search all selected sources"
          value={searchInput}
          onChangeText={setSearchInput}
        />
      </View>

      {hasSearchableSources ? (
        <View className="mt-3">
          <GlobalSearchSourceSelector
            sources={searchableSources}
            selectedSourceIds={selectedSourceIds}
            disabled={updateSettingsMutation.isPending}
            onChangeSelectedSourceIds={updateSelectedSourceIds}
          />
        </View>
      ) : (
        <View className="mt-3 rounded-xl border border-[#2A2A2E] bg-[#15161A] p-3">
          <Text className="text-xs text-[#9B9CA6]">No sources currently support search.</Text>
        </View>
      )}

      {hasSearchInput ? (
        <View className="mt-3">
          {!hasSearchSelection ? (
            <View className="rounded-xl border border-[#2A2A2E] bg-[#15161A] p-3">
              <Text className="text-xs text-[#9B9CA6]">Select at least one source.</Text>
            </View>
          ) : activeQuery.length < MIN_QUERY_LENGTH ? (
            <View className="rounded-xl border border-[#2A2A2E] bg-[#15161A] p-3">
              <Text className="text-xs text-[#9B9CA6]">
                Type at least {MIN_QUERY_LENGTH} characters to search.
              </Text>
            </View>
          ) : (
            selectedSources.map((source) => (
              <GlobalSearchSourceSection
                key={`global-search-${source.id}`}
                source={source}
                query={activeQuery}
                enabled={canSearch}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
};
