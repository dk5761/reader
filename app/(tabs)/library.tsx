import { Text, View } from "react-native";

export default function LibraryTabScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-[#111214] px-6">
      <Text className="text-xl font-semibold text-white">Library</Text>
      <Text className="mt-2 text-center text-sm text-[#9B9CA6]">
        Saved manga and reading history will appear here.
      </Text>
    </View>
  );
}
