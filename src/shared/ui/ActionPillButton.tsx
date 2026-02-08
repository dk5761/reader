import { Button } from "heroui-native";

export interface ActionPillButtonProps {
  label: string;
  onPress: () => void;
  compact?: boolean;
}

export const ActionPillButton = ({
  label,
  onPress,
  compact = false,
}: ActionPillButtonProps) => {
  return (
    <Button
      onPress={onPress}
      size={compact ? "sm" : "md"}
      variant="secondary"
      className="rounded-full"
      pressableFeedbackVariant="none"
    >
      <Button.Label className="text-white">{label}</Button.Label>
    </Button>
  );
};
