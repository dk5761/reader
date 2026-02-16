import { Card } from "heroui-native";
import { Image } from "expo-image";
import { PressableScale } from "pressto";
import { Text, View } from "react-native";
import type { LibraryUpdateEventEntry } from "@/services/library-update";
import { formatRelativeTime } from "@/shared/utils";

interface UpdateEventCardProps {
  event: LibraryUpdateEventEntry;
  sourceName: string;
  onPress: () => void;
}

export const UpdateEventCard = ({
  event,
  sourceName,
  onPress,
}: UpdateEventCardProps) => {
  return (
    <PressableScale onPress={onPress}>
      <Card
        variant="secondary"
        animation="disable-all"
        className="overflow-hidden rounded-xl border border-[#2A2A2E] bg-[#17181B]"
      >
        <Card.Body className="p-3">
          <View className="flex-row items-start gap-2.5">
            <View className="h-16 w-12 overflow-hidden rounded-lg bg-[#111214]">
              {event.mangaThumbnailUrl ? (
                <Image
                  source={{ uri: event.mangaThumbnailUrl }}
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
              <View className="flex-row items-center justify-between gap-2">
                <Text numberOfLines={2} className="flex-1 text-base font-semibold text-white">
                  {event.mangaTitle}
                </Text>
                <Text className="text-xs font-semibold text-[#7BEEB0]">+{event.chapterDelta}</Text>
              </View>

              <Text className="mt-1 text-xs uppercase tracking-[0.4px] text-[#8B8D98]">
                {sourceName}
              </Text>

              <Text className="mt-1 text-xs text-[#9B9CA6]">
                {event.detectionMode === "date" ? "Date" : "Count fallback"} •{" "}
                {formatRelativeTime(event.detectedAt)}
              </Text>
            </View>
          </View>
        </Card.Body>
      </Card>
    </PressableScale>
  );
};
