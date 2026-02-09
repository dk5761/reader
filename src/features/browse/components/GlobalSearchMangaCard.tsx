import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { SourceManga } from "@/services/source";

interface GlobalSearchMangaCardProps {
  sourceId: string;
  manga: SourceManga;
  width: number;
  height: number;
  imageHeight: number;
}

export const GlobalSearchMangaCard = ({
  sourceId,
  manga,
  width,
  height,
  imageHeight,
}: GlobalSearchMangaCardProps) => {
  const router = useRouter();

  return (
    <Pressable
      style={{ width, height }}
      onPress={() => {
        router.push({
          pathname: "/manga/[sourceId]/[mangaId]",
          params: {
            sourceId,
            mangaId: manga.id,
          },
        });
      }}
    >
      <View>
        <View className="overflow-hidden rounded-lg bg-[#1A1B1E]">
          <View style={{ height: imageHeight }}>
            {manga.thumbnailUrl ? (
              <Image
                source={{ uri: manga.thumbnailUrl }}
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
          style={{ minHeight: 42 }}
          className="mt-2 pr-1 text-xs font-medium leading-5 text-[#D8D9E0]"
        >
          {manga.title}
        </Text>
      </View>
    </Pressable>
  );
};
