import type { ReaderChapter } from "@/services/reader";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

const TRANSITION_HEIGHT = 200;

interface ChapterTransitionProps {
  variant: "prev" | "next";
  from: ReaderChapter;
  to: ReaderChapter | null;
  onRetry?: () => void;
}

export function ChapterTransition({
  variant,
  from,
  to,
  onRetry,
}: ChapterTransitionProps) {
  const isPrev = variant === "prev";

  const topLabel = isPrev ? "Previous chapter" : "Finished";
  const bottomLabel = isPrev ? "Current" : "Next chapter";
  const topChapter = isPrev ? to : from;
  const bottomChapter = isPrev ? from : to;

  const fallbackLabel = isPrev ? "No previous chapter" : "No next chapter";

  return (
    <View
      style={{ height: TRANSITION_HEIGHT }}
      className="justify-center bg-[#0F0F12] px-8 py-6"
    >
      <View className="gap-4">
        {topChapter !== null && topChapter !== undefined ? (
          <ChapterLabel
            label={topLabel}
            chapter={topChapter}
            isLoading={topChapter.state.status === "loading"}
            isError={topChapter.state.status === "error"}
            onRetry={onRetry}
          />
        ) : (
          <View className="items-center">
            <Ionicons name="information-circle-outline" size={20} color="#9B9CA6" />
            <Text className="mt-2 text-sm text-[#9B9CA6]">{fallbackLabel}</Text>
          </View>
        )}

        {bottomChapter !== null && bottomChapter !== undefined ? (
          <ChapterLabel
            label={bottomLabel}
            chapter={bottomChapter}
            isLoading={bottomChapter.state.status === "loading"}
            isError={bottomChapter.state.status === "error"}
            onRetry={onRetry}
          />
        ) : (
          <View className="items-center">
            <Ionicons name="information-circle-outline" size={20} color="#9B9CA6" />
            <Text className="mt-2 text-sm text-[#9B9CA6]">{fallbackLabel}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

interface ChapterLabelProps {
  label: string;
  chapter: ReaderChapter;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
}

function ChapterLabel({
  label,
  chapter,
  isLoading,
  isError,
  onRetry,
}: ChapterLabelProps) {
  const displayName =
    chapter.title || (chapter.number ? `Chapter ${chapter.number}` : chapter.id);

  return (
    <View>
      <Text className="text-xs font-medium uppercase tracking-wider text-[#9B9CA6]">
        {label}
      </Text>
      {isLoading ? (
        <View className="mt-2 flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#9B9CA6" />
          <Text className="text-sm text-[#9B9CA6]">Loading pages...</Text>
        </View>
      ) : isError ? (
        <View className="mt-2 gap-2">
          <Text className="text-sm text-red-400">
            {chapter.state.status === "error"
              ? chapter.state.error
              : "Failed to load"}
          </Text>
          {onRetry && (
            <Pressable
              onPress={onRetry}
              className="self-start rounded-lg border border-[#2A2A2E] bg-[#1A1B1E] px-3 py-2"
            >
              <Text className="text-sm font-medium text-white">Retry</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Text
          className="mt-1 text-base font-medium text-white"
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {displayName}
        </Text>
      )}
    </View>
  );
}
