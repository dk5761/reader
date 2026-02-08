import { Text, View } from "react-native";
import { BackButton } from "./BackButton";

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBackPress?: () => void;
  backLabel?: string;
  backVariant?: "inline" | "pill";
}

export const ScreenHeader = ({
  title,
  subtitle,
  onBackPress,
  backLabel,
  backVariant = "inline",
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
      <Text className="text-2xl font-bold text-white">{title}</Text>
      {subtitle ? <Text className="mt-1 text-sm text-[#9B9CA6]">{subtitle}</Text> : null}
    </View>
  );
};
