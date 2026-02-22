import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  getSourceLatestUpdates,
  getSourcePopularTitles,
  searchSourceManga,
  sourceQueryFactory,
  type SourceManga,
} from "@/services/source";
import { libraryEntriesQueryOptions } from "@/services/library";
import { useSource } from "@/services/source";
import {
  ActionPillButton,
  BackButton,
  CenteredLoadingState,
  CenteredState,
  MangaGridCard,
  ScreenHeader,
  SearchInput,
  SelectableChip,
} from "@/shared/ui";

type BrowseMode = "popular" | "latest" | "search";

const GRID_COLUMNS = 2;
const GRID_HORIZONTAL_PADDING = 16;
const GRID_COLUMN_GAP = 12;

const modeLabelMap: Record<BrowseMode, string> = {
  popular: "Popular",
  latest: "Latest",
  search: "Search",
};

const getDecodedParam = (value: string | string[] | undefined): string => {
  const param = Array.isArray(value) ? value[0] : value;
  if (!param) {
    return "";
  }

  try {
    return decodeURIComponent(param);
  } catch {
    return param;
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

  if (params.supportsLatest) {
    modes.push("latest");
  }

  if (params.supportsPopular) {
    modes.push("popular");
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
  const { width: screenWidth } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{
    sourceId?: string | string[];
    mode?: string | string[];
    q?: string | string[];
  }>();
  const routeSourceId = getDecodedParam(params.sourceId);
  const routeModeParam = getDecodedParam(params.mode);
  const routeQueryParam = getDecodedParam(params.q).trim();

  const { sources, setSelectedSourceId } = useSource();
  const libraryEntriesQuery = useQuery(libraryEntriesQueryOptions());
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
    const isRouteSearch = routeModeParam === "search" && routeQueryParam.length > 0;

    if (supportsSearch && isRouteSearch) {
      setMode("search");
      setSearchInput(routeQueryParam);
      setDebouncedQuery(routeQueryParam);
      return;
    }

    setMode(defaultBrowseMode);
    setSearchInput("");
    setDebouncedQuery("");
  }, [defaultBrowseMode, routeModeParam, routeQueryParam, routeSourceId, supportsSearch]);

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
  const libraryMembershipSet = useMemo(
    () =>
      new Set(
        (libraryEntriesQuery.data ?? []).map((entry) => `${entry.sourceId}::${entry.mangaId}`)
      ),
    [libraryEntriesQuery.data]
  );

  const gridItemWidth = useMemo(() => {
    const totalGaps = GRID_COLUMN_GAP * (GRID_COLUMNS - 1);
    const totalPadding = GRID_HORIZONTAL_PADDING * 2;
    const availableWidth = screenWidth - totalGaps - totalPadding;
    return Math.max(1, Math.floor(availableWidth / GRID_COLUMNS));
  }, [screenWidth]);

  if (!source) {
    return (
      <CenteredState
        title="Source Not Found"
        message="This source is unavailable. It may be hidden by your 18+ source setting."
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="mt-2">
          <BackButton onPress={() => router.back()} variant="pill" />
        </View>
      </CenteredState>
    );
  }

  if (supportedModes.length === 0) {
    return (
      <CenteredState
        title="No Supported Browse Mode"
        message="This source does not expose popular, latest, or search capabilities."
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="mt-2">
          <BackButton onPress={() => router.back()} variant="pill" />
        </View>
      </CenteredState>
    );
  }

  return (
    <View className="flex-1 bg-[#111214]">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-4 pb-2 pt-2">
        <ScreenHeader
          title={source.name}
          subtitle="Manga list from this adapter."
          onBackPress={() => router.back()}
        />
      </View>

      <View className="gap-3 px-4 pb-3">
        <View className="flex-row flex-wrap gap-2">
          {visibleModes.map((itemMode) => (
            <SelectableChip
              key={itemMode}
              label={modeLabelMap[itemMode]}
              selected={mode === itemMode}
              onPress={() => setMode(itemMode)}
            />
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
              <SelectableChip
                key={value}
                label={value}
                selected={statusFilter === value}
                onPress={() => setStatusFilter(value)}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View className="flex-1">
        {isSearchIdle ? (
          <CenteredState
            withBackground={false}
            message="Enter a title to start searching."
          />
        ) : mangaQuery.isPending ? (
          <CenteredLoadingState
            withBackground={false}
            message="Loading manga..."
          />
        ) : mangaQuery.isError ? (
          <CenteredState
            withBackground={false}
            title="Could not load manga list"
            message={mangaQuery.error.message}
          >
            <View className="mt-4">
              <ActionPillButton
                label="Retry"
                onPress={() => {
                  void mangaQuery.refetch();
                }}
              />
            </View>
          </CenteredState>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={mangaItems}
            numColumns={GRID_COLUMNS}
            keyExtractor={(item) => item.id}
            contentContainerClassName="px-4 pb-8"
            columnWrapperStyle={{ gap: GRID_COLUMN_GAP }}
            ItemSeparatorComponent={() => <View className="h-4" />}
            renderItem={({ item }) => (
              <MangaGridCard
                width={gridItemWidth}
                title={item.title}
                thumbnailUrl={item.thumbnailUrl}
                showInLibraryChip={libraryMembershipSet.has(`${routeSourceId}::${item.id}`)}
                onPress={() => {
                  router.push({
                    pathname: "/manga/[sourceId]/[mangaId]",
                    params: {
                      sourceId: routeSourceId,
                      mangaId: item.id,
                    },
                  });
                }}
              />
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
    </View>
  );
}
