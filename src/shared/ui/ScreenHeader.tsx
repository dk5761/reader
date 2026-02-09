import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { BackButton } from "./BackButton";

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBackPress?: () => void;
  backLabel?: string;
  backVariant?: "inline" | "pill";
  rightAccessory?: ReactNode;
}

export const ScreenHeader = ({
  title,
  subtitle,
  onBackPress,
  backLabel,
  backVariant = "inline",
  rightAccessory,
}: ScreenHeaderProps) => {
  return (
    <View>
      {onBackPress ? (
        <BackButton
          onPress={onBackPress}
          label={backLabel}
          variant={backVariant}
        />
      ) : null}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-white">{title}</Text>
          {subtitle ? (
            <Text className="mt-1 text-sm text-[#9B9CA6]">{subtitle}</Text>
          ) : null}
        </View>
        {rightAccessory ? <View>{rightAccessory}</View> : null}
      </View>
    </View>
  );
};
