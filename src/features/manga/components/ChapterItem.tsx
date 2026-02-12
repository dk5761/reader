import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "pressto";
import { Text, View } from "react-native";
import { Pressable as GesturePressable } from "react-native-gesture-handler";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SourceChapter } from "@/services/source";

const SWIPE_ACTION_WIDTH = 224;
const SWIPE_ACTION_COLUMN_WIDTH = 108;

interface ChapterItemProps {
  item: SourceChapter;
  index: number;
  totalChapters: number;
  isChapterRead: boolean;
  hasBelowChapters: boolean;
  allBelowRead: boolean;
  shouldMarkBelowAsRead: boolean;
  belowChapterInputs: Array<{
    chapterId: string;
    chapterTitle: string;
    chapterNumber: number | undefined;
  }>;
  isMutationPending: number;
  latestProgressChapterId?: string;
  latestProgressPageIndex?: number;
  onPress: () => void;
  onToggleRead: (swipeableMethods: SwipeableMethods) => void;
  onToggleBelowRead: (swipeableMethods: SwipeableMethods) => void;
}

const formatChapterMeta = (chapter: SourceChapter): string => {
  const parts: string[] = [];
  if (chapter.number !== undefined) {
    parts.push(`Ch ${chapter.number}`);
  }
  if (chapter.uploadedAt) {
    parts.push(chapter.uploadedAt);
  }
  if (chapter.scanlator) {
    parts.push(chapter.scanlator);
  }
  return parts.join(" • ");
};

export function ChapterItem({
  item,
  index,
  isChapterRead,
  hasBelowChapters,
  allBelowRead,
  shouldMarkBelowAsRead,
  belowChapterInputs,
  isMutationPending,
  latestProgressChapterId,
  latestProgressPageIndex,
  onPress,
  onToggleRead,
  onToggleBelowRead,
}: ChapterItemProps) {
  const shouldResumeCurrentChapter = latestProgressChapterId === item.id;

  const renderRightActions = (
    _progress: unknown,
    _translation: unknown,
    swipeableMethods: SwipeableMethods,
  ) => (
    <View
      style={{ width: SWIPE_ACTION_WIDTH }}
      className="ml-2 h-full flex-row items-stretch gap-2"
    >
      <PressableScale
        onPress={() => onToggleRead(swipeableMethods)}
      >
        <View
          style={{ width: SWIPE_ACTION_COLUMN_WIDTH }}
          className={`rounded-xl px-3 py-3 ${
            isChapterRead ? "bg-[#3B2024]" : "bg-[#1F3A2A]"
          } h-full items-center justify-center`}
        >
          <Ionicons
            name={isChapterRead ? "eye-off-outline" : "eye-outline"}
            size={18}
            color="#FFFFFF"
          />
          <Text className="mt-1 text-center text-xs font-semibold text-white">
            {isChapterRead ? "Mark Unread" : "Mark Read"}
          </Text>
        </View>
      </PressableScale>

      {hasBelowChapters ? (
        <PressableScale
          onPress={() => onToggleBelowRead(swipeableMethods)}
        >
          <View
            style={{ width: SWIPE_ACTION_COLUMN_WIDTH }}
            className="h-full items-center justify-center rounded-xl bg-[#2A2D36] px-3 py-3"
          >
            <Ionicons
              name="arrow-down-circle-outline"
              size={18}
              color="#FFFFFF"
            />
            <Text className="mt-1 text-center text-xs font-semibold text-white">
              {shouldMarkBelowAsRead
                ? "Mark Below as Read"
                : "Mark Below as Unread"}
            </Text>
          </View>
        </PressableScale>
      ) : (
        <View
          style={{ width: SWIPE_ACTION_COLUMN_WIDTH }}
          className="h-full items-center justify-center rounded-xl bg-[#1A1B1E]"
        >
          <Ionicons
            name="remove-circle-outline"
            size={18}
            color="#7E808A"
          />
          <Text className="mt-1 text-center text-xs font-semibold text-[#7E808A]">
            No Below
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <Swipeable
      enabled={!isMutationPending}
      friction={1.6}
      rightThreshold={40}
      dragOffsetFromRightEdge={18}
      dragOffsetFromLeftEdge={18}
      overshootRight={false}
      containerStyle={{ borderRadius: 12 }}
      renderRightActions={renderRightActions}
    >
      <View className="rounded-xl border border-[#2A2A2E] bg-[#1A1B1E] px-3 py-3">
        <GesturePressable
          hitSlop={4}
          onPress={onPress}
        >
          <View>
            <View className="flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-sm font-medium text-white">
                {item.title}
              </Text>
              <View
                className={`rounded-full px-2 py-0.5 ${
                  isChapterRead
                    ? "border border-[#27553A] bg-[#173224]"
                    : "border border-[#2A2A2E] bg-[#141519]"
                }`}
              >
                <Text
                  className={`text-[10px] font-semibold ${
                    isChapterRead ? "text-[#7BEEB0]" : "text-[#9B9CA6]"
                  }`}
                >
                  {isChapterRead ? "Read" : "Unread"}
                </Text>
              </View>
            </View>

            {formatChapterMeta(item) ? (
              <Text className="mt-1 text-xs text-[#9B9CA6]">
                {formatChapterMeta(item)}
              </Text>
            ) : null}
          </View>
        </GesturePressable>
      </View>
    </Swipeable>
  );
}
