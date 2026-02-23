import { useQuery } from "@tanstack/react-query";
import { Switch } from "heroui-native";
import { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ActionPillButton,
  CenteredLoadingState,
  CenteredState,
  ScreenHeader,
} from "@/shared/ui";
import {
  appSettingsQueryOptions,
  useUpdateAppSettingsMutation,
} from "../api";
import { AppUpdateCard } from "../components/AppUpdateCard";

export default function SettingsScreen() {
  const router = useRouter();
  const settingsQuery = useQuery(appSettingsQueryOptions());
  const updateSettingsMutation = useUpdateAppSettingsMutation();

  const settings = settingsQuery.data;
  const effectiveSettings = useMemo(() => {
    if (!settings) {
      return null;
    }

    if (!updateSettingsMutation.variables) {
      return settings;
    }

    return {
      ...settings,
      ...updateSettingsMutation.variables,
    };
  }, [settings, updateSettingsMutation.variables]);

  if (settingsQuery.isPending) {
    return <CenteredLoadingState message="Loading settings..." withBackground={false} />;
  }

  if (settingsQuery.isError || !settings) {
    return (
      <CenteredState
        withBackground={false}
        title="Could not load settings"
        message={settingsQuery.error?.message}
      >
        <View className="mt-4">
          <ActionPillButton
            label="Retry"
            onPress={() => {
              void settingsQuery.refetch();
            }}
          />
        </View>
      </CenteredState>
    );
  }

  const updateSetting = (input: {
    allowNsfwSources?: boolean;
  }) => {
    updateSettingsMutation.mutate(input);
  };

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title="Settings"
          subtitle="Configure app-level defaults."
        />
      </View>

      <ScrollView
        contentContainerClassName="px-4 pb-8"
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
          <Text className="text-base font-semibold text-white">Content</Text>

          <View className="mt-4 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-medium text-white">Show 18+ sources</Text>
              <Text className="mt-1 text-xs text-[#9B9CA6]">
                When disabled, NSFW sources are hidden across browse, library, manga, and reader.
              </Text>
            </View>

            <Switch
              isSelected={effectiveSettings?.allowNsfwSources}
              isDisabled={updateSettingsMutation.isPending}
              onSelectedChange={(isSelected) => {
                updateSetting({ allowNsfwSources: isSelected });
              }}
            />
          </View>
        </View>

        <TouchableOpacity
          className="mt-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4"
          onPress={() => {
            router.push("/settings/webtoon-loading");
          }}
        >
          <Text className="text-base font-semibold text-white">Configure Webtoon Loading</Text>
          <Text className="mt-1 text-xs text-[#9B9CA6]">
            Open advanced controls for loading order, windowing, and prefetch behavior.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="mt-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4"
          onPress={() => {
            router.push("/updates");
          }}
        >
          <Text className="text-base font-semibold text-white">Updates</Text>
          <Text className="mt-1 text-xs text-[#9B9CA6]">
            View update feed and run library refresh.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="mt-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4"
          onPress={() => {
            router.push("/backup");
          }}
        >
          <Text className="text-base font-semibold text-white">Backup & Restore</Text>
          <Text className="mt-1 text-xs text-[#9B9CA6]">
            Export or import your library, categories, progress, and settings.
          </Text>
        </TouchableOpacity>

        <AppUpdateCard />

        {updateSettingsMutation.isError ? (
          <View className="mt-3 rounded-xl border border-[#3A2A2A] bg-[#271A1A] p-3">
            <Text className="text-xs text-[#F3B7B7]">
              Could not update settings. Please try again.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
