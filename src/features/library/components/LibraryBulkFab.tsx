import { Ionicons } from "@expo/vector-icons";
import { Button } from "heroui-native";
import { Text, View } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";

interface LibraryBulkFabProps {
  visible: boolean;
  selectedCount: number;
  isPending?: boolean;
  insets: EdgeInsets;
  onDeletePress: () => void;
}

export const LibraryBulkFab = ({
  visible,
  selectedCount,
  isPending = false,
  insets,
  onDeletePress,
}: LibraryBulkFabProps) => {
  if (!visible) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{ bottom: insets.bottom + 12 }}
      className="absolute left-0 right-0 items-center"
    >
      <View className="relative">
        <Button
          isIconOnly
          size="md"
          variant="danger-soft"
          className="h-12 w-12 rounded-full border border-[#6A2B35] bg-[#2B171B]"
          isDisabled={selectedCount === 0 || isPending}
          onPress={onDeletePress}
          pressableFeedbackVariant="none"
        >
          <Ionicons name="trash-outline" size={20} color="#FF7C7C" />
        </Button>

        <View className="absolute -right-2 -top-2 rounded-full border border-[#3B4A63] bg-[#1C2D45] px-2 py-[1px]">
          <Text className="text-[11px] font-semibold text-[#9CC4FF]">
            {selectedCount}
          </Text>
        </View>
      </View>
    </View>
  );
};
