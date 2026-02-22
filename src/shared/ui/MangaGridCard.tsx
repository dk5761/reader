import { Ionicons } from "@expo/vector-icons";
import { Card } from "heroui-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "pressto";
import { Text, View } from "react-native";

export interface MangaGridCardProps {
  title: string;
  thumbnailUrl?: string;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
  showInLibraryChip?: boolean;
  isSelectMode?: boolean;
  isSelected?: boolean;
}

export const MangaGridCard = ({
  title,
  thumbnailUrl,
  width,
  onPress,
  onLongPress,
  showInLibraryChip = false,
  isSelectMode = false,
  isSelected = false,
}: MangaGridCardProps) => {
  return (
    <PressableScale style={{ width }} onPress={onPress} onLongPress={onLongPress}>
      <Card
        variant="secondary"
        animation="disable-all"
        style={{ padding: 0 }}
        className="overflow-hidden rounded-2xl border border-[#2A2A2E] bg-[#17181B] p-0"
      >
        <Card.Body style={{ padding: 0 }} className="m-0 p-0">
          <View style={{ aspectRatio: 2 / 3 }} className="relative bg-[#111214]">
            <View className="h-full w-full">
              {thumbnailUrl ? (
                <Image
                  source={{ uri: thumbnailUrl }}
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

            <LinearGradient
              pointerEvents="none"
              colors={["transparent", "rgba(0, 0, 0, 0.92)"]}
              locations={[0.42, 1]}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "45%",
              }}
            />

            <View className="absolute bottom-0 left-0 right-0 gap-2 px-2.5 pb-2.5 pt-6">
              {showInLibraryChip ? (
                <View className="self-start rounded-md border border-white/30 bg-black/45 px-2.5 py-1">
                  <Text className="text-[11px] font-semibold text-white">in library</Text>
                </View>
              ) : null}

              <Text numberOfLines={2} className="text-base font-semibold leading-5 text-white">
                {title}
              </Text>
            </View>

            {isSelectMode ? (
              <View
                className={`absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-full border ${
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
        </Card.Body>
      </Card>
    </PressableScale>
  );
};
