import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { PressableScale } from "pressto";
import { Text, View } from "react-native";
import type { ReadingProgressEntry } from "@/services/progress";
import type { LibraryEntryWithCategories } from "@/services/library";
import { ActionPillButton } from "@/shared/ui";

interface LibraryEntryCardProps {
  entry: LibraryEntryWithCategories;
  continueProgress?: ReadingProgressEntry;
  isSelectMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onContinuePress: () => void;
}

export const LibraryEntryCard = ({
  entry,
  continueProgress,
  isSelectMode,
  isSelected,
  onPress,
  onLongPress,
  onContinuePress,
}: LibraryEntryCardProps) => {
  return (
    <PressableScale onPress={onPress} onLongPress={onLongPress}>
      <View className="flex-row gap-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-3">
        <View className="h-20 w-14 overflow-hidden rounded-md bg-[#15161A]">
          {entry.thumbnailUrl ? (
            <Image
              source={{ uri: entry.thumbnailUrl }}
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
          <View className="flex-row items-start justify-between gap-2">
            <Text numberOfLines={2} className="flex-1 text-base font-semibold text-white">
              {entry.title}
            </Text>

            {isSelectMode ? (
              <View
                className={`h-6 w-6 items-center justify-center rounded-full border ${
                  isSelected
                    ? "border-[#67A4FF] bg-[#1A3760]"
                    : "border-[#3A3B41] bg-[#141518]"
                }`}
              >
                {isSelected ? (
                  <Ionicons name="checkmark" size={14} color="#84B6FF" />
                ) : null}
              </View>
            ) : null}
          </View>

          <Text className="mt-1 text-xs text-[#9B9CA6]">{entry.sourceId}</Text>
          <Text className="mt-1 text-xs text-[#8B8D98]">
            Updated {new Date(entry.updatedAt).toLocaleDateString()}
          </Text>

          {!isSelectMode && continueProgress ? (
            <View className="mt-2 self-start">
              <ActionPillButton compact label="Continue" onPress={onContinuePress} />
            </View>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
};
