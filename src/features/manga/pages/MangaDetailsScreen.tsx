import {
  libraryEntryQueryOptions,
  useRemoveLibraryEntryMutation,
  useUpsertLibraryEntryMutation,
} from "@/services/library";
import {
  latestMangaProgressQueryOptions,
  mangaReadingProgressQueryOptions,
  useSetBelowChaptersReadStateMutation,
  useSetChapterReadStateMutation,
} from "@/services/progress";
import {
  getSourceChapters,
  getSourceMangaDetails,
  sourceQueryFactory,
  useSource,
  type SourceChapter,
} from "@/services/source";
import {
  ActionPillButton,
  BackButton,
  CenteredLoadingState,
  CenteredState,
  CollapsibleText,
} from "@/shared/ui";
import { getDecodedParam } from "@/shared/utils";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  ListRenderItemInfo,
  Text,
  View,
} from "react-native";
import { Pressable as GesturePressable } from "react-native-gesture-handler";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

const CHAPTERS_PAGE_SIZE = 50;
const SWIPE_ACTION_WIDTH = 224;
const SWIPE_ACTION_COLUMN_WIDTH = 108;
const SECTION_VISIBILITY_BUFFER = 8;

interface PendingBelowRule {
  anchorIndex: number;
  targetReadState: boolean;
  opId: number;
}

const formatChapterMeta = (chapter: SourceChapter): string => {
  const parts: string[] = [];
  if (chapter.number !== undefined) {
    parts.push(`Ch ${chapter.number}`);
  }
  if (chapter.uploadedAt) {
    parts.push(chapter.uploadedAt);
  }
  if (chapter.scanlator) {
    parts.push(chapter.scanlator);
  }
  return parts.join(" • ");
};

