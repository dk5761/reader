import { Ionicons } from "@expo/vector-icons";
import { Button } from "heroui-native";
import { Text, View } from "react-native";

export interface BackButtonProps {
  onPress: () => void;
  label?: string;
  variant?: "inline" | "pill";
}

export const BackButton = ({
  onPress,
  label = "Back",
  variant = "inline",
}: BackButtonProps) => {
  const isInline = variant === "inline";

  return (
    <Button
      onPress={onPress}
      hitSlop={8}
      size="sm"
      variant={isInline ? "ghost" : "secondary"}
      className={isInline ? "mb-3 self-start px-0" : "self-start rounded-full "}
      pressableFeedbackVariant="none"
    >
      <View className="py-1">
        <View className="flex-row items-center gap-1.5">
          <Ionicons
            name="chevron-back"
            size={16}
            color={isInline ? "#A7A9B4" : "#FFFFFF"}
          />
          <Text
            className={
              isInline
                ? "text-sm font-medium text-[#A7A9B4]"
                : "text-sm font-medium text-white"
            }
          >
            {label}
          </Text>
        </View>
      </View>
    </Button>
  );
};
