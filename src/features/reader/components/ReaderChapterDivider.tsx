import { Text, View } from "react-native";

interface ReaderChapterDividerProps {
  chapterTitle: string;
}

export const ReaderChapterDivider = ({ chapterTitle }: ReaderChapterDividerProps) => {
  return (
    <View className="bg-black px-4 py-6">
      <View className="flex-row items-center">
        <View className="h-px flex-1 bg-[#2A2A2E]" />
        <Text className="mx-3 text-xs font-medium uppercase text-[#8B8D98]">
          Chapter Transition
        </Text>
        <View className="h-px flex-1 bg-[#2A2A2E]" />
      </View>
      <Text className="mt-2 text-center text-sm font-semibold text-[#D8D9E0]">
        {chapterTitle}
      </Text>
    </View>
  );
};
