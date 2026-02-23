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
import type { UpdateAppSettingsInput } from "@/services/settings";

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
    webtoonWindowAhead?: number;
    webtoonWindowBehind?: number;
    webtoonForegroundConcurrency?: number;
    webtoonBackgroundConcurrency?: number;
    webtoonChapterPreloadLeadPages?: number;
  }) => {
    updateSettingsMutation.mutate(input);
  };

  const adjustSetting = (
    key: keyof Pick<
      UpdateAppSettingsInput,
      | "webtoonWindowAhead"
      | "webtoonWindowBehind"
      | "webtoonForegroundConcurrency"
      | "webtoonBackgroundConcurrency"
      | "webtoonChapterPreloadLeadPages"
    >,
    delta: number,
    min: number,
    max: number
  ) => {
    const currentValue = effectiveSettings?.[key] ?? min;
    const nextValue = Math.max(min, Math.min(max, currentValue + delta));
    if (nextValue === currentValue) {
      return;
    }
    updateSetting({ [key]: nextValue } as UpdateAppSettingsInput);
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

        <View className="mt-3 rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
          <Text className="text-base font-semibold text-white">Webtoon Loading</Text>
          <Text className="mt-1 text-xs text-[#9B9CA6]">
            Tune sequential loading behavior and prefetch aggressiveness.
          </Text>

          {[
            {
              key: "webtoonWindowAhead" as const,
              label: "Window Ahead",
              description: "Pages to keep queued ahead of current page.",
              min: 3,
              max: 12,
            },
            {
              key: "webtoonWindowBehind" as const,
              label: "Window Behind",
              description: "Pages to keep warm behind current page.",
              min: 0,
              max: 3,
            },
            {
              key: "webtoonForegroundConcurrency" as const,
              label: "Foreground Concurrency",
              description: "High-priority simultaneous page downloads.",
              min: 1,
              max: 2,
            },
            {
              key: "webtoonBackgroundConcurrency" as const,
              label: "Background Concurrency",
              description: "Low-priority prefetch simultaneous downloads.",
              min: 0,
              max: 2,
            },
            {
              key: "webtoonChapterPreloadLeadPages" as const,
              label: "Chapter Preload Lead",
              description: "Remaining pages before preloading next chapter.",
              min: 2,
              max: 8,
            },
          ].map((item) => (
            <View key={item.key} className="mt-4 rounded-lg border border-[#2A2A2E] px-3 py-2">
              <Text className="text-sm font-medium text-white">{item.label}</Text>
              <Text className="mt-1 text-xs text-[#9B9CA6]">{item.description}</Text>
              <View className="mt-2 flex-row items-center justify-between">
                <TouchableOpacity
                  className="rounded-md border border-[#3A3A42] px-3 py-1"
                  disabled={updateSettingsMutation.isPending}
                  onPress={() => adjustSetting(item.key, -1, item.min, item.max)}
                >
                  <Text className="text-sm text-white">-</Text>
                </TouchableOpacity>
                <Text className="text-sm font-semibold text-white">
                  {effectiveSettings?.[item.key]}
                </Text>
                <TouchableOpacity
                  className="rounded-md border border-[#3A3A42] px-3 py-1"
                  disabled={updateSettingsMutation.isPending}
                  onPress={() => adjustSetting(item.key, 1, item.min, item.max)}
                >
                  <Text className="text-sm text-white">+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

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
