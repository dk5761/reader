import type { ReaderPage as ReaderPageType } from "@/services/reader";
import { useMemo } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { ProgressiveImage } from "./ProgressiveImage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface ReaderPageProps {
  page: ReaderPageType;
}

export function ReaderPageComponent({ page }: ReaderPageProps) {
  // Use pre-fetched dimensions if available
  const aspectRatio = useMemo(() => {
    if (page.width && page.height) {
      return page.width / page.height;
    }
    return undefined;
  }, [page.width, page.height]);

  // Calculate expected height based on screen width and aspect ratio
  const expectedHeight = aspectRatio ? SCREEN_WIDTH / aspectRatio : undefined;

  // Placeholder height: use 85% of expected height to reduce jump when image loads
  const placeholderHeight = expectedHeight
    ? expectedHeight * 0.85
    : SCREEN_HEIGHT * 0.85;

  return (
    <View style={styles.container}>
      <ProgressiveImage
        uri={page.imageUrl}
        headers={page.headers}
        width={SCREEN_WIDTH}
        aspectRatio={aspectRatio}
        placeholderHeight={placeholderHeight}
        label={`page ${page.index + 1}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    backgroundColor: "#0F0F12",
  },
});
