import { useMemo, useState } from "react";
import { Pressable, Text } from "react-native";

interface CollapsibleTextProps {
  text: string;
  collapsedLines?: number;
  textClassName?: string;
}

export const CollapsibleText = ({
  text,
  collapsedLines = 3,
  textClassName = "",
}: CollapsibleTextProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const normalizedText = useMemo(() => text.trim(), [text]);

  if (!normalizedText) {
    return null;
  }

  return (
    <Pressable
      onPress={() => {
        setIsExpanded((current) => !current);
      }}
      accessibilityRole="button"
      accessibilityLabel={isExpanded ? "Collapse description" : "Expand description"}
    >
      <Text
        numberOfLines={isExpanded ? undefined : Math.max(1, collapsedLines)}
        className={textClassName}
      >
        {normalizedText}
      </Text>
    </Pressable>
  );
};

