import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { LibraryCategory } from "@/services/library";
import { ActionPillButton, SelectableChip } from "@/shared/ui";

interface CategoryPickerModalProps {
  visible: boolean;
  title: string;
  categories: LibraryCategory[];
  selectedCategoryIds: number[];
  confirmLabel: string;
  isSubmitting?: boolean;
  allowCreate?: boolean;
  onChangeSelectedCategoryIds: (nextCategoryIds: number[]) => void;
  onClose: () => void;
  onConfirm: () => void;
  onCreateCategory?: (name: string) => void;
}

export const CategoryPickerModal = ({
  visible,
  title,
  categories,
  selectedCategoryIds,
  confirmLabel,
  isSubmitting = false,
  allowCreate = false,
  onChangeSelectedCategoryIds,
  onClose,
  onConfirm,
  onCreateCategory,
}: CategoryPickerModalProps) => {
  const [draftName, setDraftName] = useState("");

  const handleToggle = (categoryId: number) => {
    if (selectedCategoryIds.includes(categoryId)) {
      onChangeSelectedCategoryIds(
        selectedCategoryIds.filter((selectedId) => selectedId !== categoryId)
      );
      return;
    }

    onChangeSelectedCategoryIds([...selectedCategoryIds, categoryId]);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/60 p-4">
        <View className="rounded-2xl border border-[#2A2A2E] bg-[#17181B] p-4">
          <Text className="text-base font-semibold text-white">{title}</Text>

          {allowCreate ? (
            <View className="mt-3 flex-row items-center gap-2">
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="New category"
                placeholderTextColor="#7D7F8A"
                className="flex-1 rounded-full border border-[#2A2A2E] bg-[#111214] px-4 py-2 text-white"
              />
              <ActionPillButton
                compact
                label="Add"
                onPress={() => {
                  const nextName = draftName.trim();
                  if (!nextName || !onCreateCategory) {
                    return;
                  }

                  onCreateCategory(nextName);
                  setDraftName("");
                }}
              />
            </View>
          ) : null}

          <ScrollView
            className="mt-3 max-h-56"
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-row flex-wrap gap-2">
              {categories.map((category) => (
                <SelectableChip
                  key={category.id}
                  label={category.name}
                  selected={selectedCategoryIds.includes(category.id)}
                  onPress={() => handleToggle(category.id)}
                />
              ))}
            </View>
          </ScrollView>

          <View className="mt-4 flex-row items-center justify-end gap-2">
            <Pressable onPress={onClose}>
              <View className="rounded-full border border-[#2A2A2E] px-4 py-2">
                <Text className="text-sm text-[#B5B6BF]">Cancel</Text>
              </View>
            </Pressable>
            <ActionPillButton
              label={isSubmitting ? "Saving..." : confirmLabel}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};
