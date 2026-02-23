import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ActionPillButton,
  CenteredLoadingState,
  CenteredState,
  ScreenHeader,
} from "@/shared/ui";
import type { UpdateAppSettingsInput } from "@/services/settings";
import {
  appSettingsQueryOptions,
  useUpdateAppSettingsMutation,
} from "../api";

const WEBTOON_CONTROLS: Array<{
  key: keyof Pick<
    UpdateAppSettingsInput,
    | "webtoonWindowAhead"
    | "webtoonWindowBehind"
    | "webtoonForegroundConcurrency"
    | "webtoonBackgroundConcurrency"
    | "webtoonChapterPreloadLeadPages"
  >;
  label: string;
  description: string;
  min: number;
  max: number;
}> = [
  {
    key: "webtoonWindowAhead",
    label: "Window Ahead",
    description: "Pages to keep queued ahead of current page.",
    min: 3,
    max: 12,
  },
  {
    key: "webtoonWindowBehind",
    label: "Window Behind",
    description: "Pages to keep warm behind current page.",
    min: 0,
    max: 3,
  },
  {
    key: "webtoonForegroundConcurrency",
    label: "Foreground Concurrency",
    description: "High-priority simultaneous page downloads.",
    min: 1,
    max: 2,
  },
  {
    key: "webtoonBackgroundConcurrency",
    label: "Background Concurrency",
    description: "Low-priority prefetch simultaneous downloads.",
    min: 0,
    max: 2,
  },
  {
    key: "webtoonChapterPreloadLeadPages",
    label: "Chapter Preload Lead",
    description: "Remaining pages before preloading next chapter.",
    min: 2,
    max: 8,
  },
];

export default function WebtoonLoadingSettingsScreen() {
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
    return <CenteredLoadingState message="Loading webtoon settings..." withBackground={false} />;
  }

  if (settingsQuery.isError || !settings) {
    return (
      <CenteredState
        withBackground={false}
        title="Could not load webtoon settings"
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

  const adjustSetting = (
    key: (typeof WEBTOON_CONTROLS)[number]["key"],
    delta: number,
    min: number,
    max: number
  ) => {
    const currentValue = effectiveSettings?.[key] ?? min;
    const nextValue = Math.max(min, Math.min(max, currentValue + delta));
    if (nextValue === currentValue) {
      return;
    }

    updateSettingsMutation.mutate({ [key]: nextValue } as UpdateAppSettingsInput);
  };

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title="Webtoon Loading"
          subtitle="Tune sequential loading and prefetch behavior."
          onBackPress={() => router.back()}
        />
      </View>

      <ScrollView
        contentContainerClassName="px-4 pb-8"
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
          {WEBTOON_CONTROLS.map((item) => (
            <View key={item.key} className="mt-3 rounded-lg border border-[#2A2A2E] px-3 py-2 first:mt-0">
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

        {updateSettingsMutation.isError ? (
          <View className="mt-3 rounded-xl border border-[#3A2A2A] bg-[#271A1A] p-3">
            <Text className="text-xs text-[#F3B7B7]">
              Could not update webtoon settings. Please try again.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
