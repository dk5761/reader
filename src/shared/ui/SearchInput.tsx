import { Input } from "heroui-native";
import type { TextInputProps } from "react-native";
import { View } from "react-native";

export interface SearchInputProps
  extends Pick<
    TextInputProps,
    | "value"
    | "onChangeText"
    | "placeholder"
    | "autoFocus"
    | "returnKeyType"
    | "onSubmitEditing"
    | "editable"
  > {}

export const SearchInput = ({
  value,
  onChangeText,
  placeholder = "Search",
  autoFocus,
  returnKeyType = "search",
  onSubmitEditing,
  editable = true,
}: SearchInputProps) => {
  return (
    <View>
      <Input
        className="border border-[#2A2A2E] bg-[#1A1B1E] text-white"
        variant="secondary"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        isDisabled={!editable}
      />
    </View>
  );
};
