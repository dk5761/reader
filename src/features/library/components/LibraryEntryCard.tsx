import type { LibraryEntryWithCategories } from "@/services/library";
import { MangaGridCard } from "@/shared/ui";

interface LibraryEntryCardProps {
  entry: LibraryEntryWithCategories;
  width: number;
  isSelectMode: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

export const LibraryEntryCard = ({
  entry,
  width,
  isSelectMode,
  isSelected,
  onPress,
  onLongPress,
}: LibraryEntryCardProps) => {
  return (
    <MangaGridCard
      width={width}
      title={entry.title}
      thumbnailUrl={entry.thumbnailUrl}
      isSelectMode={isSelectMode}
      isSelected={isSelected}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
};