export default function MangaDetailsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    sourceId?: string | string[];
    mangaId?: string | string[];
  }>();
  const sourceId = getDecodedParam(params.sourceId);
  const mangaId = getDecodedParam(params.mangaId);

  const { sources, setSelectedSourceId } = useSource();
  const source = useMemo(
    () => sources.find((entry) => entry.id === sourceId) ?? null,
    [sourceId, sources],
  );

  const [chaptersPage, setChaptersPage] = useState(1);
  const [sectionABottomOffset, setSectionABottomOffset] = useState(0);
  const [isSectionAVisible, setIsSectionAVisible] = useState(true);
  const headerExpandProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setChaptersPage(1);
  }, [mangaId, sourceId]);

  useEffect(() => {
    setIsSectionAVisible(true);
    setSectionABottomOffset(0);
    headerExpandProgress.setValue(0);
  }, [headerExpandProgress, mangaId, sourceId]);

  useEffect(() => {
    Animated.timing(headerExpandProgress, {
      toValue: isSectionAVisible ? 0 : 1,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [headerExpandProgress, isSectionAVisible]);

  useEffect(() => {
    if (!source) {
      return;
    }
    setSelectedSourceId(source.id);
  }, [setSelectedSourceId, source]);

  const detailsQuery = useQuery({
    queryKey: sourceQueryFactory.manga(
      sourceId || "unknown",
      mangaId || "unknown",
    ),
    queryFn: ({ signal }) => getSourceMangaDetails(sourceId, mangaId, signal),
    enabled: Boolean(source && sourceId && mangaId),
  });

  const libraryEntryQuery = useQuery(
    libraryEntryQueryOptions(
      sourceId || "unknown",
      mangaId || "unknown",
      Boolean(source && sourceId && mangaId),
    ),
  );
  const upsertLibraryMutation = useUpsertLibraryEntryMutation();
  const removeLibraryMutation = useRemoveLibraryEntryMutation();

  const chaptersQuery = useQuery({
    queryKey: sourceQueryFactory.chapters(
      sourceId || "unknown",
      mangaId || "unknown",
    ),
    queryFn: ({ signal }) => getSourceChapters(sourceId, mangaId, signal),
    enabled: Boolean(source && sourceId && mangaId),
  });
  const latestProgressQuery = useQuery(
    latestMangaProgressQueryOptions(
      sourceId || "unknown",
      mangaId || "unknown",
      Boolean(source && sourceId && mangaId),
    ),
  );
  const mangaProgressQuery = useQuery(
    mangaReadingProgressQueryOptions(
      sourceId || "unknown",
      mangaId || "unknown",
      Boolean(source && sourceId && mangaId),
    ),
  );
  const setChapterReadStateMutation = useSetChapterReadStateMutation();
  const setBelowChaptersReadStateMutation =
    useSetBelowChaptersReadStateMutation();
  const [pendingBelowRule, setPendingBelowRule] =
    useState<PendingBelowRule | null>(null);

  const allChapters = useMemo(() => {
    const chapters = chaptersQuery.data ?? [];
    const seen = new Set<string>();

    return chapters.filter((chapter) => {
      const key = `${chapter.id}::${chapter.url}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [chaptersQuery.data]);

  const totalChapterPages = Math.max(
    1,
    Math.ceil(allChapters.length / CHAPTERS_PAGE_SIZE),
  );
  const visibleChapters = useMemo(
    () => allChapters.slice(0, chaptersPage * CHAPTERS_PAGE_SIZE),
    [allChapters, chaptersPage],
  );
  const hasMoreChapters = visibleChapters.length < allChapters.length;
  const progressByChapterId = useMemo(
    () =>
      new Map(
        (mangaProgressQuery.data ?? []).map((entry) => [
          entry.chapterId,
          entry,
        ]),
      ),
    [mangaProgressQuery.data],
  );
  const effectiveReadByChapterId = useMemo(() => {
    const map = new Map<string, boolean>();
    allChapters.forEach((chapter, index) => {
      const baseReadState = Boolean(
        progressByChapterId.get(chapter.id)?.isCompleted,
      );
      if (!pendingBelowRule) {
        map.set(chapter.id, baseReadState);
        return;
      }

      const isBelowPendingAnchor = index > pendingBelowRule.anchorIndex;
      map.set(
        chapter.id,
        isBelowPendingAnchor ? pendingBelowRule.targetReadState : baseReadState,
      );
    });
    return map;
  }, [allChapters, pendingBelowRule, progressByChapterId]);
  const areAllBelowReadByIndex = useMemo(() => {
    if (allChapters.length === 0) {
      return [] as boolean[];
    }

    const result = new Array<boolean>(allChapters.length).fill(true);
    for (let index = allChapters.length - 2; index >= 0; index -= 1) {
      const nextChapterId = allChapters[index + 1]?.id;
      const nextIsRead = nextChapterId
        ? Boolean(effectiveReadByChapterId.get(nextChapterId))
        : true;
      result[index] = result[index + 1] && nextIsRead;
    }
    return result;
  }, [allChapters, effectiveReadByChapterId]);
  const isReadStateMutationPending =
    setChapterReadStateMutation.isPending ||
    setBelowChaptersReadStateMutation.isPending;

  useEffect(() => {
    setPendingBelowRule(null);
  }, [mangaId, sourceId]);

  const handleBackDuringLoading = () => {
    const mangaQueryKey = sourceQueryFactory.manga(
      sourceId || "unknown",
      mangaId || "unknown",
    );
    const chaptersQueryKey = sourceQueryFactory.chapters(
      sourceId || "unknown",
      mangaId || "unknown",
    );

    void queryClient.cancelQueries({ queryKey: mangaQueryKey });
    void queryClient.cancelQueries({ queryKey: chaptersQueryKey });
    router.back();
  };

  if (!source || !sourceId || !mangaId) {
    return (
      <CenteredState
        title="Manga Not Found"
        message="Missing or hidden source/manga identifier."
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="mt-2">
          <BackButton onPress={() => router.back()} variant="pill" />
        </View>
      </CenteredState>
    );
  }

  if (detailsQuery.isPending || chaptersQuery.isPending) {
    return (
      <View className="flex-1 bg-[#111214]">
        <Stack.Screen options={{ headerShown: false }} />
        <View className="px-4 pb-2 pt-2">
          <BackButton onPress={handleBackDuringLoading} />
        </View>
        <CenteredLoadingState
          withBackground={false}
          message="Loading manga details..."
        />
      </View>
    );
  }

  if (detailsQuery.isError || chaptersQuery.isError || !detailsQuery.data) {
    const errorMessage =
      detailsQuery.error?.message ?? chaptersQuery.error?.message;
    return (
      <CenteredState
        title="Could not load manga"
        message={errorMessage ?? "Unknown error."}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View className="mt-4 flex-row gap-2">
          <ActionPillButton
            label="Retry"
            onPress={() => {
              void detailsQuery.refetch();
              void chaptersQuery.refetch();
            }}
          />
          <BackButton onPress={() => router.back()} variant="pill" />
        </View>
      </CenteredState>
    );
  }

  const details = detailsQuery.data;
  const isInLibrary = Boolean(libraryEntryQuery.data);
  const latestProgress = latestProgressQuery.data;
  const isLibraryMutationPending =
    upsertLibraryMutation.isPending || removeLibraryMutation.isPending;
  const headerPaddingBottom = headerExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 8],
  });
  const titleOpacity = headerExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const titleHeight = headerExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 24],
  });
  const titleMarginTop = headerExpandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });

  const renderChapterItem = ({
    item,
    index,
  }: ListRenderItemInfo<SourceChapter>) => {
    const isChapterRead = Boolean(effectiveReadByChapterId.get(item.id));
    const hasBelowChapters = index < allChapters.length - 1;
    const allBelowRead = hasBelowChapters
      ? Boolean(areAllBelowReadByIndex[index])
      : false;
    const shouldMarkBelowAsRead = hasBelowChapters ? !allBelowRead : false;
    const belowChapterInputs = hasBelowChapters
      ? allChapters
          .slice(index + 1)
          .filter((chapter, chapterIndex, chapterArray) => {
            return (
              chapterArray.findIndex(
                (candidate) => candidate.id === chapter.id,
              ) === chapterIndex
            );
          })
          .map((chapter) => ({
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            chapterNumber: chapter.number,
          }))
      : [];

    const handleSingleChapterToggle = (swipeableMethods: SwipeableMethods) => {
      if (isReadStateMutationPending) {
        return;
      }

      swipeableMethods.close();
      setChapterReadStateMutation.mutate({
        sourceId,
        mangaId,
        chapterId: item.id,
        chapterTitle: item.title,
        chapterNumber: item.number,
        markAsRead: !isChapterRead,
      });
    };

    const handleBelowToggle = (swipeableMethods: SwipeableMethods) => {
      if (isReadStateMutationPending || belowChapterInputs.length === 0) {
        return;
      }

      const opId = Date.now();
      const targetReadState = shouldMarkBelowAsRead;
      setPendingBelowRule({
        anchorIndex: index,
        targetReadState,
        opId,
      });
      swipeableMethods.close();

      setBelowChaptersReadStateMutation.mutate(
        {
          sourceId,
          mangaId,
          chapters: belowChapterInputs,
          markAsRead: targetReadState,
        },
        {
          onError: () => {
            setPendingBelowRule((currentRule) => {
              if (!currentRule || currentRule.opId !== opId) {
                return currentRule;
              }
              return null;
            });
          },
          onSettled: () => {
            setPendingBelowRule((currentRule) => {
              if (!currentRule || currentRule.opId !== opId) {
                return currentRule;
              }
              return null;
            });
          },
        },
      );
    };

    return (
      <Swipeable
        enabled={!isReadStateMutationPending}
        friction={1.6}
        rightThreshold={40}
        dragOffsetFromRightEdge={18}
        dragOffsetFromLeftEdge={18}
        overshootRight={false}
        containerStyle={{ borderRadius: 12 }}
        renderRightActions={(_progress, _translation, swipeableMethods) => (
          <View
            style={{ width: SWIPE_ACTION_WIDTH }}
            className="ml-2 h-full flex-row items-stretch gap-2"
          >
            <PressableScale
              onPress={() => {
                handleSingleChapterToggle(swipeableMethods);
              }}
            >
              <View
                style={{ width: SWIPE_ACTION_COLUMN_WIDTH }}
                className={`rounded-xl px-3 py-3 ${
                  isChapterRead ? "bg-[#3B2024]" : "bg-[#1F3A2A]"
                } h-full items-center justify-center`}
              >
                <Ionicons
                  name={isChapterRead ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#FFFFFF"
                />
                <Text className="mt-1 text-center text-xs font-semibold text-white">
                  {isChapterRead ? "Mark Unread" : "Mark Read"}
                </Text>
              </View>
            </PressableScale>

            {hasBelowChapters ? (
              <PressableScale
                onPress={() => {
                  handleBelowToggle(swipeableMethods);
                }}
              >
                <View
                  style={{ width: SWIPE_ACTION_COLUMN_WIDTH }}
                  className="h-full items-center justify-center rounded-xl bg-[#2A2D36] px-3 py-3"
                >
                  <Ionicons
                    name="arrow-down-circle-outline"
                    size={18}
                    color="#FFFFFF"
                  />
                  <Text className="mt-1 text-center text-xs font-semibold text-white">
                    {shouldMarkBelowAsRead
                      ? "Mark Below as Read"
                      : "Mark Below as Unread"}
                  </Text>
                </View>
              </PressableScale>
            ) : (
              <View
                style={{ width: SWIPE_ACTION_COLUMN_WIDTH }}
                className="h-full items-center justify-center rounded-xl bg-[#1A1B1E]"
              >
                <Ionicons
                  name="remove-circle-outline"
                  size={18}
                  color="#7E808A"
                />
                <Text className="mt-1 text-center text-xs font-semibold text-[#7E808A]">
                  No Below
                </Text>
              </View>
            )}
          </View>
        )}
      >
        <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] px-3 py-3">
          <GesturePressable
            hitSlop={4}
            onPress={() => {
              const shouldResumeCurrentChapter =
                latestProgress?.chapterId === item.id;
              router.push({
                pathname: "/reader/[sourceId]/[mangaId]/[chapterId]",
                params: {
                  sourceId,
                  mangaId,
                  chapterId: item.id,
                  initialPage: shouldResumeCurrentChapter
                    ? String(latestProgress.pageIndex)
                    : "0",
                },
              });
            }}
          >
            <View>
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-sm font-medium text-white">
                  {item.title}
                </Text>
                <View
                  className={`rounded-full px-2 py-0.5 ${
                    isChapterRead
                      ? "border border-[#27553A] bg-[#173224]"
                      : "border border-[#2A2A2E] bg-[#141519]"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-semibold ${
                      isChapterRead ? "text-[#7BEEB0]" : "text-[#9B9CA6]"
                    }`}
                  >
                    {isChapterRead ? "Read" : "Unread"}
                  </Text>
                </View>
              </View>

              {formatChapterMeta(item) ? (
                <Text className="mt-1 text-xs text-[#9B9CA6]">
                  {formatChapterMeta(item)}
                </Text>
              ) : null}
            </View>
          </GesturePressable>
        </View>
      </Swipeable>
    );
  };

  return (
    <View className="flex-1 bg-[#111214]">
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View
        className="border-b border-[#1E2024] bg-[#111214] px-4"
        style={{ paddingBottom: headerPaddingBottom }}
      >
        <BackButton onPress={() => router.back()} compact />
        <Animated.View
          style={{
            marginTop: titleMarginTop,
            height: titleHeight,
            opacity: titleOpacity,
            overflow: "hidden",
            justifyContent: "center",
          }}
        >
          <Text
            numberOfLines={1}
            className="text-base font-semibold text-white"
          >
            {details.title}
          </Text>
        </Animated.View>
      </Animated.View>

      <FlatList
        style={{ flex: 1 }}
        data={visibleChapters}
        keyExtractor={(item, index) => `${item.id}::${item.url || index}`}
        renderItem={renderChapterItem}
        contentContainerClassName="px-4 pb-8"
        ItemSeparatorComponent={() => <View className="h-2" />}
        onScroll={(event) => {
          if (sectionABottomOffset <= 0) {
            return;
          }

          const offsetY = event.nativeEvent.contentOffset.y;
          const nextSectionAVisible =
            offsetY + SECTION_VISIBILITY_BUFFER < sectionABottomOffset;
          if (nextSectionAVisible !== isSectionAVisible) {
            setIsSectionAVisible(nextSectionAVisible);
          }
        }}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View className="pb-4 pt-3">
            <View
              className="flex-row gap-3"
              onLayout={(event) => {
                const { y, height } = event.nativeEvent.layout;
                const nextBottomOffset = y + height;
                if (nextBottomOffset !== sectionABottomOffset) {
                  setSectionABottomOffset(nextBottomOffset);
                }
              }}
            >
              <View className="w-24 overflow-hidden rounded-lg bg-[#1A1B1E]">
                <View>
                  {details.thumbnailUrl ? (
                    <Image
                      source={{ uri: details.thumbnailUrl }}
                      contentFit="cover"
                      style={{ width: "100%", height: 170 }}
                    />
                  ) : (
                    <View className="h-full items-center justify-center">
                      <Text className="text-xs text-[#6D6E78]">No cover</Text>
                    </View>
                  )}
                </View>
              </View>

              <View className="flex-1">
                <Text className="text-xl font-bold text-white">
                  {details.title}
                </Text>
                <Text className="mt-1 text-xs text-[#9B9CA6]">
                  {source.name}
                </Text>
                <View className="mt-3 self-start">
                  <View className="flex-row flex-wrap gap-2">
                    <ActionPillButton
                      compact
                      label={
                        isLibraryMutationPending
                          ? "Saving..."
                          : isInLibrary
                            ? "Remove from Library"
                            : "Add to Library"
                      }
                      onPress={() => {
                        if (isLibraryMutationPending) {
                          return;
                        }

                        if (isInLibrary) {
                          removeLibraryMutation.mutate({
                            sourceId,
                            mangaId,
                          });
                          return;
                        }

                        upsertLibraryMutation.mutate({
                          sourceId,
                          mangaId,
                          mangaUrl: details.url,
                          title: details.title,
                          thumbnailUrl: details.thumbnailUrl,
                          description: details.description,
                          status: details.status,
                        });
                      }}
                    />

                    {latestProgress ? (
                      <ActionPillButton
                        compact
                        label="Continue"
                        onPress={() => {
                          router.push({
                            pathname:
                              "/reader/[sourceId]/[mangaId]/[chapterId]",
                            params: {
                              sourceId,
                              mangaId,
                              chapterId: latestProgress.chapterId,
                              initialPage: String(latestProgress.pageIndex),
                            },
                          });
                        }}
                      />
                    ) : null}
                  </View>
                </View>
                {details.status ? (
                  <Text className="mt-2 text-xs text-[#C8C9D2]">
                    Status: {details.status}
                  </Text>
                ) : null}
                {details.authors?.length ? (
                  <Text className="mt-1 text-xs text-[#C8C9D2]">
                    Author: {details.authors.join(", ")}
                  </Text>
                ) : null}
              </View>
            </View>

            {details.description ? (
              <CollapsibleText
                text={details.description}
                collapsedLines={3}
                textClassName="mt-4 text-sm leading-6 text-[#D0D1D8]"
              />
            ) : null}

            {details.genres?.length ? (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {details.genres.map((genre) => (
                  <View
                    key={genre}
                    className="rounded-full border border-[#2A2A2E] bg-[#1A1B1E] px-3 py-1"
                  >
                    <Text className="text-xs text-[#C8C9D2]">{genre}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View className="mt-5 flex-row items-end justify-between">
              <Text className="text-lg font-semibold text-white">Chapters</Text>
              <Text className="text-xs text-[#8B8D98]">
                Page {Math.min(chaptersPage, totalChapterPages)} of{" "}
                {totalChapterPages}
              </Text>
            </View>
            <Text className="mt-1 text-xs text-[#9B9CA6]">
              Showing {visibleChapters.length} / {allChapters.length}
            </Text>
          </View>
        }
        ListFooterComponent={
          hasMoreChapters ? (
            <View className="pt-3">
              <PressableScale
                onPress={() => {
                  setChaptersPage((prev) => prev + 1);
                }}
              >
                <View className="items-center rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] px-4 py-3">
                  <Text className="text-sm font-medium text-white">
                    Load More Chapters
                  </Text>
                </View>
              </PressableScale>
            </View>
          ) : allChapters.length > 0 ? (
            <View className="items-center pt-4">
              <Text className="text-xs text-[#8B8D98]">
                All chapters loaded
              </Text>
            </View>
          ) : (
            <View className="items-center pt-4">
              <Text className="text-xs text-[#9B9CA6]">
                No chapters available.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
