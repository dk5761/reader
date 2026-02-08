import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Accordion, Card } from "heroui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import type { ReadingHistoryChapterItem, ReadingHistoryMangaGroup } from "@/services/history";
import { useSource } from "@/services/source";
import {
  ActionPillButton,
  CenteredLoadingState,
  CenteredState,
  ScreenHeader,
} from "@/shared/ui";
import { groupedReadingHistoryQueryOptions } from "../api";

const HISTORY_ENTRY_LIMIT = 100;
const HISTORY_CHAPTER_LIMIT = 5;

const formatRelativeTime = (timestamp: number): string => {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return "just now";
  }

  if (diffMs < hourMs) {
    return `${Math.floor(diffMs / minuteMs)}m ago`;
  }

  if (diffMs < dayMs) {
    return `${Math.floor(diffMs / hourMs)}h ago`;
  }

  if (diffMs < dayMs * 7) {
    return `${Math.floor(diffMs / dayMs)}d ago`;
  }

  return new Date(timestamp).toLocaleDateString();
};

const formatChapterLabel = (chapter: ReadingHistoryChapterItem): string => {
  if (chapter.chapterTitle?.trim()) {
    return chapter.chapterTitle.trim();
  }

  if (chapter.chapterNumber !== undefined) {
    return `Chapter ${chapter.chapterNumber}`;
  }

  return `Chapter ${chapter.chapterId}`;
};

const formatChapterMeta = (chapter: ReadingHistoryChapterItem): string => {
  const parts: string[] = [];

  if (chapter.totalPages && chapter.totalPages > 0) {
    parts.push(`Page ${chapter.pageIndex + 1}/${chapter.totalPages}`);
  } else {
    parts.push(`Page ${chapter.pageIndex + 1}`);
  }

  parts.push(new Date(chapter.updatedAt).toLocaleString());
  return parts.join(" • ");
};

export default function HistoryScreen() {
  const router = useRouter();
  const { sources } = useSource();
  const groupedHistoryQuery = useQuery(
    groupedReadingHistoryQueryOptions({
      entryLimit: HISTORY_ENTRY_LIMIT,
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
              pathname: "/manga/[sourceId]/[mangaId]",
              params: {
                sourceId: item.sourceId,
                mangaId: item.mangaId,
              },
            });
          }}
        >
          <View className="flex-row items-start gap-2.5 border-b border-[#2A2A2E] px-2 py-2">
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
              {item.chapters[0] ? (
                <Text numberOfLines={1} className="mt-1 text-xs text-[#8B8D98]">
                  Latest: {formatChapterLabel(item.chapters[0])}
                </Text>
              ) : null}
            </View>

            <View className="mt-1 h-8 w-8 items-center justify-center rounded-full bg-[#1E2024]">
              <Ionicons name="chevron-forward" size={18} color="#B0B2BD" />
            </View>
          </View>
        </PressableScale>

        <View className="px-2 pb-2 pt-2">
          <Accordion
            selectionMode="single"
            hideSeparator
            isCollapsible
            animation="disable-all"
            className="rounded-xl bg-[#131418]"
          >
            <Accordion.Item value="chapters">
              <Accordion.Trigger className="min-h-0 px-3 py-2.5">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-[#D6D8E1]">Recent chapters</Text>
                  <Text className="mt-0.5 text-xs text-[#8B8D98]">
                    {item.chapters.length} chapter{item.chapters.length === 1 ? "" : "s"}
                  </Text>
                </View>
                <Accordion.Indicator />
              </Accordion.Trigger>

              <Accordion.Content>
                <View className="px-2.5 pb-2">
                  {item.chapters.map((chapter, index) => (
                    <View
                      key={`${chapter.sourceId}::${chapter.mangaId}::${chapter.chapterId}`}
                      className={index === 0 ? "py-1.5" : "border-t border-[#26282D] py-1.5"}
                    >
                      <Text numberOfLines={2} className="text-sm font-medium text-white">
                        {formatChapterLabel(chapter)}
                      </Text>
                      <Text className="mt-1 text-xs text-[#8B8D98]">
                        {formatChapterMeta(chapter)}
                      </Text>
                    </View>
                  ))}
                </View>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
        </View>
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
      />
    </View>
  );
}
