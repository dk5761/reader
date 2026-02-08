import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { ScrollView, Text, View } from "react-native";
import { useSource } from "@/services/source";
import { CenteredState, ScreenHeader } from "@/shared/ui";

const getHostLabel = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};

export default function BrowseTabScreen() {
  const router = useRouter();
  const { sources } = useSource();

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title="Browse"
          subtitle="Select a source adapter to open its manga list."
        />
      </View>

      {sources.length === 0 ? (
        <CenteredState
          withBackground={false}
          title="No adapters found"
          message="Register at least one source adapter to start browsing."
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-4 pb-8"
        >
          <View className="gap-3">
            {sources.map((source) => (
              <PressableScale
                key={source.id}
                onPress={() => {
                  router.push({
                    pathname: "/source/[sourceId]",
                    params: { sourceId: source.id },
                  });
                }}
              >
                <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-lg font-semibold text-white">{source.name}</Text>
                      <Text className="mt-1 text-xs text-[#8B8D98]">{source.id}</Text>
                      <Text className="mt-1 text-sm text-[#B5B6BF]">
                        {getHostLabel(source.baseUrl)}
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={20} color="#8B8D98" />
                  </View>
                </View>
              </PressableScale>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
