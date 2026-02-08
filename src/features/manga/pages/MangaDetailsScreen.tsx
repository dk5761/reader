import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { useEffect, useMemo, useState } from "react";
import { FlatList, ListRenderItemInfo, Text, View } from "react-native";
import {
  libraryEntryQueryOptions,
  useRemoveLibraryEntryMutation,
  useUpsertLibraryEntryMutation,
} from "@/services/library";
import {
  getSourceChapters,
  getSourceMangaDetails,
  sourceQueryFactory,
  type SourceChapter,
} from "@/services/source";
import { useSource } from "@/services/source";
import {
  ActionPillButton,
  BackButton,
  CenteredLoadingState,
  CenteredState,
} from "@/shared/ui";

const CHAPTERS_PAGE_SIZE = 50;

const getDecodedParam = (value: string | string[] | undefined): string => {
  const paramValue = Array.isArray(value) ? value[0] : value;
  if (!paramValue) {
    return "";
  }

  try {
    return decodeURIComponent(paramValue);
  } catch {
    return paramValue;
  }
};

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
  const params = useLocalSearchParams<{ sourceId?: string | string[]; mangaId?: string | string[] }>();
  const sourceId = getDecodedParam(params.sourceId);
  const mangaId = getDecodedParam(params.mangaId);

  const { sources, setSelectedSourceId } = useSource();
  const source = useMemo(
    () => sources.find((entry) => entry.id === sourceId) ?? null,
    [sourceId, sources]
  );

  const [chaptersPage, setChaptersPage] = useState(1);

  useEffect(() => {
    setChaptersPage(1);
  }, [mangaId, sourceId]);

  useEffect(() => {
    if (!source) {
      return;
    }
    setSelectedSourceId(source.id);
  }, [setSelectedSourceId, source]);

  const detailsQuery = useQuery({
    queryKey: sourceQueryFactory.manga(sourceId || "unknown", mangaId || "unknown"),
    queryFn: () => getSourceMangaDetails(sourceId, mangaId),
    enabled: Boolean(source && sourceId && mangaId),
  });

  const libraryEntryQuery = useQuery(
    libraryEntryQueryOptions(
      sourceId || "unknown",
      mangaId || "unknown",
      Boolean(source && sourceId && mangaId)
    )
  );
  const upsertLibraryMutation = useUpsertLibraryEntryMutation();
  const removeLibraryMutation = useRemoveLibraryEntryMutation();

  const chaptersQuery = useQuery({
    queryKey: sourceQueryFactory.chapters(sourceId || "unknown", mangaId || "unknown"),
    queryFn: () => getSourceChapters(sourceId, mangaId),
    enabled: Boolean(source && sourceId && mangaId),
  });

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
  const totalChapterPages = Math.max(1, Math.ceil(allChapters.length / CHAPTERS_PAGE_SIZE));
  const visibleChapters = useMemo(
    () => allChapters.slice(0, chaptersPage * CHAPTERS_PAGE_SIZE),
    [allChapters, chaptersPage]
  );
  const hasMoreChapters = visibleChapters.length < allChapters.length;

  if (!source || !sourceId || !mangaId) {
    return (
      <CenteredState
        title="Manga Not Found"
        message="Missing or invalid source/manga identifier."
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
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CenteredLoadingState message="Loading manga details..." />
      </>
    );
  }

  if (detailsQuery.isError || chaptersQuery.isError || !detailsQuery.data) {
    const errorMessage = detailsQuery.error?.message ?? chaptersQuery.error?.message;
    return (
      <CenteredState title="Could not load manga" message={errorMessage ?? "Unknown error."}>
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
  const isLibraryMutationPending =
    upsertLibraryMutation.isPending || removeLibraryMutation.isPending;

  const renderChapterItem = ({ item }: ListRenderItemInfo<SourceChapter>) => (
    <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] px-3 py-3">
      <Text className="text-sm font-medium text-white">{item.title}</Text>
      {formatChapterMeta(item) ? (
        <Text className="mt-1 text-xs text-[#9B9CA6]">{formatChapterMeta(item)}</Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-[#111214]">
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={visibleChapters}
        keyExtractor={(item, index) => `${item.id}::${item.url || index}`}
        renderItem={renderChapterItem}
        contentContainerClassName="px-4 pb-8"
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          <View className="pb-4 pt-2">
            <BackButton onPress={() => router.back()} />

            <View className="flex-row gap-3">
              <View className="w-24 overflow-hidden rounded-lg bg-[#1A1B1E]">
                <View style={{ aspectRatio: 2 / 3 }}>
                  {details.thumbnailUrl ? (
                    <Image
                      source={{ uri: details.thumbnailUrl }}
                      contentFit="cover"
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <View className="h-full items-center justify-center">
                      <Text className="text-xs text-[#6D6E78]">No cover</Text>
                    </View>
                  )}
                </View>
              </View>

              <View className="flex-1">
                <Text className="text-xl font-bold text-white">{details.title}</Text>
                <Text className="mt-1 text-xs text-[#9B9CA6]">{source.name}</Text>
                <View className="mt-3 self-start">
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
              <Text className="mt-4 text-sm leading-6 text-[#D0D1D8]">
                {details.description}
              </Text>
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
                Page {Math.min(chaptersPage, totalChapterPages)} of {totalChapterPages}
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
                  <Text className="text-sm font-medium text-white">Load More Chapters</Text>
                </View>
              </PressableScale>
            </View>
          ) : allChapters.length > 0 ? (
            <View className="items-center pt-4">
              <Text className="text-xs text-[#8B8D98]">All chapters loaded</Text>
            </View>
          ) : (
            <View className="items-center pt-4">
              <Text className="text-xs text-[#9B9CA6]">No chapters available.</Text>
            </View>
          )
        }
      />
    </View>
  );
}
