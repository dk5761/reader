import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSource } from "@/services/source";
import { ScreenHeader } from "@/shared/ui";
import { GlobalSearchPanel } from "../components";
import { getHostLabel } from "@/shared/utils";
import { globalSearchQueryFactory } from "../api";

export default function BrowseTabScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { sources, refreshSources } = useSource();
  const [isGlobalSearchActive, setIsGlobalSearchActive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    refreshSources();
    void queryClient
      .invalidateQueries({ queryKey: globalSearchQueryFactory.all() })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [isRefreshing, queryClient, refreshSources]);

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title="Browse"
          subtitle="Select a source adapter to open its manga list."
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pb-8"
        refreshControl={
          <RefreshControl
            tintColor="#67A4FF"
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        <GlobalSearchPanel
          sources={sources}
          onSearchActiveChange={setIsGlobalSearchActive}
        />

        {!isGlobalSearchActive ? (
          sources.length === 0 ? (
            <View className="items-center py-10">
              <Text className="text-center text-sm text-[#9B9CA6]">
                No adapters found. Register at least one source adapter to start browsing.
              </Text>
            </View>
          ) : (
            <View className="mt-3 gap-3">
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
          )
        ) : null}
      </ScrollView>
    </View>
  );
}
