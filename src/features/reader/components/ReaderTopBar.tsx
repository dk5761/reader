import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackButton } from "@/shared/ui";

interface ReaderTopBarProps {
  visible: boolean;
  mangaTitle: string;
  chapterTitle: string;
}

export const ReaderTopBar = ({
  visible,
  mangaTitle,
  chapterTitle,
}: ReaderTopBarProps) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={{ opacity: visible ? 1 : 0, paddingTop: insets.top + 6 }}
      className="absolute left-0 right-0 top-0 bg-black/85 px-3 pb-3"
    >
      <BackButton
        onPress={() => router.back()}
        label="Back"
        variant="inline"
      />
      <Text numberOfLines={1} className="text-base font-semibold text-white">
        {mangaTitle}
      </Text>
      <Text numberOfLines={1} className="mt-1 text-xs text-[#9B9CA6]">
        {chapterTitle}
      </Text>
    </View>
  );
};
