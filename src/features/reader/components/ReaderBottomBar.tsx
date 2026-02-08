import Slider from "@react-native-community/slider";
import { useEffect, useMemo, useState } from "react";
import type { ReaderMode } from "../types/reader.types";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionPillButton, SelectableChip } from "@/shared/ui";

interface ReaderBottomBarProps {
  visible: boolean;
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  currentPage: number;
  totalPages: number;
  onSeekPage: (pageIndex: number) => void;
  nextChapterError: string | null;
  onRetryNextChapter?: () => void;
}

export const ReaderBottomBar = ({
  visible,
  mode,
  onModeChange,
  currentPage,
  totalPages,
  onSeekPage,
  nextChapterError,
  onRetryNextChapter,
}: ReaderBottomBarProps) => {
  const insets = useSafeAreaInsets();
  const [dragPage, setDragPage] = useState<number | null>(null);

  const safeTotalPages = useMemo(() => {
    if (!Number.isFinite(totalPages) || totalPages <= 0) {
      return 1;
    }

    return Math.floor(totalPages);
  }, [totalPages]);

  const maxPageIndex = Math.max(0, safeTotalPages - 1);
  const safeCurrentPage = Math.max(0, Math.min(Math.floor(currentPage), maxPageIndex));
  const displayPage = dragPage ?? safeCurrentPage;
  const pageLabel = `Page ${displayPage + 1} / ${safeTotalPages}`;

  useEffect(() => {
    setDragPage(null);
  }, [safeTotalPages]);

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

      <View className="mt-2">
        <Slider
          minimumValue={0}
          maximumValue={maxPageIndex}
          value={displayPage}
          step={1}
          disabled={maxPageIndex === 0}
          minimumTrackTintColor="#67A4FF"
          maximumTrackTintColor="#31323A"
          thumbTintColor="#84B6FF"
          onSlidingStart={() => {
            setDragPage(safeCurrentPage);
          }}
          onValueChange={(value) => {
            setDragPage(Math.max(0, Math.min(Math.round(value), maxPageIndex)));
          }}
          onSlidingComplete={(value) => {
            const targetPage = Math.max(
              0,
              Math.min(Math.round(value), maxPageIndex)
            );
            setDragPage(null);
            if (targetPage !== safeCurrentPage) {
              onSeekPage(targetPage);
            }
          }}
        />
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
