import type { ReaderPage as ReaderPageType } from "@/services/reader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Image, StyleSheet, Text, View } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface ReaderPageProps {
  page: ReaderPageType;
}

export function ReaderPageComponent({ page }: ReaderPageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Use pre-fetched dimensions from the page if available
  const preFetchedDimensions = useMemo(() => {
    if (page.width && page.height) {
      return { width: page.width, height: page.height };
    }
    return null;
  }, [page.width, page.height]);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    // Reset dimensions only if not using pre-fetched
    if (!preFetchedDimensions) {
      setImageDimensions(null);
    }
  }, [page.imageUrl, preFetchedDimensions]);

  // Fetch image dimensions only if not pre-fetched
  const fetchImageDimensions = useCallback(() => {
    if (preFetchedDimensions) return;

    Image.getSize(
      page.imageUrl,
      (width, height) => {
        setImageDimensions({ width, height });
      },
      () => {
        // On error, we'll let the image load naturally
      },
    );
  }, [page.imageUrl, preFetchedDimensions]);

  useEffect(() => {
    fetchImageDimensions();
  }, [fetchImageDimensions]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // Use pre-fetched dimensions first, fall back to fetched, then to undefined
  const dimensions = preFetchedDimensions || imageDimensions;

  // Calculate aspect ratio for the image
  const aspectRatio = dimensions
    ? dimensions.width / dimensions.height
    : undefined;

  // Calculate expected height based on screen width and aspect ratio
  const expectedHeight = aspectRatio ? SCREEN_WIDTH / aspectRatio : undefined;

  // Placeholder height: use 85% of expected height to reduce jump when image loads
  const placeholderHeight = expectedHeight
    ? expectedHeight * 0.85
    : SCREEN_HEIGHT * 0.85;

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={[styles.placeholder, { height: placeholderHeight }]}>
          <Text className="text-xs text-[#9B9CA6]">Page {page.index + 1}</Text>
        </View>
      )}
      {hasError ? (
        <View style={styles.errorContainer}>
          <Text className="text-xs text-red-400">Failed to load image</Text>
        </View>
      ) : (
        <Image
          source={{ uri: page.imageUrl, headers: page.headers }}
          style={[
            styles.image,
            expectedHeight ? { height: expectedHeight } : null,
          ]}
          resizeMode="contain"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    backgroundColor: "#0F0F12",
  },
  placeholder: {
    width: SCREEN_WIDTH,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#16171A",
  },
  errorContainer: {
    width: SCREEN_WIDTH,
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#16171A",
  },
  image: {
    width: SCREEN_WIDTH,
    // Height will be set based on aspect ratio after dimensions are fetched
  },
});
