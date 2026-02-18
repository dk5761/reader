import { Image, useImage } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface ProgressiveImageProps {
  uri: string;
  headers?: Record<string, string>;
  width?: number;
  height?: number;
  aspectRatio?: number;
  placeholderHeight?: number;
  label?: string;
  onProgress?: (progress: number) => void;
}

export function ProgressiveImage({
  uri,
  headers,
  width,
  height: propHeight,
  aspectRatio,
  placeholderHeight = 200,
  label,
  onProgress,
}: ProgressiveImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // useImage only accepts onError/onLoad callbacks — no maxWidth option
  const imageResult = useImage(uri, {
    onError(error) {
      console.warn("[ProgressiveImage] useImage error:", error.message);
    },
  });

  const imageNativeWidth = imageResult?.width;
  const imageNativeHeight = imageResult?.height;

  // Resolve aspect ratio: prop > derived from natural dimensions
  const resolvedAspectRatio =
    aspectRatio ??
    (imageNativeWidth && imageNativeHeight
      ? imageNativeWidth / imageNativeHeight
      : undefined);

  // Resolve height: prop > derived from width + aspect ratio > placeholder fallback
  const calculatedHeight =
    propHeight ??
    (resolvedAspectRatio && width
      ? width / resolvedAspectRatio
      : placeholderHeight);

  // Reset state whenever the URI changes
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setDownloadProgress(0);
  }, [uri]);

  const handleProgress = useCallback(
    (event: { loaded: number; total: number }) => {
      const { loaded, total } = event;
      if (total > 0) {
        const progress = Math.round((loaded / total) * 100);
        setDownloadProgress(Math.min(progress, 99));
        onProgress?.(progress);
      }
    },
    [onProgress],
  );

  const handleLoad = useCallback(() => {
    setDownloadProgress(100);
    // Brief pause so the user sees 100 before the image fades in
    setTimeout(() => setIsLoading(false), 300);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const showOverlay = isLoading || hasError;

  return (
    <View style={[styles.container, { height: calculatedHeight }]}>
      {/* Overlay: loading counter OR error message */}
      {showOverlay && (
        <View
          style={[
            StyleSheet.absoluteFill,
            hasError ? styles.errorContainer : styles.loadingContainer,
          ]}
        >
          {hasError ? (
            <Text className="text-xs text-red-400">Failed to load image</Text>
          ) : (
            <>
              <Text className="text-lg font-medium text-white">
                {downloadProgress}
              </Text>
              <Text className="text-xs text-[#9B9CA6] tracking-widest uppercase">
                loading
              </Text>
              {label && (
                <Text className="mt-2 text-sm text-[#9B9CA6]">{label}</Text>
              )}
            </>
          )}
        </View>
      )}

      {/* Image — only mount once useImage has resolved dimensions */}
      {imageResult && (
        <Image
          source={{ uri, headers }}
          style={[StyleSheet.absoluteFill, { opacity: isLoading ? 0 : 1 }]}
          contentFit="contain"
          onProgress={handleProgress}
          onLoad={handleLoad}
          onError={handleError}
          transition={200}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#0F0F12",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#16171A",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#16171A",
  },
});
