import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { SourceDescriptor } from "@/services/source";
import { ActionPillButton } from "@/shared/ui";
import { globalSourceSearchPreviewQueryOptions } from "../api";
import { GlobalSearchMangaCard } from "./GlobalSearchMangaCard";

const ROW_CARD_COUNT = 2;
const CARD_WIDTH = 136;
const CARD_IMAGE_HEIGHT = 204;
const CARD_HEIGHT = 254;
const ROW_GAP = 12;
const RAIL_HEIGHT = CARD_HEIGHT * ROW_CARD_COUNT + ROW_GAP;

interface GlobalSearchSourceSectionProps {
  source: SourceDescriptor;
  query: string;
  enabled: boolean;
}

export const GlobalSearchSourceSection = ({
  source,
  query,
  enabled,
}: GlobalSearchSourceSectionProps) => {
  const router = useRouter();
  const mangaQuery = useQuery(
    globalSourceSearchPreviewQueryOptions({
      sourceId: source.id,
      query,
      enabled,
    })
  );

  const mangaItems = useMemo(
    () => mangaQuery.data?.items ?? [],
    [mangaQuery.data]
  );

  const railColumns = useMemo(() => {
    const columns: typeof mangaItems[] = [];
    for (let index = 0; index < mangaItems.length; index += ROW_CARD_COUNT) {
      columns.push(mangaItems.slice(index, index + ROW_CARD_COUNT));
    }
    return columns;
  }, [mangaItems]);

  const showSeeAll = Boolean(mangaQuery.data?.hasNextPage);

  return (
    <View className="mt-4">
      <View className="mb-3 flex-row items-end justify-between">
        <Text className="text-base font-semibold text-white">{source.name}</Text>
        <Text className="text-xs text-[#8B8D98]">
          {mangaItems.length}
          {showSeeAll ? "+" : ""} result{mangaItems.length === 1 ? "" : "s"}
        </Text>
      </View>

      {mangaQuery.isPending ? (
        <View className="items-center rounded-xl border border-[#2A2A2E] bg-[#16171A] py-6">
          <ActivityIndicator color="#67A4FF" />
          <Text className="mt-2 text-xs text-[#9B9CA6]">Searching {source.name}...</Text>
        </View>
      ) : mangaQuery.isError ? (
        <View className="rounded-xl border border-[#3A2A2E] bg-[#1A1617] p-4">
          <Text className="text-sm text-[#F1C3C3]">
            {mangaQuery.error.message || "Could not load results for this source."}
          </Text>
          <View className="mt-3 self-start">
            <ActionPillButton
              label="Retry"
              onPress={() => {
                void mangaQuery.refetch();
              }}
            />
          </View>
        </View>
      ) : mangaItems.length === 0 ? (
        <View className="rounded-xl border border-[#2A2A2E] bg-[#16171A] py-5">
          <Text className="text-center text-xs text-[#9B9CA6]">No results from this source.</Text>
        </View>
      ) : (
        <View className="rounded-xl border border-[#2A2A2E] bg-[#16171A] p-3">
          <ScrollView
            horizontal
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            style={{ width: "100%", maxHeight: RAIL_HEIGHT }}
            contentContainerClassName="pr-1"
          >
            <View className="flex-row gap-3">
              {railColumns.map((column, columnIndex) => (
                <View key={`${source.id}-column-${columnIndex}`} className="gap-3">
                  {column.map((manga) => (
                    <GlobalSearchMangaCard
                      key={`${source.id}::${manga.id}`}
                      sourceId={source.id}
                      manga={manga}
                      width={CARD_WIDTH}
                      height={CARD_HEIGHT}
                      imageHeight={CARD_IMAGE_HEIGHT}
                    />
                  ))}
                </View>
              ))}

              {showSeeAll ? (
                <Pressable
                  onPress={() => {
                    router.push({
                      pathname: "/source/[sourceId]",
                      params: {
                        sourceId: source.id,
                        mode: "search",
                        q: query.trim(),
                      },
                    });
                  }}
                >
                  <View
                    style={{ width: CARD_WIDTH, height: RAIL_HEIGHT }}
                    className="items-center justify-center rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] px-3"
                  >
                    <Ionicons name="arrow-forward-circle-outline" size={26} color="#67A4FF" />
                    <Text className="mt-2 text-center text-sm font-semibold text-white">
                      See all in {source.name}
                    </Text>
                    <Text className="mt-1 text-center text-xs text-[#8B8D98]">
                      Open full source search
                    </Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>

          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-xs text-[#8B8D98]">Page 1 preview</Text>
            {!showSeeAll ? (
              <Text className="text-xs text-[#8B8D98]">No more results</Text>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
};
