import { memo, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image as RNImage,
  Pressable,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import type { ReaderFlatPage } from "../types/reader.types";
import {
  getCachedPageDimensions,
  setCachedPageDimensions,
} from "../utils/pageDimensionCache";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface ReaderPageItemProps {
  page: ReaderFlatPage;
  onTap: () => void;
}

const ReaderPageItemComponent = ({ page, onTap }: ReaderPageItemProps) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(
    () => getCachedPageDimensions(page.imageUrl) ?? null
  );
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = getCachedPageDimensions(page.imageUrl);
    if (cached) {
      setDimensions(cached);
      return;
    }

    RNImage.getSizeWithHeaders(
      page.imageUrl,
      page.headers ?? {},
      (width, height) => {
        const measured = { width, height };
        setCachedPageDimensions(page.imageUrl, measured);
        setDimensions(measured);
      },
      () => {
        setFailed(true);
      }
    );
  }, [page.headers, page.imageUrl]);

  const estimatedHeight = useMemo(() => {
    if (!dimensions || !Number.isFinite(dimensions.width) || dimensions.width <= 0) {
      return SCREEN_HEIGHT * 0.8;
    }

    return SCREEN_WIDTH * (dimensions.height / dimensions.width);
  }, [dimensions]);

  return (
    <Pressable onPress={onTap}>
      <View style={{ width: SCREEN_WIDTH, height: estimatedHeight }} className="bg-black">
        {!loaded && !failed ? (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator color="#67A4FF" />
          </View>
        ) : null}

        <Image
          source={{ uri: page.imageUrl, headers: page.headers }}
          contentFit="contain"
          transition={120}
          style={{ width: "100%", height: "100%" }}
          recyclingKey={page.key}
          onLoad={() => {
            setLoaded(true);
            setFailed(false);
          }}
          onError={() => {
            setFailed(true);
            setLoaded(true);
          }}
        />

        {failed ? (
          <View className="absolute inset-0 items-center justify-center bg-black/70">
            <Text className="text-xs text-[#C8C9D2]">Failed to load page</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};

export const ReaderPageItem = memo(ReaderPageItemComponent);
