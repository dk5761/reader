import { Text, View } from "react-native";
import type { SourceDescriptor } from "@/services/source";
import { SelectableChip } from "@/shared/ui";

interface GlobalSearchSourceSelectorProps {
  sources: SourceDescriptor[];
  selectedSourceIds: string[];
  onChangeSelectedSourceIds: (sourceIds: string[]) => void;
  disabled?: boolean;
}

export const GlobalSearchSourceSelector = ({
  sources,
  selectedSourceIds,
  onChangeSelectedSourceIds,
  disabled = false,
}: GlobalSearchSourceSelectorProps) => {
  const selectedSourceIdSet = new Set(selectedSourceIds);
  const allSourceIds = sources.map((source) => source.id);
  const allSelected = allSourceIds.length > 0 && selectedSourceIds.length === allSourceIds.length;

  return (
    <View>
      <Text className="mb-2 text-xs text-[#8B8D98]">Sources</Text>
      <View className="flex-row flex-wrap gap-2">
        <SelectableChip
          label="All"
          selected={allSelected}
          onPress={() => {
            if (disabled || allSelected) {
              return;
            }

            onChangeSelectedSourceIds(allSourceIds);
          }}
        />

        {sources.map((source) => {
          const isSelected = selectedSourceIdSet.has(source.id);
          const isLastSelected = selectedSourceIds.length === 1 && isSelected;

          return (
            <SelectableChip
              key={source.id}
              label={source.name}
              selected={isSelected}
              onPress={() => {
                if (disabled) {
                  return;
                }

                if (isSelected) {
                  if (isLastSelected) {
                    return;
                  }

                  onChangeSelectedSourceIds(
                    selectedSourceIds.filter((sourceId) => sourceId !== source.id)
                  );
                  return;
                }

                onChangeSelectedSourceIds([...selectedSourceIds, source.id]);
              }}
            />
          );
        })}
      </View>
    </View>
  );
};
