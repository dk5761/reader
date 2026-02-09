import { BottomSheet, Button } from "heroui-native";
import { ScrollView, Text, View } from "react-native";
import type {
  LibrarySortDirection,
  LibrarySortKey,
  LibraryStatusFilter,
} from "@/services/library";
import { SelectableChip } from "@/shared/ui";

const SORT_OPTIONS: { key: LibrarySortKey; label: string }[] = [
  { key: "updatedAt", label: "Updated" },
  { key: "addedAt", label: "Added" },
  { key: "title", label: "Title" },
  { key: "lastReadAt", label: "Last Read" },
];

const STATUS_OPTIONS: { key: LibraryStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ongoing", label: "Ongoing" },
  { key: "completed", label: "Completed" },
  { key: "hiatus", label: "Hiatus" },
  { key: "unknown", label: "Unknown" },
];

interface LibraryFilterSheetProps {
  isOpen: boolean;
  onOpenChange: (next: boolean) => void;
  sortKey: LibrarySortKey;
  sortDirection: LibrarySortDirection;
  statusFilter: LibraryStatusFilter;
  sourceFilterIds: string[];
  sources: { id: string; name: string }[];
  onChangeSortKey: (next: LibrarySortKey) => void;
  onChangeSortDirection: (next: LibrarySortDirection) => void;
  onChangeStatus: (next: LibraryStatusFilter) => void;
  onToggleSource: (sourceId: string) => void;
  onResetSources: () => void;
}

const SectionLabel = ({ label }: { label: string }) => (
  <Text className="text-sm font-semibold uppercase tracking-wide text-[#8F91A1]">
    {label}
  </Text>
);

export const LibraryFilterSheet = ({
  isOpen,
  onOpenChange,
  sortKey,
  sortDirection,
  statusFilter,
  sourceFilterIds,
  sources,
  onChangeSortKey,
  onChangeSortDirection,
  onChangeStatus,
  onToggleSource,
  onResetSources,
}: LibraryFilterSheetProps) => {
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={["80%"]}
          enablePanDownToClose
          contentContainerClassName="p-0 pb-safe-offset-2 bg-transparent"
          backgroundClassName="rounded-t-[28px] border border-[#2A2A2E] bg-[#15161A]"
          className="bg-transparent"
        >
          <View className="gap-1 px-3 pb-3 pt-1">
            <BottomSheet.Title className="text-xl font-bold text-white">
              Library Filters
            </BottomSheet.Title>
            <BottomSheet.Description className="text-sm text-[#9B9CA6]">
              Update sorting, status, and source filters.
            </BottomSheet.Description>
          </View>

          <ScrollView
            className="max-h-[72vh] px-3"
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-5">
              <View className="gap-2">
                <SectionLabel label="Sort By" />
                <View className="flex-row flex-wrap gap-2">
                  {SORT_OPTIONS.map((option) => (
                    <SelectableChip
                      key={option.key}
                      label={option.label}
                      selected={sortKey === option.key}
                      onPress={() => onChangeSortKey(option.key)}
                    />
                  ))}
                </View>
              </View>

              <View className="gap-2">
                <SectionLabel label="Order" />
                <View className="flex-row flex-wrap gap-2">
                  <SelectableChip
                    label="Asc"
                    selected={sortDirection === "asc"}
                    onPress={() => onChangeSortDirection("asc")}
                  />
                  <SelectableChip
                    label="Desc"
                    selected={sortDirection === "desc"}
                    onPress={() => onChangeSortDirection("desc")}
                  />
                </View>
              </View>

              <View className="gap-2">
                <SectionLabel label="Status" />
                <View className="flex-row flex-wrap gap-2">
                  {STATUS_OPTIONS.map((option) => (
                    <SelectableChip
                      key={option.key}
                      label={option.label}
                      selected={statusFilter === option.key}
                      onPress={() => onChangeStatus(option.key)}
                    />
                  ))}
                </View>
              </View>

              <View className="gap-2">
                <View className="flex-row items-center justify-between gap-3">
                  <SectionLabel label="Sources" />
                  {sourceFilterIds.length > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full"
                      onPress={onResetSources}
                    >
                      <Button.Label className="text-[#84B6FF]">
                        Clear
                      </Button.Label>
                    </Button>
                  ) : null}
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <SelectableChip
                    label="All Sources"
                    selected={sourceFilterIds.length === 0}
                    onPress={onResetSources}
                  />
                  {sources.map((source) => (
                    <SelectableChip
                      key={source.id}
                      label={source.name}
                      selected={sourceFilterIds.includes(source.id)}
                      onPress={() => onToggleSource(source.id)}
                    />
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
};
