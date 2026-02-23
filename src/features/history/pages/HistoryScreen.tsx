import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Card } from "heroui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import type { ReadingHistoryMangaGroup } from "@/services/history";
import { useSource } from "@/services/source";
import {
  ActionPillButton,
  CenteredLoadingState,
  CenteredState,
  ScreenHeader,
} from "@/shared/ui";
import { groupedReadingHistoryQueryOptions } from "../api";
import { formatRelativeTime } from "@/shared/utils";

const INITIAL_HISTORY_ENTRY_LIMIT = 20;
const HISTORY_CHAPTER_LIMIT = 5;
const LOAD_MORE_INCREMENT = 20;

export default function HistoryScreen() {
  const router = useRouter();
  const { sources } = useSource();
  const [entryLimit, setEntryLimit] = useState(INITIAL_HISTORY_ENTRY_LIMIT);

  const groupedHistoryQuery = useQuery(
    groupedReadingHistoryQueryOptions({
      entryLimit,
      perMangaChapterLimit: HISTORY_CHAPTER_LIMIT,
    })
  );

  const allowedSourceIds = useMemo(
    () => new Set(sources.map((source) => source.id)),
    [sources]
  );

  const allGroups = groupedHistoryQuery.data;
  const visibleGroups = useMemo(
    () => (allGroups ?? []).filter((group) => allowedSourceIds.has(group.sourceId)),
    [allGroups, allowedSourceIds]
  );

  const hasMore = visibleGroups.length >= entryLimit;
  const isLoadingMore = groupedHistoryQuery.isFetching;
  const isRefreshing = groupedHistoryQuery.isRefetching && !groupedHistoryQuery.isPending;

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      setEntryLimit((prev) => prev + LOAD_MORE_INCREMENT);
    }
  };

  const renderItem = ({ item }: { item: ReadingHistoryMangaGroup }) => (
    <Card
      variant="secondary"
      animation="disable-all"
      className="overflow-hidden rounded-2xl border border-[#2A2A2E] bg-[#17181B]"
    >
      <Card.Body className="p-0">
        <PressableScale
          onPress={() => {
            router.push({
              pathname: "/history/[sourceId]/[mangaId]",
              params: {
                sourceId: item.sourceId,
                mangaId: item.mangaId,
              },
            });
          }}
        >
          <View className="flex-row items-start gap-2.5 px-2 py-2">
            <View className="h-20 w-14 overflow-hidden rounded-lg bg-[#111214]">
              {item.mangaThumbnailUrl ? (
                <Image
                  source={{ uri: item.mangaThumbnailUrl }}
                  contentFit="cover"
                  style={{ width: "100%", height: "100%" }}
                  transition={120}
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Text className="text-[10px] text-[#6D6E78]">No cover</Text>
                </View>
              )}
            </View>

            <View className="flex-1">
              <Text numberOfLines={2} className="text-xl font-semibold text-white">
                {item.mangaTitle}
              </Text>
              <Text className="mt-1 text-xs uppercase tracking-[0.4px] text-[#8B8D98]">
                {item.sourceId}
              </Text>
              <Text className="mt-1.5 text-xs text-[#B0B2BD]">
                Last read {formatRelativeTime(item.latestReadAt)}
              </Text>
              <Text className="mt-1 text-xs text-[#8B8D98]">
                Tap to view chapter history
              </Text>
            </View>

            <View className="mt-1 h-8 w-8 items-center justify-center rounded-full bg-[#1E2024]">
              <Ionicons name="chevron-forward" size={18} color="#B0B2BD" />
            </View>
          </View>
        </PressableScale>
      </Card.Body>
    </Card>
  );

  if (groupedHistoryQuery.isPending) {
    return <CenteredLoadingState message="Loading history..." withBackground={false} />;
  }

  if (groupedHistoryQuery.isError) {
    return (
      <CenteredState
        withBackground={false}
        title="Could not load history"
        message={groupedHistoryQuery.error?.message}
      >
        <View className="mt-4">
          <ActionPillButton
            label="Retry"
            onPress={() => {
              void groupedHistoryQuery.refetch();
            }}
          />
        </View>
      </CenteredState>
    );
  }

  const isHiddenByPolicy = (allGroups?.length ?? 0) > 0 && visibleGroups.length === 0;

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-3 pb-2.5 pt-2">
        <ScreenHeader
          title="History"
          subtitle="Recent reading activity grouped by manga."
        />
      </View>

      <FlatList
        data={visibleGroups}
        keyExtractor={(item) => `${item.sourceId}::${item.mangaId}`}
        contentContainerClassName="px-3 pb-8"
        ItemSeparatorComponent={() => <View className="h-2" />}
        renderItem={renderItem}
        ListEmptyComponent={
          <View className="items-center py-10">
            <Text className="text-center text-sm text-[#9B9CA6]">
              {isHiddenByPolicy
                ? "History is currently hidden by your 18+ source setting."
                : "No reading history yet."}
            </Text>
          </View>
        }
        ListFooterComponent={
          hasMore && visibleGroups.length > 0 ? (
            <View className="pt-4">
              <PressableScale onPress={loadMore}>
                <View className="items-center rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] px-4 py-3">
                  <Text className="text-sm font-medium text-white">
                    {isLoadingMore ? "Loading..." : "Load More"}
                  </Text>
                </View>
              </PressableScale>
            </View>
          ) : visibleGroups.length > 0 ? (
            <View className="items-center pt-4">
              <Text className="text-xs text-[#8B8D98]">All history loaded</Text>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            tintColor="#67A4FF"
            refreshing={isRefreshing}
            onRefresh={() => {
              if (groupedHistoryQuery.isPending) {
                return;
              }
              void groupedHistoryQuery.refetch();
            }}
          />
        }
      />
    </View>
  );
}
