import type { ReaderMode } from "../types/reader.types";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionPillButton, SelectableChip } from "@/shared/ui";

interface ReaderBottomBarProps {
  visible: boolean;
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  pageLabel: string;
  nextChapterError: string | null;
  onRetryNextChapter?: () => void;
}

export const ReaderBottomBar = ({
  visible,
  mode,
  onModeChange,
  pageLabel,
  nextChapterError,
  onRetryNextChapter,
}: ReaderBottomBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      style={{ opacity: visible ? 1 : 0, paddingBottom: insets.bottom + 8 }}
      className="absolute bottom-0 left-0 right-0 bg-black/85 px-4 pt-2"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-[#D8D9E0]">{pageLabel}</Text>
        <View className="flex-row gap-2">
          <SelectableChip
            label="Horizontal"
            selected={mode === "horizontal"}
            onPress={() => onModeChange("horizontal")}
          />
          <SelectableChip
            label="Vertical"
            selected={mode === "vertical"}
            onPress={() => onModeChange("vertical")}
          />
        </View>
      </View>

      {nextChapterError ? (
        <View className="mt-2 flex-row items-center justify-between rounded-lg border border-[#3A2A2A] bg-[#271A1A] px-3 py-2">
          <Text numberOfLines={2} className="flex-1 pr-3 text-xs text-[#F3B7B7]">
            {nextChapterError}
          </Text>
          {onRetryNextChapter ? (
            <ActionPillButton compact label="Retry" onPress={onRetryNextChapter} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
};
