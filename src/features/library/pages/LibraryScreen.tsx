import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { FlatList, Text, View } from "react-native";
import { libraryEntriesQueryOptions } from "@/services/library";
import { latestReadingProgressQueryOptions } from "@/services/progress";
import {
  ActionPillButton,
  CenteredLoadingState,
  CenteredState,
  ScreenHeader,
} from "@/shared/ui";

export default function LibraryTabScreen() {
  const router = useRouter();
  const libraryQuery = useQuery(libraryEntriesQueryOptions());
  const progressQuery = useQuery(latestReadingProgressQueryOptions(500));

  const progressByManga = new Map(
    (progressQuery.data ?? []).map((entry) => [
      `${entry.sourceId}::${entry.mangaId}`,
      entry,
    ])
  );

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title="Library"
          subtitle="Saved manga will appear here."
        />
      </View>

      {libraryQuery.isPending ? (
        <CenteredLoadingState withBackground={false} message="Loading library..." />
      ) : libraryQuery.isError ? (
        <CenteredState
          withBackground={false}
          title="Could not load library"
          message={libraryQuery.error.message}
        >
          <View className="mt-4">
            <ActionPillButton
              label="Retry"
              onPress={() => {
                void libraryQuery.refetch();
              }}
            />
          </View>
        </CenteredState>
      ) : (
        <FlatList
          data={libraryQuery.data}
          keyExtractor={(item) => `${item.sourceId}::${item.mangaId}`}
          contentContainerClassName="px-4 pb-8"
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <PressableScale
              onPress={() => {
                router.push({
                  pathname: "/manga/[sourceId]/[mangaId]",
                  params: { sourceId: item.sourceId, mangaId: item.mangaId },
                });
              }}
            >
              <View className="flex-row gap-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-3">
                <View className="h-20 w-14 overflow-hidden rounded-md bg-[#15161A]">
                  {item.thumbnailUrl ? (
                    <Image
                      source={{ uri: item.thumbnailUrl }}
                      contentFit="cover"
                      style={{ width: "100%", height: "100%" }}
                      transition={100}
                    />
                  ) : (
                    <View className="flex-1 items-center justify-center">
                      <Text className="text-[10px] text-[#6D6E78]">No cover</Text>
                    </View>
                  )}
                </View>

                <View className="flex-1 justify-center">
                  <Text numberOfLines={2} className="text-base font-semibold text-white">
                    {item.title}
                  </Text>
                  <Text className="mt-1 text-xs text-[#9B9CA6]">{item.sourceId}</Text>
                  <Text className="mt-1 text-xs text-[#8B8D98]">
                    Updated {new Date(item.updatedAt).toLocaleDateString()}
                  </Text>
                  {progressByManga.has(`${item.sourceId}::${item.mangaId}`) ? (
                    <View className="mt-2 self-start">
                      <ActionPillButton
                        compact
                        label="Continue"
                        onPress={() => {
                          const progress = progressByManga.get(
                            `${item.sourceId}::${item.mangaId}`
                          );
                          if (!progress) {
                            return;
                          }

                          router.push({
                            pathname: "/reader/[sourceId]/[mangaId]/[chapterId]",
                            params: {
                              sourceId: progress.sourceId,
                              mangaId: progress.mangaId,
                              chapterId: progress.chapterId,
                              initialPage: String(progress.pageIndex),
                            },
                          });
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            </PressableScale>
          )}
          ListEmptyComponent={
            <View className="items-center py-10">
              <Text className="text-sm text-[#9B9CA6]">
                No manga in your library yet.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
