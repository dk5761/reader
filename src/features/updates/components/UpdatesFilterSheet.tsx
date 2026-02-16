import { BottomSheet } from "heroui-native";
import { ScrollView, Text, View } from "react-native";
import { SelectableChip } from "@/shared/ui";

interface UpdatesFilterSheetProps {
  isOpen: boolean;
  onOpenChange: (next: boolean) => void;
  sources: { id: string; name: string }[];
  selectedSourceId: string | null;
  onSelectSource: (sourceId: string | null) => void;
  todayOnly: boolean;
  onToggleToday: () => void;
  unreadOnly: boolean;
  onToggleUnread: () => void;
}

const SectionLabel = ({ label }: { label: string }) => (
  <Text className="text-sm font-semibold uppercase tracking-wide text-[#8F91A1]">
    {label}
  </Text>
);

export const UpdatesFilterSheet = ({
  isOpen,
  onOpenChange,
  sources,
  selectedSourceId,
  onSelectSource,
  todayOnly,
  onToggleToday,
  unreadOnly,
  onToggleUnread,
}: UpdatesFilterSheetProps) => {
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={["68%"]}
          enablePanDownToClose
          contentContainerClassName="p-0 pb-safe-offset-2 bg-transparent"
          backgroundClassName="rounded-t-[28px] border border-[#2A2A2E] bg-[#15161A]"
          className="bg-transparent"
        >
          <View className="gap-1 px-3 pb-3 pt-1">
            <BottomSheet.Title className="text-xl font-bold text-white">
              Updates Filters
            </BottomSheet.Title>
            <BottomSheet.Description className="text-sm text-[#9B9CA6]">
              Filter update feed by source, day, and unread state.
            </BottomSheet.Description>
          </View>

          <ScrollView
            className="max-h-[60vh] px-3"
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-5">
              <View className="gap-2">
                <SectionLabel label="Source" />
                <View className="flex-row flex-wrap gap-2">
                  <SelectableChip
                    label="All Sources"
                    selected={selectedSourceId === null}
                    onPress={() => onSelectSource(null)}
                  />
                  {sources.map((source) => (
                    <SelectableChip
                      key={source.id}
                      label={source.name}
                      selected={selectedSourceId === source.id}
                      onPress={() => onSelectSource(source.id)}
                    />
                  ))}
                </View>
              </View>

              <View className="gap-2">
                <SectionLabel label="Time" />
                <View className="flex-row flex-wrap gap-2">
                  <SelectableChip
                    label="Today"
                    selected={todayOnly}
                    onPress={onToggleToday}
                  />
                </View>
              </View>

              <View className="gap-2">
                <SectionLabel label="State" />
                <View className="flex-row flex-wrap gap-2">
                  <SelectableChip
                    label="Unread"
                    selected={unreadOnly}
                    onPress={onToggleUnread}
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
};
