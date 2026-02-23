import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Card, Spinner } from "heroui-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { useMemo } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSource } from "@/services/source";
import {
  ActionPillButton,
  BackButton,
  CenteredLoadingState,
  CenteredState,
  ScreenHeader,
} from "@/shared/ui";
import {
  latestMangaHistoryEntryQueryOptions,
  mangaHistoryEventsInfiniteQueryOptions,
} from "../api";

const HISTORY_TIMELINE_PAGE_SIZE = 50;

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

const formatChapterLabel = (params: {
  chapterTitle?: string;
  chapterNumber?: number;
  chapterId: string;
}): string => {
  if (params.chapterTitle?.trim()) {
    return params.chapterTitle.trim();
  }

  if (params.chapterNumber !== undefined) {
    return `Chapter ${params.chapterNumber}`;
  }

  return `Chapter ${params.chapterId}`;
};

const formatChapterMeta = (params: {
  pageIndex: number;
  totalPages?: number;
  recordedAt: number;
}): string => {
  const parts: string[] = [];

  if (params.totalPages && params.totalPages > 0) {
    parts.push(`Page ${params.pageIndex + 1}/${params.totalPages}`);
  } else {
    parts.push(`Page ${params.pageIndex + 1}`);
  }

  parts.push(new Date(params.recordedAt).toLocaleString());
  return parts.join(" • ");
};

export default function HistoryMangaHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sourceId?: string | string[]; mangaId?: string | string[] }>();
  const sourceId = getDecodedParam(params.sourceId);
  const mangaId = getDecodedParam(params.mangaId);

  const { sources } = useSource();
  const source = useMemo(
    () => sources.find((entry) => entry.id === sourceId) ?? null,
    [sourceId, sources]
  );

  const isEnabled = Boolean(source && sourceId && mangaId);
  const latestEntryQuery = useQuery(
    latestMangaHistoryEntryQueryOptions(
      sourceId || "unknown",
      mangaId || "unknown",
      isEnabled
    )
  );

  const timelineQuery = useInfiniteQuery(
    mangaHistoryEventsInfiniteQueryOptions(
      sourceId || "unknown",
      mangaId || "unknown",
      isEnabled,
      HISTORY_TIMELINE_PAGE_SIZE
    )
  );

  const timelineItems = useMemo(
    () => timelineQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [timelineQuery.data]
  );
  const isRefreshing =
    !timelineQuery.isPending &&
    (timelineQuery.isRefetching || latestEntryQuery.isRefetching);

  if (!source || !sourceId || !mangaId) {
    return (
      <CenteredState
        title="History Not Available"
        message="This source is unavailable. It may be hidden by your 18+ source setting."
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="mt-2">
          <BackButton onPress={() => router.back()} variant="pill" />
        </View>
      </CenteredState>
    );
  }

  const latestEntry = latestEntryQuery.data;
  const timelineFirstItem = timelineItems[0];
  const mangaTitle =
    latestEntry?.mangaTitle || timelineFirstItem?.mangaTitle || "Manga History";
  const mangaThumbnailUrl =
    latestEntry?.mangaThumbnailUrl || timelineFirstItem?.mangaThumbnailUrl;

  if (timelineQuery.isPending && !timelineItems.length) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CenteredLoadingState message="Loading history..." />
      </>
    );
  }

  if (timelineQuery.isError && !timelineItems.length) {
    return (
      <CenteredState
        title="Could not load history"
        message={timelineQuery.error.message}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="mt-4 flex-row gap-2">
          <ActionPillButton
            label="Retry"
            onPress={() => {
              void timelineQuery.refetch();
            }}
          />
          <BackButton onPress={() => router.back()} variant="pill" />
        </View>
      </CenteredState>
    );
  }

  return (
    <View className="flex-1 bg-[#111214]">
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title={mangaTitle}
          subtitle={`${source.name} • ${timelineItems.length} entries`}
          onBackPress={() => router.back()}
        />
      </View>

      <FlatList
        data={timelineItems}
        keyExtractor={(item) => `${item.id}`}
        contentContainerClassName="px-4 pb-8"
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          <Card
            variant="secondary"
            animation="disable-all"
            className="mb-3 overflow-hidden rounded-2xl border border-[#2A2A2E] bg-[#17181B]"
          >
            <Card.Body className="p-3">
              <View className="flex-row items-center gap-3">
                <View className="h-20 w-14 overflow-hidden rounded-lg bg-[#111214]">
                  {mangaThumbnailUrl ? (
                    <Image
                      source={{ uri: mangaThumbnailUrl }}
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
                  <Text numberOfLines={2} className="text-lg font-semibold text-white">
                    {mangaTitle}
                  </Text>
                  <Text className="mt-1 text-xs uppercase tracking-[0.4px] text-[#8B8D98]">
                    {sourceId}
                  </Text>
                </View>
              </View>

              <View className="mt-3">
                <ActionPillButton
                  label="Go to Manga Details"
                  onPress={() => {
                    router.push({
                      pathname: "/manga/[sourceId]/[mangaId]",
                      params: { sourceId, mangaId },
                    });
                  }}
                />
              </View>
            </Card.Body>
          </Card>
        }
        renderItem={({ item }) => (
          <PressableScale
            onPress={() => {
              router.push({
                pathname: "/reader/[sourceId]/[mangaId]/[chapterId]",
                params: {
                  sourceId,
                  mangaId,
                  chapterId: item.chapterId,
                  initialPage: String(item.pageIndex),
                },
              });
            }}
          >
            <Card
              variant="secondary"
              animation="disable-all"
              className="overflow-hidden rounded-xl border border-[#2A2A2E] bg-[#17181B]"
            >
              <Card.Body className="p-3">
                <Text numberOfLines={2} className="text-base font-semibold text-white">
                  {formatChapterLabel({
                    chapterTitle: item.chapterTitle,
                    chapterNumber: item.chapterNumber,
                    chapterId: item.chapterId,
                  })}
                </Text>
                <Text className="mt-1 text-xs text-[#8B8D98]">
                  {formatChapterMeta({
                    pageIndex: item.pageIndex,
                    totalPages: item.totalPages,
                    recordedAt: item.recordedAt,
                  })}
                </Text>
              </Card.Body>
            </Card>
          </PressableScale>
        )}
        ListEmptyComponent={
          <View className="items-center py-8">
            <Text className="text-center text-sm text-[#9B9CA6]">
              No chapter history for this manga yet.
            </Text>
          </View>
        }
        ListFooterComponent={
          timelineQuery.hasNextPage ? (
            <View className="items-center pt-3">
              {timelineQuery.isFetchingNextPage ? (
                <Spinner size="sm" color="#67A4FF" />
              ) : (
                <ActionPillButton
                  label="Load More"
                  onPress={() => {
                    void timelineQuery.fetchNextPage();
                  }}
                />
              )}
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            tintColor="#67A4FF"
            refreshing={isRefreshing}
            onRefresh={() => {
              if (timelineQuery.isPending) {
                return;
              }
              void Promise.all([latestEntryQuery.refetch(), timelineQuery.refetch()]);
            }}
          />
        }
      />
    </View>
  );
}
