import { useQuery } from "@tanstack/react-query";
import { Switch } from "heroui-native";
import { useEffect, useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ActionPillButton,
  CenteredLoadingState,
  CenteredState,
  SelectableChip,
  ScreenHeader,
} from "@/shared/ui";
import type { UpdateAppSettingsInput } from "@/services/settings";
import { useSource } from "@/services/source";
import {
  appSettingsQueryOptions,
  useUpdateAppSettingsMutation,
} from "../api";

type NumericControl = {
  key: keyof Pick<
    UpdateAppSettingsInput,
    "readerMagnifierBubbleSize" | "readerMagnifierZoomScale" | "readerMagnifierHoldDurationMs"
  >;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
};

const MAGNIFIER_NUMERIC_CONTROLS: NumericControl[] = [
  {
    key: "readerMagnifierBubbleSize",
    label: "Bubble Size",
    description: "Diameter of the magnifier bubble in points.",
    min: 120,
    max: 280,
    step: 20,
    formatValue: (value) => `${value} pt`,
  },
  {
    key: "readerMagnifierZoomScale",
    label: "Zoom Scale",
    description: "How much to magnify the touched region.",
    min: 1.5,
    max: 4,
    step: 0.25,
    formatValue: (value) => `${value.toFixed(2)}x`,
  },
  {
    key: "readerMagnifierHoldDurationMs",
    label: "Hold Delay",
    description: "Press duration before magnifier appears.",
    min: 200,
    max: 700,
    step: 50,
    formatValue: (value) => `${value} ms`,
  },
];

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const DEFAULT_MAGNIFIER_SOURCE_ID = "readcomicsonline";

const getDefaultSelectedSourceIds = (availableSourceIds: string[]): string[] => {
  if (availableSourceIds.length === 0) {
    return [];
  }

  if (availableSourceIds.includes(DEFAULT_MAGNIFIER_SOURCE_ID)) {
    return [DEFAULT_MAGNIFIER_SOURCE_ID];
  }

  return [availableSourceIds[0]];
};

const normalizeSelectedSourceIds = (
  selectedSourceIds: string[],
  availableSourceIds: string[]
): string[] => {
  if (availableSourceIds.length === 0) {
    return [];
  }

  const selectedIdSet = new Set(
    selectedSourceIds.map((sourceId) => sourceId.trim()).filter(Boolean)
  );
  const normalized = availableSourceIds.filter((sourceId) => selectedIdSet.has(sourceId));

  if (normalized.length === 0) {
    return getDefaultSelectedSourceIds(availableSourceIds);
  }

  return normalized;
};

const areSameSourceIdList = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
};

