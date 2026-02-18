import { ActivityIndicator, Text, View } from "react-native";

interface ReaderLoadingScreenProps {
  chapterTitle?: string;
}

export function ReaderLoadingScreen({
  chapterTitle,
}: ReaderLoadingScreenProps) {
  return (
    <View className="flex-1 items-center justify-center bg-[#0F0F12]">
      <ActivityIndicator color="#67A4FF" size="large" />

      <Text className="mt-4 max-w-[280px] text-center text-sm text-[#9B9CA6]">
        Loading {chapterTitle || "chapter"}...
      </Text>
    </View>
  );
}
