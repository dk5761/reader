import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import {
  getSourceLatestUpdates,
  getSourcePopularTitles,
  searchSourceManga,
  sourceQueryFactory,
  type SourceManga,
} from "@/services/source";
import { useSource } from "@/services/source";
import { SearchInput } from "@/shared/ui";

type BrowseMode = "popular" | "latest" | "search";

const modeLabelMap: Record<BrowseMode, string> = {
  popular: "Popular",
  latest: "Latest",
  search: "Search",
};

const getDecodedSourceId = (value: string | string[] | undefined): string => {
  const sourceId = Array.isArray(value) ? value[0] : value;
  if (!sourceId) {
    return "";
  }

  try {
    return decodeURIComponent(sourceId);
  } catch {
    return sourceId;
  }
};

const sourceSupports = (
  value: boolean | undefined,
  fallback: boolean
): boolean => (value === undefined ? fallback : value);

const buildSupportedModes = (params: {
  supportsPopular: boolean;
  supportsLatest: boolean;
  supportsSearch: boolean;
}): BrowseMode[] => {
  const modes: BrowseMode[] = [];

  if (params.supportsPopular) {
    modes.push("popular");
  }

  if (params.supportsLatest) {
    modes.push("latest");
  }

  if (params.supportsSearch) {
    modes.push("search");
  }

  return modes;
};

const queryMangaPage = async (params: {
  sourceId: string;
  mode: BrowseMode;
  page: number;
  query: string;
  filters: Record<string, unknown> | undefined;
}) => {
  if (params.mode === "popular") {
    return getSourcePopularTitles(params.sourceId, { page: params.page });
  }

  if (params.mode === "latest") {
    return getSourceLatestUpdates(params.sourceId, { page: params.page });
  }

  return searchSourceManga(params.sourceId, {
    page: params.page,
    query: params.query,
    filters: params.filters,
  });
};

