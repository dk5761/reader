import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  SourceCapabilityError,
  getSourceLatestUpdates,
  getSourcePopularTitles,
  searchSourceManga,
  sourceQueryFactory,
  type SourceManga,
} from "@/services/source";
import { useSource } from "@/services/source";

type BrowseMode = "popular" | "latest" | "search";

interface BrowsePageResult {
  items: SourceManga[];
  page: number;
  hasNextPage: boolean;
  mode: BrowseMode;
}

const fetchSourceBrowsePage = async (
  sourceId: string,
  page: number
): Promise<BrowsePageResult> => {
  try {
    const popularResult = await getSourcePopularTitles(sourceId, { page });
    return {
      ...popularResult,
      mode: "popular",
    };
  } catch (error) {
    if (!(error instanceof SourceCapabilityError)) {
      throw error;
    }
  }

  try {
    const latestResult = await getSourceLatestUpdates(sourceId, { page });
    return {
      ...latestResult,
      mode: "latest",
    };
  } catch (error) {
    if (!(error instanceof SourceCapabilityError)) {
      throw error;
    }
  }

  const searchResult = await searchSourceManga(sourceId, {
    page,
    query: "",
  });

  return {
    ...searchResult,
    mode: "search",
  };
};

const modeLabelMap: Record<BrowseMode, string> = {
  popular: "Popular",
  latest: "Latest",
  search: "Search",
};

export default function BrowseTabScreen() {
  const { sources, selectedSourceId, setSelectedSourceId } = useSource();

  const browseQuery = useInfiniteQuery({
    queryKey: selectedSourceId
      ? sourceQueryFactory.popular(selectedSourceId, { page: 1 })
      : sourceQueryFactory.all(),
    queryFn: ({ pageParam = 1 }) => {
      if (!selectedSourceId) {
        return Promise.resolve({
          items: [],
          page: 1,
          hasNextPage: false,
          mode: "popular" as BrowseMode,
        });
      }

      return fetchSourceBrowsePage(selectedSourceId, pageParam);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    enabled: Boolean(selectedSourceId),
  });

  const mangaItems = useMemo(
    () => browseQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [browseQuery.data]
  );

  const activeMode = browseQuery.data?.pages[0]?.mode;

  if (!sources.length) {
    return (
      <View className="flex-1 items-center justify-center bg-[#111214] px-6">
        <Text className="text-xl font-semibold text-white">Browse</Text>
        <Text className="mt-2 text-center text-sm text-[#9B9CA6]">
          No source adapters are registered.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-4 pb-3 pt-2">
        <Text className="text-2xl font-bold text-white">Browse</Text>
        <Text className="mt-1 text-sm text-[#9B9CA6]">
          Pick a source and load manga titles.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 pb-3"
      >
        {sources.map((source) => {
          const isSelected = source.id === selectedSourceId;
          return (
            <Pressable
              key={source.id}
              className={`rounded-full border px-4 py-2 ${
                isSelected
                  ? "border-[#67A4FF] bg-[#67A4FF]/20"
                  : "border-[#2A2A2E] bg-[#1A1B1E]"
              }`}
              onPress={() => setSelectedSourceId(source.id)}
            >
              <Text
                className={`text-sm font-medium ${
                  isSelected ? "text-[#84B6FF]" : "text-[#D2D2D8]"
                }`}
              >
                {source.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {activeMode ? (
        <View className="px-4 pb-2">
          <Text className="text-xs text-[#8B8D98]">
            Mode: {modeLabelMap[activeMode]}
          </Text>
        </View>
      ) : null}

      {browseQuery.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#67A4FF" />
          <Text className="mt-3 text-sm text-[#9B9CA6]">Loading manga...</Text>
        </View>
      ) : browseQuery.isError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-base font-semibold text-white">
            Could not load this source
          </Text>
          <Text className="mt-2 text-center text-sm text-[#9B9CA6]">
            {browseQuery.error.message}
          </Text>
          <Pressable
            className="mt-4 rounded-full border border-[#2A2A2E] bg-[#1A1B1E] px-4 py-2"
            onPress={() => {
              void browseQuery.refetch();
            }}
          >
            <Text className="text-sm font-medium text-white">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={mangaItems}
          numColumns={3}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-4 pb-8"
          columnWrapperStyle={{ gap: 8 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item }) => (
            <View className="flex-1">
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
                className="mt-2 text-xs font-medium text-[#D8D9E0]"
              >
                {item.title}
              </Text>
            </View>
          )}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (browseQuery.hasNextPage && !browseQuery.isFetchingNextPage) {
              void browseQuery.fetchNextPage();
            }
          }}
          ListFooterComponent={
            browseQuery.isFetchingNextPage ? (
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
