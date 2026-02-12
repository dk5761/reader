import { Image } from "expo-image";
import { Text, View } from "react-native";
import { ActionPillButton } from "@/shared/ui";
import type { SourceMangaDetails } from "@/services/source";

interface MangaHeaderProps {
  details: SourceMangaDetails;
  sourceName: string;
  isInLibrary: boolean;
  isLibraryMutationPending: boolean;
  latestProgress?: {
    chapterId: string;
    pageIndex: number;
  } | null;
  onLibraryPress: () => void;
  onContinuePress: () => void;
}

export function MangaHeader({
  details,
  sourceName,
  isInLibrary,
  isLibraryMutationPending,
  latestProgress,
  onLibraryPress,
  onContinuePress,
}: MangaHeaderProps) {
  return (
    <View className="pb-4 pt-3">
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
          <Text className="mt-1 text-xs text-[#9B9CA6]">{sourceName}</Text>
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
                onPress={onLibraryPress}
              />

              {latestProgress ? (
                <ActionPillButton compact label="Continue" onPress={onContinuePress} />
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
    </View>
  );
}