export default function SourceMangaListScreen() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useLocalSearchParams<{ sourceId?: string | string[] }>();
  const routeSourceId = getDecodedSourceId(params.sourceId);

  const { sources, setSelectedSourceId } = useSource();
  const source = useMemo(
    () => sources.find((item) => item.id === routeSourceId) ?? null,
    [routeSourceId, sources]
  );

  const supportsPopular = sourceSupports(source?.supportsPopular, true);
  const supportsLatest = sourceSupports(source?.supportsLatest, true);
  const supportsSearch = sourceSupports(source?.supportsSearch, true);
  const supportsFilters = sourceSupports(source?.supportsFilters, false);

  const supportedModes = useMemo(
    () =>
      buildSupportedModes({
        supportsPopular,
        supportsLatest,
        supportsSearch,
      }),
    [supportsLatest, supportsPopular, supportsSearch]
  );

  const defaultBrowseMode = useMemo<BrowseMode>(
    () => supportedModes.find((item) => item !== "search") ?? supportedModes[0] ?? "popular",
    [supportedModes]
  );

  const [mode, setMode] = useState<BrowseMode>(defaultBrowseMode);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | "ongoing" | "completed">(
    "all"
  );

  useEffect(() => {
    setMode(defaultBrowseMode);
  }, [defaultBrowseMode, routeSourceId]);

  useEffect(() => {
    if (!supportsSearch) {
      return;
    }

    void queryClient.cancelQueries({
      queryKey: [...sourceQueryFactory.byId(routeSourceId || "unknown"), "browse"],
    });

    const timeoutId = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [queryClient, routeSourceId, searchInput, supportsSearch]);

  useEffect(() => {
    if (!source) {
      return;
    }

    setSelectedSourceId(source.id);
  }, [setSelectedSourceId, source]);

  const activeFilters = useMemo(() => {
    if (!supportsFilters) {
      return undefined;
    }

    return statusFilter === "all" ? undefined : { status: statusFilter };
  }, [statusFilter, supportsFilters]);

  const isSearchMode = mode === "search";
  const hasSearchInput = searchInput.trim().length > 0;
  const hasSearchQuery = debouncedQuery.length > 0;
  const isSearchIdle = isSearchMode && !hasSearchQuery;
  const visibleModes = useMemo(
    () =>
      supportedModes.filter(
        (itemMode) => itemMode !== "search" || hasSearchQuery || mode === "search"
      ),
    [hasSearchQuery, mode, supportedModes]
  );

  useEffect(() => {
    if (!supportsSearch) {
      return undefined;
    }

    if (hasSearchInput && mode !== "search") {
      setMode("search");
      return undefined;
    }

    if (!hasSearchInput && mode === "search") {
      setMode(defaultBrowseMode);
    }

    return undefined;
  }, [defaultBrowseMode, hasSearchInput, mode, supportsSearch]);

  const mangaQuery = useInfiniteQuery({
    queryKey: [
      ...sourceQueryFactory.byId(routeSourceId || "unknown"),
      "browse",
      mode,
      debouncedQuery,
      activeFilters ?? null,
    ],
    queryFn: ({ pageParam = 1 }) =>
      queryMangaPage({
        sourceId: routeSourceId,
        page: pageParam,
        mode,
        query: debouncedQuery,
        filters: activeFilters,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    enabled: Boolean(
      source &&
        routeSourceId &&
        supportedModes.includes(mode) &&
        (!isSearchMode || hasSearchQuery)
    ),
  });

  const mangaItems = useMemo<SourceManga[]>(
    () => mangaQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [mangaQuery.data]
  );

  if (!source) {
    return (
      <View className="flex-1 items-center justify-center bg-[#111214] px-6">
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="text-lg font-semibold text-white">Source Not Found</Text>
        <Text className="mt-2 text-center text-sm text-[#9B9CA6]">
          This adapter is not registered. Please go back and try another source.
        </Text>
        <PressableScale onPress={() => router.back()}>
          <View className="mt-4 rounded-full border border-[#2A2A2E] bg-[#1A1B1E] px-4 py-2">
            <Text className="text-sm font-medium text-white">Back</Text>
          </View>
        </PressableScale>
      </View>
    );
  }

  if (supportedModes.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-[#111214] px-6">
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="text-lg font-semibold text-white">
          No Supported Browse Mode
        </Text>
        <Text className="mt-2 text-center text-sm text-[#9B9CA6]">
          This source does not expose popular, latest, or search capabilities.
        </Text>
        <PressableScale onPress={() => router.back()}>
          <View className="mt-4 rounded-full border border-[#2A2A2E] bg-[#1A1B1E] px-4 py-2">
            <Text className="text-sm font-medium text-white">Back</Text>
          </View>
        </PressableScale>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#111214]">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-4 pb-2 pt-2">
        <PressableScale onPress={() => router.back()}>
          <View className="mb-3 self-start">
            <Text className="text-sm text-[#8B8D98]">Back</Text>
          </View>
        </PressableScale>

        <Text className="text-2xl font-bold text-white">{source.name}</Text>
        <Text className="mt-1 text-sm text-[#9B9CA6]">Manga list from this adapter.</Text>
      </View>

      <View className="gap-3 px-4 pb-3">
        <View className="flex-row flex-wrap gap-2">
          {visibleModes.map((itemMode) => (
            <PressableScale key={itemMode} onPress={() => setMode(itemMode)}>
              <View
                className={`rounded-full border px-3 py-1.5 ${
                  mode === itemMode
                    ? "border-[#67A4FF] bg-[#67A4FF]/20"
                    : "border-[#2A2A2E] bg-[#1A1B1E]"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    mode === itemMode ? "text-[#84B6FF]" : "text-[#C8C9D2]"
                  }`}
                >
                  {modeLabelMap[itemMode]}
                </Text>
              </View>
            </PressableScale>
          ))}
        </View>

        {supportsSearch ? (
          <SearchInput
            placeholder="Search manga"
            value={searchInput}
            onChangeText={setSearchInput}
          />
        ) : null}

        {supportsFilters ? (
          <View className="flex-row flex-wrap gap-2">
            {(["all", "ongoing", "completed"] as const).map((value) => (
              <PressableScale key={value} onPress={() => setStatusFilter(value)}>
                <View
                  className={`rounded-full border px-3 py-1.5 ${
                    statusFilter === value
                      ? "border-[#67A4FF] bg-[#67A4FF]/20"
                      : "border-[#2A2A2E] bg-[#1A1B1E]"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      statusFilter === value ? "text-[#84B6FF]" : "text-[#C8C9D2]"
                    }`}
                  >
                    {value}
                  </Text>
                </View>
              </PressableScale>
            ))}
          </View>
        ) : null}
      </View>

      {isSearchIdle ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-[#9B9CA6]">
            Enter a title to start searching.
          </Text>
        </View>
      ) : mangaQuery.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#67A4FF" />
          <Text className="mt-3 text-sm text-[#9B9CA6]">Loading manga...</Text>
        </View>
      ) : mangaQuery.isError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-base font-semibold text-white">
            Could not load manga list
          </Text>
          <Text className="mt-2 text-center text-sm text-[#9B9CA6]">
            {mangaQuery.error.message}
          </Text>
          <PressableScale
            onPress={() => {
              void mangaQuery.refetch();
            }}
          >
            <View className="mt-4 rounded-full border border-[#2A2A2E] bg-[#1A1B1E] px-4 py-2">
              <Text className="text-sm font-medium text-white">Retry</Text>
            </View>
          </PressableScale>
        </View>
      ) : (
        <FlatList
          data={mangaItems}
          numColumns={3}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-8"
          columnWrapperStyle={{ gap: 12 }}
          ItemSeparatorComponent={() => <View className="h-4" />}
          renderItem={({ item }) => (
            <View className="flex-1 pb-2">
              <View className="overflow-hidden rounded-lg bg-[#1A1B1E]">
                <View style={{ aspectRatio: 2 / 3 }}>
                  {item.thumbnailUrl ? (
                    <Image
                      source={{ uri: item.thumbnailUrl }}
                      contentFit="cover"
                      style={{ width: "100%", height: "100%" }}
                      transition={120}
                    />
                  ) : (
                    <View className="h-full w-full items-center justify-center">
                      <Text className="text-xs text-[#6D6E78]">No cover</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text
                numberOfLines={2}
                className="mt-2 pr-1 text-xs font-medium leading-5 text-[#D8D9E0]"
              >
                {item.title}
              </Text>
            </View>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (mangaQuery.hasNextPage && !mangaQuery.isFetchingNextPage) {
              void mangaQuery.fetchNextPage();
            }
          }}
          ListFooterComponent={
            mangaQuery.isFetchingNextPage ? (
              <View className="items-center py-4">
                <ActivityIndicator color="#67A4FF" />
              </View>
            ) : mangaItems.length === 0 ? (
              <View className="items-center py-10">
                <Text className="text-sm text-[#9B9CA6]">
                  No manga found for this source.
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
