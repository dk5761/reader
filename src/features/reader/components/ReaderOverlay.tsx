import { BackButton } from "@/shared/ui";
import { router } from "expo-router";
import { Text, View } from "react-native";

interface ReaderOverlayProps {
  chapterId: string;
  chapterNumber?: number;
  chapterTitle?: string;
}

export function ReaderOverlay({
  chapterId,
  chapterNumber,
  chapterTitle,
}: ReaderOverlayProps) {
  const displayTitle =
    chapterTitle || (chapterNumber ? `Chapter ${chapterNumber}` : chapterId);

  return (
    <View className="flex-col items-start  bg-[#1A1B1E]/90 px-4 pb-4 pt-[60px]">
      <BackButton onPress={() => router.back()} variant="inline" label="Back" />
      <Text className="text-base font-semibold text-white">{displayTitle}</Text>
    </View>
  );
}