export default function ReaderMagnifierSettingsScreen() {
  const router = useRouter();
  const { sources } = useSource();
  const settingsQuery = useQuery(appSettingsQueryOptions());
  const updateSettingsMutation = useUpdateAppSettingsMutation();
  const sortedSources = useMemo(
    () => [...sources].sort((a, b) => a.name.localeCompare(b.name)),
    [sources]
  );
  const availableSourceIds = useMemo(
    () => sortedSources.map((source) => source.id),
    [sortedSources]
  );

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
    return <CenteredLoadingState message="Loading reader magnifier settings..." withBackground={false} />;
  }

  if (settingsQuery.isError || !settings) {
    return (
      <CenteredState
        withBackground={false}
        title="Could not load reader magnifier settings"
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

  const updateSetting = (input: UpdateAppSettingsInput) => {
    updateSettingsMutation.mutate(input);
  };

  const persistedSelectedSourceIds = settings.readerMagnifierSelectedSourceIds ?? [];
  const effectiveSelectedSourceIds = useMemo(() => {
    const pendingSelectedSourceIds =
      updateSettingsMutation.variables?.readerMagnifierSelectedSourceIds;
    return pendingSelectedSourceIds ?? persistedSelectedSourceIds;
  }, [persistedSelectedSourceIds, updateSettingsMutation.variables]);
  const selectedSourceIds = useMemo(
    () => normalizeSelectedSourceIds(effectiveSelectedSourceIds, availableSourceIds),
    [effectiveSelectedSourceIds, availableSourceIds]
  );
  const allSourcesSelected =
    availableSourceIds.length > 0 && selectedSourceIds.length === availableSourceIds.length;

  useEffect(() => {
    if (!settingsQuery.data || updateSettingsMutation.isPending) {
      return;
    }

    const normalizedPersisted = normalizeSelectedSourceIds(
      settingsQuery.data.readerMagnifierSelectedSourceIds,
      availableSourceIds
    );

    if (
      areSameSourceIdList(
        normalizedPersisted,
        settingsQuery.data.readerMagnifierSelectedSourceIds
      )
    ) {
      return;
    }

    updateSettingsMutation.mutate({
      readerMagnifierSelectedSourceIds: normalizedPersisted,
    });
  }, [availableSourceIds, settingsQuery.data, updateSettingsMutation]);

  const updateSelectedSourceIds = (nextSelectedSourceIds: string[]) => {
    const normalized = normalizeSelectedSourceIds(nextSelectedSourceIds, availableSourceIds);

    if (areSameSourceIdList(normalized, selectedSourceIds)) {
      return;
    }

    updateSetting({ readerMagnifierSelectedSourceIds: normalized });
  };

  const adjustNumericSetting = (control: NumericControl, deltaDirection: 1 | -1) => {
    const currentValue = Number(effectiveSettings?.[control.key] ?? control.min);
    const nextValueRaw = currentValue + control.step * deltaDirection;
    const nextValue = clamp(nextValueRaw, control.min, control.max);

    if (Math.abs(nextValue - currentValue) < 0.0001) {
      return;
    }

    const valueForInput = control.key === "readerMagnifierZoomScale"
      ? Math.round(nextValue * 100) / 100
      : Math.round(nextValue);

    updateSetting({ [control.key]: valueForInput } as UpdateAppSettingsInput);
  };

  return (
    <View className="flex-1 bg-[#111214]">
      <View className="px-4 pb-3 pt-2">
        <ScreenHeader
          title="Reader Magnifier"
          subtitle="Configure press-and-hold text magnification in the reader."
          onBackPress={() => router.back()}
        />
      </View>

      <ScrollView
        contentContainerClassName="px-4 pb-8"
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-medium text-white">Enable reader magnifier</Text>
              <Text className="mt-1 text-xs text-[#9B9CA6]">
                Press and hold on a page to open a movable zoom bubble.
              </Text>
            </View>

            <Switch
              isSelected={Boolean(effectiveSettings?.readerMagnifierEnabled)}
              isDisabled={updateSettingsMutation.isPending}
              onSelectedChange={(isSelected) => {
                updateSetting({ readerMagnifierEnabled: isSelected });
              }}
            />
          </View>

          <View className="mt-3 rounded-lg border border-[#2A2A2E] px-3 py-2">
            <Text className="text-sm font-medium text-white">Enabled Adapters</Text>
            <Text className="mt-1 text-xs text-[#9B9CA6]">
              Magnifier is active only for selected source adapters.
            </Text>
            {sortedSources.length > 0 ? (
              <View className="mt-2 flex-row flex-wrap gap-2">
                <SelectableChip
                  label="All"
                  selected={allSourcesSelected}
                  onPress={() => {
                    if (updateSettingsMutation.isPending || allSourcesSelected) {
                      return;
                    }

                    updateSelectedSourceIds(availableSourceIds);
                  }}
                />

                {sortedSources.map((source) => {
                  const isSelected = selectedSourceIds.includes(source.id);
                  const isLastSelected = selectedSourceIds.length === 1 && isSelected;

                  return (
                    <SelectableChip
                      key={`reader-magnifier-source-${source.id}`}
                      label={source.name}
                      selected={isSelected}
                      onPress={() => {
                        if (updateSettingsMutation.isPending) {
                          return;
                        }

                        if (isSelected) {
                          if (isLastSelected) {
                            return;
                          }

                          updateSelectedSourceIds(
                            selectedSourceIds.filter((sourceId) => sourceId !== source.id)
                          );
                          return;
                        }

                        updateSelectedSourceIds([...selectedSourceIds, source.id]);
                      }}
                    />
                  );
                })}
              </View>
            ) : (
              <View className="mt-2 rounded-md border border-[#2A2A2E] bg-[#15161A] p-2">
                <Text className="text-xs text-[#9B9CA6]">
                  No adapters available right now.
                </Text>
              </View>
            )}
          </View>

          {MAGNIFIER_NUMERIC_CONTROLS.map((control) => {
            const currentValue = Number(effectiveSettings?.[control.key] ?? control.min);
            return (
              <View key={control.key} className="mt-3 rounded-lg border border-[#2A2A2E] px-3 py-2">
                <Text className="text-sm font-medium text-white">{control.label}</Text>
                <Text className="mt-1 text-xs text-[#9B9CA6]">{control.description}</Text>
                <View className="mt-2 flex-row items-center justify-between">
                  <TouchableOpacity
                    className="rounded-md border border-[#3A3A42] px-3 py-1"
                    disabled={updateSettingsMutation.isPending}
                    onPress={() => adjustNumericSetting(control, -1)}
                  >
                    <Text className="text-sm text-white">-</Text>
                  </TouchableOpacity>

                  <Text className="text-sm font-semibold text-white">
                    {control.formatValue(currentValue)}
                  </Text>

                  <TouchableOpacity
                    className="rounded-md border border-[#3A3A42] px-3 py-1"
                    disabled={updateSettingsMutation.isPending}
                    onPress={() => adjustNumericSetting(control, 1)}
                  >
                    <Text className="text-sm text-white">+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {updateSettingsMutation.isError ? (
          <View className="mt-3 rounded-xl border border-[#3A2A2A] bg-[#271A1A] p-3">
            <Text className="text-xs text-[#F3B7B7]">
              Could not update reader magnifier settings. Please try again.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
