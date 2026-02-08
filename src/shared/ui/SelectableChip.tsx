import { Chip } from "heroui-native";

export interface SelectableChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export const SelectableChip = ({
  label,
  selected,
  onPress,
}: SelectableChipProps) => {
  return (
    <Chip
      onPress={onPress}
      size="md"
      variant={selected ? "soft" : "secondary"}
      color={selected ? "accent" : "default"}
      className="rounded-full"
      animation="disable-all"
    >
      <Chip.Label className={selected ? "text-[#84B6FF]" : "text-[#C8C9D2]"}>
        {label}
      </Chip.Label>
    </Chip>
  );
};
